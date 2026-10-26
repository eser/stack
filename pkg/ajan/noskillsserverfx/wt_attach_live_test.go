package noskillsserverfx

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
	ajanwebtransport "github.com/eser/stack/pkg/ajan/webtransport"
	wt "github.com/quic-go/webtransport-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// attachFixture is a running daemon with an extra route that serves
// handleAttach and reports each time it returns. handleAttach returns only
// after its live event forwarder has, so that report shows nothing is left
// writing to the client.
type attachFixture struct {
	srv      *Server
	client   *ajanwebtransport.Client
	baseURL  string
	headers  http.Header
	returned chan struct{}
}

// startAttachFixture starts the daemon with allowedOrigins as its
// AllowedOrigins.
func startAttachFixture(t *testing.T, allowedOrigins ...string) *attachFixture {
	t.Helper()

	var listenConfig net.ListenConfig

	probe, err := listenConfig.ListenPacket(t.Context(), "udp", "127.0.0.1:0")
	require.NoError(t, err, "find a free UDP port")

	addr := probe.LocalAddr().String()
	require.NoError(t, probe.Close())

	srv := New(&ServerConfig{ //nolint:exhaustruct
		H3Addr:                  addr,
		DataDir:                 t.TempDir(),
		SelfSigned:              true,
		AllowedOrigins:          allowedOrigins,
		GracefulShutdownTimeout: 2 * time.Second,
	}, logfx.NewLogger(logfx.WithWriter(io.Discard)))

	const pin = "424242"

	require.NoError(t, srv.AuthManager().SetupPIN(pin))

	token, err := srv.AuthManager().Login("127.0.0.1", pin)
	require.NoError(t, err)

	returned := make(chan struct{}, 1)

	// Registered before Start, so it runs behind the same middleware chain as
	// /attach.
	srv.Router().RouteRaw("/observed-attach/{slug}/{sid}", func(w http.ResponseWriter, r *http.Request) {
		defer func() { returned <- struct{}{} }()

		srv.handleAttach(w, r)
	})

	cleanup, err := srv.Start(t.Context())
	require.NoError(t, err, "server start")
	t.Cleanup(cleanup)

	client, err := ajanwebtransport.NewClient(
		ajanwebtransport.WithCertHashes([][]byte{srv.Cert().FingerprintBytes}),
		ajanwebtransport.WithDialTimeout(5*time.Second),
	)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = client.Close() // always nil
	})

	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+token.Value)

	return &attachFixture{
		srv:      srv,
		client:   client,
		baseURL:  "https://" + addr + "/observed-attach/proj/",
		headers:  headers,
		returned: returned,
	}
}

// addSession registers a running session of project "proj" whose worker is a
// MockWorkerHandle and whose ledger holds ledgerLines.
func (f *attachFixture) addSession(t *testing.T, sid string, ledgerLines ...string) (*MockWorkerHandle, *SessionEntry) {
	t.Helper()

	ledger, err := openLedger(filepath.Join(t.TempDir(), sid+".jsonl"))
	require.NoError(t, err)

	for _, line := range ledgerLines {
		require.NoError(t, ledger.Append([]byte(line)))
	}

	worker := NewMockWorkerHandle(sid, nil)
	entry := &SessionEntry{ //nolint:exhaustruct
		SID:         sid,
		Slug:        "proj",
		Root:        t.TempDir(),
		Worker:      worker,
		Ledger:      ledger,
		Broadcaster: newFanoutBroadcaster(),
		Pending:     newPendingPermissions(),
	}

	f.srv.sessions.mu.Lock()
	f.srv.sessions.addLocked(sessionKey(entry.Slug, sid), entry)
	f.srv.sessions.mu.Unlock()

	return worker, entry
}

// addWorkerSession registers a running session of project "proj" whose
// worker is worker.
func (f *attachFixture) addWorkerSession(t *testing.T, sid string, worker WorkerHandle) *SessionEntry {
	t.Helper()

	ledger, err := openLedger(filepath.Join(t.TempDir(), sid+".jsonl"))
	require.NoError(t, err)

	entry := &SessionEntry{ //nolint:exhaustruct
		SID:         sid,
		Slug:        "proj",
		Root:        t.TempDir(),
		Worker:      worker,
		Ledger:      ledger,
		Broadcaster: newFanoutBroadcaster(),
		Pending:     newPendingPermissions(),
	}

	f.srv.sessions.mu.Lock()
	f.srv.sessions.addLocked(sessionKey(entry.Slug, sid), entry)
	f.srv.sessions.mu.Unlock()

	return entry
}

// attach dials the observed route for sid and opens the bidi stream the
// daemon accepts. It returns a reader of the JSON lines the daemon sends.
func (f *attachFixture) attach(t *testing.T, sid string) (*ajanwebtransport.Session, func() string) {
	t.Helper()

	sess, err := f.client.ConnectWithHeaders(t.Context(), f.baseURL+sid, f.headers)
	require.NoError(t, err, "attach")

	stream, err := sess.OpenBidiStreamSync(t.Context())
	require.NoError(t, err)

	// The daemon sees the stream only once it carries data; its reader skips
	// an empty line.
	_, err = stream.Write([]byte("\n"))
	require.NoError(t, err)
	require.NoError(t, stream.SetReadDeadline(time.Now().Add(10*time.Second)))

	scanner := bufio.NewScanner(stream)

	nextType := func() string {
		t.Helper()

		require.True(t, scanner.Scan(), "read a line from the daemon: %v", scanner.Err())

		var msg struct {
			Type string `json:"type"`
		}

		require.NoError(t, json.Unmarshal(scanner.Bytes(), &msg), "line %q", scanner.Text())

		return msg.Type
	}

	return sess, nextType
}

func (f *attachFixture) waitForHandlerReturn(t *testing.T) {
	t.Helper()

	select {
	case <-f.returned:
	case <-time.After(10 * time.Second):
		t.Fatal("handleAttach still running 10s after the attach ended")
	}
}

// TestAttachLiveModeEndsWhenTheWorkerExits drives an attach through replay
// and a live event, then ends the worker: the client sees the session close
// with code 0, and the handler returns.
func TestAttachLiveModeEndsWhenTheWorkerExits(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	f := startAttachFixture(t)
	worker, _ := f.addSession(t, "s1", `{"type":"query_done","stopReason":"end_turn"}`)

	sess, nextType := f.attach(t, "s1")

	assert.Equal(t, "transcript_replay_start", nextType())
	assert.Equal(t, "query_done", nextType(), "the ledger line")
	assert.Equal(t, "transcript_replay_end", nextType())

	worker.Push(WorkerEvent{Type: "sdk_event", Payload: []byte(`{"type":"sdk_event","event":{"kind":"text"}}`)})
	assert.Equal(t, "sdk_event", nextType(), "the live event")

	require.NoError(t, worker.Close())

	// The daemon opens no streams, so this waits until the session closes and
	// then reports how.
	acceptCtx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	_, acceptErr := sess.AcceptBidiStream(acceptCtx)

	sessionErr, ok := errors.AsType[*wt.SessionError](acceptErr)
	require.True(t, ok, "AcceptBidiStream() after the worker exited = %v, want a *webtransport.SessionError", acceptErr)
	assert.True(t, sessionErr.Remote)
	assert.Equal(t, wt.SessionErrorCode(0), sessionErr.ErrorCode)
	assert.Equal(t, "session_ended", sessionErr.Message)

	f.waitForHandlerReturn(t)
}

// TestAttachLiveModeEndsWhenTheClientLeaves pins that a client that closes
// its session ends the attach: the handler returns and the client is no
// longer registered for the session's events.
func TestAttachLiveModeEndsWhenTheClientLeaves(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	f := startAttachFixture(t)
	_, entry := f.addSession(t, "s2")

	sess, nextType := f.attach(t, "s2")

	assert.Equal(t, "transcript_replay_start", nextType())
	assert.Equal(t, "transcript_replay_end", nextType())
	assert.Equal(t, 1, entry.Broadcaster.ClientCount())

	require.NoError(t, sess.Close())

	f.waitForHandlerReturn(t)

	assert.Equal(t, 0, entry.Broadcaster.ClientCount())
}

// TestAttachChecksTheOrigin pins that the daemon passes AllowedOrigins to
// its WebTransport upgrade: a page from a listed origin attaches, and one
// from any other origin is refused with 403 before a session exists.
func TestAttachChecksTheOrigin(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	f := startAttachFixture(t, "https://app.example.com")
	f.addSession(t, "s3")

	withOrigin := func(origin string) http.Header {
		headers := f.headers.Clone()
		headers.Set("Origin", origin)

		return headers
	}

	_, err := f.client.ConnectWithHeaders(t.Context(), f.baseURL+"s3", withOrigin("https://evil.example.com"))
	require.Error(t, err, "attach from an unlisted origin")
	assert.Contains(t, err.Error(), "received status 403")
	f.waitForHandlerReturn(t)

	sess, err := f.client.ConnectWithHeaders(t.Context(), f.baseURL+"s3", withOrigin("https://app.example.com"))
	require.NoError(t, err, "attach from a listed origin")
	require.NoError(t, sess.Close())
	f.waitForHandlerReturn(t)
}
