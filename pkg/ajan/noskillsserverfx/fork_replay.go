package noskillsserverfx

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
)

// maxForkDepth is the most ancestors a fork's replay walks up through. Each
// one holds a ledger file open while the replay is in it.
const maxForkDepth = 32

// errForkAncestry reports a fork ancestry the replay could not walk to its
// root: an ancestor whose ledger is gone, a cycle, or one ancestor too many.
// The replay sends what lies below the break, numbered from 1.
var errForkAncestry = errors.New("the fork's ancestry ends before its root")

// forkPoint is where a fork branched off its parent's history.
type forkPoint struct {
	// atMessageID is the "id" of the last line of the parent's history the
	// fork replays, or empty for none.
	atMessageID string
	// lines is how many lines the parent's ledger held at the fork, its own
	// fork_meta header included, or nil for a fork made before that was
	// recorded.
	lines *int64
}

// parseForkHeader reads a fork_meta header line into the parent it names and
// the point the fork branched off at. It reads only the fields replay needs,
// so a header whose other fields do not parse still names its parent.
func parseForkHeader(line []byte) (string, forkPoint, bool) {
	var header struct {
		Type            string `json:"type"`
		ParentSessionID string `json:"parent_session_id"`
		ForkAtMessageID string `json:"fork_at_message_id"`
		ParentLines     *int64 `json:"parent_lines"`
	}

	if err := json.Unmarshal(line, &header); err != nil || header.Type != "fork_meta" {
		return "", forkPoint{}, false
	}

	return header.ParentSessionID, forkPoint{atMessageID: header.ForkAtMessageID, lines: header.ParentLines}, true
}

// replayWithForkAwareness replays ledger events. A forked session's ledger
// starts with a fork_meta header: its ancestry's history up to the fork point
// is replayed first, walking up from fork_meta to fork_meta, and no header is
// sent as an event.
//
// afterSeq is the number of events the reconnecting client has already seen.
// Events with a 1-based sequence number ≤ afterSeq are counted but not sent,
// so the caller can efficiently resume after a network drop without replaying
// the full transcript. Pass 0 for a fresh attach.
//
// send receives the stable 1-based sequence number assigned to this line
// (consistent across reconnects) and the raw JSON bytes.
//
// Returns the total number of lines encountered (= highest seq assigned),
// the number of lines of ledger itself it covered, which is ledger's line
// count when it was read (also on an error, once the read began), and any
// non-EOF error. An error that wraps errForkAncestry comes after a complete
// replay of the lines below the break in the ancestry.
func replayWithForkAwareness(
	ctx context.Context,
	ledger *Ledger,
	dataDir, projectRoot string,
	afterSeq int64,
	send func(seq int64, line []byte) bool,
) (int64, int64, error) {
	// Buffer all lines so we can inspect line 1 for a fork_meta header.
	var lines [][]byte

	own, err := ledger.replayLines(ctx, func(line []byte) bool {
		cp := make([]byte, len(line))
		copy(cp, line)
		lines = append(lines, cp)

		return true
	})
	if err != nil {
		return 0, own, err
	}

	if len(lines) == 0 {
		return 0, own, nil
	}

	var counter int64

	emit := func(line []byte) bool {
		counter++

		return counter <= afterSeq || send(counter, line)
	}

	var broken error

	if parent, point, ok := parseForkHeader(lines[0]); ok {
		walk := ancestryReplay{
			dataDir:     dataDir,
			projectRoot: projectRoot,
			visited:     map[string]struct{}{ledger.path: {}},
			broken:      nil,
		}

		goOn, err := walk.replay(ctx, parent, point, 1, emit)
		if err != nil || !goOn {
			return counter, own, err
		}

		broken = walk.broken
		lines = lines[1:] // skip fork_meta header itself
	}

	for _, line := range lines {
		if ctx.Err() != nil {
			return counter, own, ctx.Err()
		}

		if !emit(line) {
			return counter, own, nil
		}
	}

	return counter, own, broken
}

// ancestryReplay walks up a fork's ancestry, one ledger file per ancestor,
// without opening a write fd.
type ancestryReplay struct {
	dataDir     string
	projectRoot string
	// visited holds the ledger paths of the sessions on the walk so far.
	visited map[string]struct{}
	// broken is where the walk could not go further up, or nil.
	broken error
}

// replay sends session sid's history up to point through emit: when sid is a
// fork, its parent's history up to sid's own fork point first, then sid's own
// lines. point.lines counts the lines of sid's ledger, its header included,
// as Ledger numbers them (empty lines skipped), and the history ends there or
// after the line whose "id" is point.atMessageID, whichever comes first.
//
// sid is ancestor number depth of the replayed session. A missing ledger, a
// cycle or an ancestor past maxForkDepth ends the walk up, recorded in
// broken, and the lines below it are still sent.
//
// It returns false when emit stopped the replay.
func (r *ancestryReplay) replay(
	ctx context.Context,
	sid string,
	point forkPoint,
	depth int,
	emit func([]byte) bool,
) (bool, error) {
	path := ledgerPath(r.dataDir, r.projectRoot, sid)
	if _, seen := r.visited[path]; seen {
		r.breakAt(fmt.Errorf("session %q is its own ancestor: %w", sid, errForkAncestry))

		return true, nil
	}

	r.visited[path] = struct{}{}

	rf, err := os.Open(path) //nolint:gosec // path from ledgerPath helper, not user input
	if errors.Is(err, os.ErrNotExist) {
		r.breakAt(fmt.Errorf("ancestor %q has no ledger: %w", sid, errForkAncestry))

		return true, nil
	}

	if err != nil {
		return false, fmt.Errorf("open the ledger of ancestor %q: %w", sid, err)
	}

	defer func() { _ = rf.Close() }()

	// reached is set once the line point stops after has been sent.
	reached := false
	upTo := func(line []byte) bool {
		if !emit(line) {
			return false
		}

		reached = point.atMessageID != "" && messageHasID(line, point.atMessageID)

		return !reached
	}

	scanner := bufio.NewScanner(rf)
	scanner.Buffer(make([]byte, 0, 64*1024), 1<<20)

	var read int64

	for (point.lines == nil || read < *point.lines) && scanner.Scan() {
		if ctx.Err() != nil {
			return false, ctx.Err()
		}

		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		read++

		if read == 1 {
			if parent, parentPoint, ok := parseForkHeader(line); ok {
				if depth >= maxForkDepth {
					r.breakAt(fmt.Errorf("ancestor %q is more than %d forks up: %w", parent, maxForkDepth, errForkAncestry))

					continue
				}

				goOn, err := r.replay(ctx, parent, parentPoint, depth+1, upTo)
				if err != nil {
					return false, err
				}

				if reached {
					return true, nil
				}

				if !goOn {
					return false, nil
				}

				continue
			}
		}

		if !upTo(line) {
			return reached, nil
		}
	}

	if err := scanner.Err(); err != nil {
		return false, fmt.Errorf("read the ledger of ancestor %q: %w", sid, err)
	}

	return true, nil
}

// breakAt records where the walk up the ancestry stopped. The walk breaks at
// most once, since nothing above the break is read.
func (r *ancestryReplay) breakAt(err error) {
	if r.broken == nil {
		r.broken = err
	}
}

// messageHasID reports whether the JSON line has an "id" field equal to id.
func messageHasID(line []byte, id string) bool {
	var msg struct {
		ID string `json:"id"`
	}

	return json.Unmarshal(line, &msg) == nil && msg.ID == id
}
