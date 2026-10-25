package noskillsserverfx

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/logfx"
)

// handleAttach is a RouteRaw handler for /attach/{slug}/{sid}.
// It upgrades the HTTP/3 request to a WebTransport session and brokers
// messages between the WT client and the session's worker.
//
// Protocol:
//  1. Upgrade HTTP/3 → WebTransport
//  2. GetOrCreate session (spawn worker + pump goroutine on first attach)
//  3. Accept bidi stream from client
//  4. Register with broadcaster (events buffer while replaying)
//  5. Replay ledger (transcript_replay_start … lines … transcript_replay_end)
//  6. Join a mux session's frames (remoteMuxWorker), with a socket of its own
//  7. Enter live mode: goroutine forwards worker events and mux frames;
//     scanner reads client messages
func (s *Server) handleAttach(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	slug := r.PathValue("slug")
	sid := r.PathValue("sid")

	if slug == "" || sid == "" {
		http.Error(w, "missing slug or sid", http.StatusBadRequest)

		return
	}

	// ?after=<n> lets a reconnecting client skip the ledger lines it has
	// already seen. The value is the last seq the client received, which
	// counts ledger lines only (0 = full replay).
	var afterSeq int64
	if afterStr := r.URL.Query().Get("after"); afterStr != "" {
		if n, err := strconv.ParseInt(afterStr, 10, 64); err == nil && n >= 0 {
			afterSeq = n
		}
	}

	// ?kind=mux selects a terminal-multiplexer worker; default is the agent
	// worker. Only honoured on first attach (when the worker is spawned).
	kind := r.URL.Query().Get("kind")

	sess, err := s.h3svc.Upgrader().Upgrade(w, r)
	if errors.Is(err, httpfx.ErrWebTransportOriginNotAllowed) {
		http.Error(w, "WebTransport upgrade refused: origin not allowed", http.StatusForbidden)

		return
	}

	if err != nil {
		http.Error(w, fmt.Sprintf("WebTransport upgrade failed: %v", err), http.StatusBadRequest)

		return
	}

	entry, isNew, err := s.sessions.GetOrCreate(ctx, slug, sid, kind)
	if err != nil {
		_ = sess.CloseWithError(1, fmt.Sprintf("session error: %v", err))

		return
	}

	if isNew {
		if startErr := entry.Worker.SendQueryStart(ctx, entry.Root, sid, ""); startErr != nil {
			// The session is unusable. Drop it so the next attach starts over,
			// and end its worker; the pump then closes the ledger and the
			// broadcaster.
			s.sessions.Remove(slug, sid)

			if closeErr := entry.Worker.Close(); closeErr != nil {
				s.logger.WarnContext(ctx, "wt_attach: close worker after a failed start", "sid", sid, "err", closeErr)
			}

			_ = sess.CloseWithError(1, fmt.Sprintf("worker start failed: %v", startErr))

			return
		}
	}

	// AcceptStream blocks until the client opens a bidi stream.
	stream, err := sess.AcceptStream(ctx)
	if err != nil {
		_ = sess.CloseWithError(1, fmt.Sprintf("stream accept failed: %v", err))

		return
	}

	// Every write to the client goes through out, so a client that stops
	// reading holds a write for attachWriteTimeout at most.
	out := boundedWriter{stream: stream, timeout: attachWriteTimeout}
	enc := json.NewEncoder(out)

	// seq is the number of the last ledger line this client has been sent:
	// replayed lines and live events are ledger lines, and each carries its
	// line number. The replay's start and end lines, mux frames and an event
	// the ledger refused are not; they carry seq without advancing it, so the
	// last seq a client saw is always the ?after= that resumes it without a
	// gap or a repeat.
	seq := afterSeq

	// cut is where the replay stopped in the session's own ledger, which
	// tells the live forwarder which events the replay already sent.
	var cut replayCut

	// Register with the broadcaster BEFORE replaying the ledger so that any
	// live events arriving during replay are buffered in clientCh (not dropped).
	// The deferred Unregister covers a failed replay and a panic; live mode
	// unregisters before it waits for the forwarder, and Unregister is
	// idempotent.
	clientID := newSessionID()
	clientCh := entry.Broadcaster.Register(clientID)
	defer entry.Broadcaster.Unregister(clientID)

	// closeAfterFailedWrite ends an attach whose client did not take a write.
	// The client has gone, or it stopped reading and is cut off here; there is
	// nobody to answer either way, so this is not logged as an error.
	closeAfterFailedWrite := func(stage string, err error) {
		s.logger.DebugContext(ctx, "wt_attach: write to the client failed, closing the attach",
			"sid", sid, "stage", stage, "err", err)

		_ = sess.CloseWithError(1, "client stopped reading")
	}

	// ── Ledger replay ─────────────────────────────────────────────────────
	// Send historical events so the client can reconstruct prior transcript.
	// The first failed write ends the attach, since every later one would
	// fail the same way.
	writeErr := wtSend(enc, seq, map[string]any{"type": "transcript_replay_start"})

	if writeErr == nil {
		// replayWithForkAwareness assigns stable 1-based seq numbers to each
		// line. Lines with seq ≤ afterSeq are counted but not sent (reconnect
		// fast-path). totalLines and ownLines, the session's own ledger lines
		// the replay covered, let the live forwarder number events and drop
		// the ones the replay sent.
		totalLines, ownLines, replayErr := replayWithForkAwareness(
			ctx, entry.Ledger, s.config.DataDir, entry.Root, afterSeq,
			func(lineSeq int64, line []byte) bool {
				// A forked session replays its parent's ledger first, and a
				// failure there does not stop the replay of its own lines.
				if writeErr != nil {
					return false
				}

				if _, err := out.Write(append(withSeq(line, lineSeq), '\n')); err != nil {
					writeErr = err

					return false
				}

				seq = lineSeq

				return true
			},
		)
		// A fork whose ancestry breaks off, at an ancestor whose ledger is
		// gone or at a cycle, has had every line below the break replayed,
		// numbered the same on every attach.
		complete := replayErr == nil || errors.Is(replayErr, errForkAncestry)

		switch {
		case complete && replayErr != nil:
			s.logger.ErrorContext(ctx, "wt_attach: fork ancestry replayed only up to a break",
				"sid", sid, "err", replayErr)
		case replayErr != nil && ctx.Err() == nil:
			// The client still gets the live events; its transcript lacks
			// whatever the ledger could not give.
			s.logger.WarnContext(ctx, "wt_attach: ledger replay incomplete", "sid", sid, "err", replayErr)
		}

		// The live events that follow are ledger lines totalLines+1 on. A
		// client that claimed more lines than the ledger holds goes back to
		// its end; after an incomplete replay seq only moves forward.
		if complete || seq < totalLines {
			seq = totalLines
		}

		cut.lines = ownLines
		if complete {
			cut.offset = totalLines - ownLines
		}
	}

	if writeErr == nil {
		writeErr = wtSend(enc, seq, map[string]any{"type": "transcript_replay_end"})
	}

	if writeErr != nil {
		closeAfterFailedWrite("replay", writeErr)

		return
	}

	// ── Mux frames ────────────────────────────────────────────────────────
	// A mux session's frames reach this client through a socket of its own
	// rather than the broadcaster, so the mux server paces its screens by
	// how far behind the client is. They start once the client's attach
	// frame, read below, has made the server send a full scene.
	var remote *queuedSocket

	muxWorker, isMux := entry.Worker.(remoteMuxWorker)
	if isMux {
		remote = newQueuedSocket()
		muxWorker.joinRemote(remote)
	}

	// ── Live mode ─────────────────────────────────────────────────────────
	// The forwarder sends worker events and mux frames to the client. It
	// stops when clientCh closes, because the worker exited
	// (broadcaster.Close) or this handler unregistered below, when the mux
	// socket fell behind, or when a write fails. Either way it closes the
	// WebTransport session, which also ends the read loop below. The handler
	// waits for it, so nothing writes to the stream after the handler returns.
	forwarded := make(chan struct{})

	go func() {
		defer close(forwarded)

		if err := forwardEvents(ctx, out, &seq, cut, clientCh, remote, s.logger); err != nil {
			closeAfterFailedWrite("live", err)

			return
		}

		// Channel closed → session ended; signal the client.
		_ = sess.CloseWithError(0, "session_ended")
	}()

	// Client → worker: read newline-delimited JSON from the bidi stream.
	// Exits when the WT session is closed (client disconnect or the
	// forwarder), or at a line longer than attachMaxLine.
	scanner := bufio.NewScanner(stream)
	scanner.Buffer(make([]byte, 0, attachLineBuffer), attachMaxLine)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		dispatchClientMessage(ctx, line, entry, s.logger)
	}

	if errors.Is(scanner.Err(), bufio.ErrTooLong) {
		s.logger.WarnContext(ctx, "wt_attach: client sent a line over the limit, closing the attach",
			"sid", sid, "limit", attachMaxLine)
	}

	if isMux {
		muxWorker.leaveRemote(remote)
		remote.close()
	}

	// Unregistering closes clientCh: the forwarder delivers what is still
	// buffered, each write bounded by attachWriteTimeout, and returns.
	entry.Broadcaster.Unregister(clientID)
	<-forwarded
}

// attachWriteTimeout bounds each write to an attached client. A QUIC stream
// write waits only while the client's flow-control window is full or the
// connection is congested, so a write that waits this long means the client
// stopped reading. Its attach then ends, and the client can reattach with
// ?after=.
const attachWriteTimeout = 30 * time.Second

const (
	// attachMaxLine is the longest line a client may send, as large as a
	// /mux WebSocket frame: a mux paste of a large text is the biggest one.
	attachMaxLine = muxSocketMaxFrame
	// attachLineBuffer is the line buffer an attach starts with.
	attachLineBuffer = 64 * 1024
)

// deadlineWriter is the write side of an attach stream.
type deadlineWriter interface {
	io.Writer
	SetWriteDeadline(t time.Time) error
}

// boundedWriter gives every Write to stream a deadline timeout from now.
type boundedWriter struct {
	stream  deadlineWriter
	timeout time.Duration
}

func (b boundedWriter) Write(p []byte) (int, error) {
	if err := b.stream.SetWriteDeadline(time.Now().Add(b.timeout)); err != nil {
		return 0, fmt.Errorf("set write deadline: %w", err)
	}

	n, err := b.stream.Write(p)
	if err != nil {
		return n, fmt.Errorf("write to attach stream: %w", err)
	}

	return n, nil
}

// remoteMuxWorker is a worker whose mux frames go to each attached client
// through a socket of its own: the mux worker.
type remoteMuxWorker interface {
	joinRemote(socket muxSocket)
	leaveRemote(socket muxSocket)
}

// replayCut is where an attach's replay stopped in the session's own ledger.
type replayCut struct {
	// lines is how many of the ledger's lines the replay covered. A live
	// event written as one of them has been replayed, or skipped by ?after=.
	lines int64
	// offset turns the number of a line of the ledger into the seq the replay
	// gives it: 0, or for a fork the parent lines it replays first, less the
	// fork's header line, which is not replayed.
	offset int64
}

// errMuxClientBehind ends an attach whose client fell so far behind that its
// mux socket's queue filled. The client reattaches and gets a full scene.
var errMuxClientBehind = errors.New("the client fell behind the mux session")

// errClientMissedEvents ends an attach whose client did not get a ledger line
// live, as when its event buffer was full. Sending the lines after it would
// move the client's seq past it, so it reattaches with ?after= instead and
// gets it from the replay.
var errClientMissedEvents = errors.New("the client missed a session event")

// forwardEvents writes each event from events to the client as one JSON line,
// translated to the client wire protocol, and each frame queued on remote, a
// mux session's socket (nil for other sessions), as a mux line, until events
// is closed, which returns nil, remote fell behind, or a write fails, which
// returns its error. out is a boundedWriter, so a client that stops reading
// ends the loop within attachWriteTimeout.
//
// seq is the number of the last ledger line the client has been sent. An
// event carries the ledger line SessionEntry.publish wrote it as, which sets
// seq; one written as a line the replay covered (cut) was sent already and is
// dropped, and one past a line the client never got returns
// errClientMissedEvents. An event with no line, which the ledger refused, and
// a mux frame carry seq unchanged.
func forwardEvents(
	ctx context.Context,
	out io.Writer,
	seq *int64,
	cut replayCut,
	events <-chan WorkerEvent,
	remote *queuedSocket,
	logger *logfx.Logger,
) error {
	enc := json.NewEncoder(out)

	var (
		frames  <-chan []byte
		stopped <-chan struct{}
		line    []byte
	)

	if remote != nil {
		frames, stopped = remote.frames(), remote.stopped()
	}

	// sent is the session's own ledger line the client has up to.
	sent := cut.lines

	for {
		select {
		case evt, ok := <-events:
			if !ok {
				return nil
			}

			switch {
			case evt.Line == 0:
			case evt.Line <= sent:
				continue
			case evt.Line > sent+1:
				return fmt.Errorf("ledger line %d after line %d: %w", evt.Line, sent, errClientMissedEvents)
			default:
				sent = evt.Line
				*seq = max(*seq, evt.Line+cut.offset)
			}

			msg := translateWorkerEvent(ctx, evt, logger)
			if msg == nil {
				continue
			}

			if err := wtSend(enc, *seq, msg); err != nil {
				return fmt.Errorf("send %q event: %w", evt.Type, err)
			}
		case frame := <-frames:
			line = appendMuxLine(line[:0], *seq, frame)

			if _, err := out.Write(line); err != nil {
				return fmt.Errorf("send a mux frame: %w", err)
			}

			remote.drained()
		case <-stopped:
			if remote.fellBehind() {
				return errMuxClientBehind
			}

			// The session is closing; its events end the loop.
			frames, stopped = nil, nil
		}
	}
}

// appendMuxLine appends the line that carries a mux server frame to a
// client, {"type":"mux","v":1,"seq":N,"frame":FRAME} and a newline, with the
// frame's encoded bytes as they are, so a frame is encoded once and never
// parsed again on its way out. N is the number of the last ledger line the
// client has been sent, since a frame is not a ledger line.
func appendMuxLine(dst []byte, seq int64, frame []byte) []byte {
	dst = append(dst, `{"type":"mux","v":1,"seq":`...)
	dst = strconv.AppendInt(dst, seq, 10)
	dst = append(dst, `,"frame":`...)
	dst = append(dst, frame...)

	return append(dst, "}\n"...)
}

// wtSend encodes msg to enc, injecting "v":1 and "seq" into every
// map[string]any message. seq is the number of the last ledger line the
// client has been sent, including msg when msg is one, so a reconnecting
// client passes the last seq it saw as ?after=<seq>. The ledger format itself
// remains version- and seq-free.
func wtSend(enc *json.Encoder, seq int64, msg any) error {
	if m, ok := msg.(map[string]any); ok {
		m["v"] = 1
		m["seq"] = seq
	}

	return enc.Encode(msg)
}

// withSeq splices a "seq" field into a raw JSON object line immediately after
// the opening '{'. The line must start with '{'; other values are returned
// unchanged. Used to stamp sequence numbers onto verbatim ledger replay bytes
// without a full parse-and-re-encode cycle.
func withSeq(line []byte, seq int64) []byte {
	if len(line) < 2 || line[0] != '{' {
		return line
	}

	prefix := fmt.Appendf(nil, `{"seq":%d,`, seq)

	return append(prefix, line[1:]...)
}
