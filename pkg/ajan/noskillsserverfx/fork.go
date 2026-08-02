package noskillsserverfx

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
)

// ── Fork metadata ─────────────────────────────────────────────────────────────

// forkMeta is written as line 0 of a forked session's ledger.
// Replay logic checks for this header and prepends the parent history first.
type forkMeta struct {
	Type            string    `json:"type"` // always "fork_meta"
	ParentSessionID string    `json:"parent_session_id"`
	ForkAtMessageID string    `json:"fork_at_message_id"` // empty → replay entire parent
	Label           string    `json:"label,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// lineageEntry is one node in a session's fork ancestry, root-first.
type lineageEntry struct {
	SessionID string    `json:"sessionId"`
	ParentID  string    `json:"parentId,omitempty"`
	AtMessage string    `json:"atMessageId,omitempty"`
	Label     string    `json:"label,omitempty"`
	CreatedAt time.Time `json:"createdAt,omitempty"`
}

// ── Fork orchestration ────────────────────────────────────────────────────────

// forkSession creates a new session whose ledger starts with a fork_meta header
// pointing at parentSid. When the new session is attached via WebTransport,
// its replay serves parent history up to atMessageID then the fork's own events.
//
// atMessageID may be empty to fork at the current parent tail.
// label is informational and stored in fork_meta.
func forkSession(
	ctx context.Context, //nolint:unparam // ctx reserved for future async ledger writes
	sm *SessionManager,
	slug, parentSid, atMessageID, label string,
) (string, error) {
	sm.mu.Lock()
	parentEntry, exists := sm.sessions[sessionKey(slug, parentSid)]
	sm.mu.Unlock()

	if !exists {
		return "", fmt.Errorf("parent session %q not found in project %q", parentSid, slug) //nolint:err113
	}

	// Flush parent ledger before snapshotting to ensure a consistent cut point.
	parentEntry.Ledger.mu.Lock()
	_ = parentEntry.Ledger.bw.Flush()
	parentEntry.Ledger.mu.Unlock()

	newSid := newSessionID()
	lpath := ledgerPath(sm.server.config.DataDir, parentEntry.Root, newSid)

	ledger, err := openLedger(lpath)
	if err != nil {
		return "", fmt.Errorf("open fork ledger: %w", err)
	}

	meta := forkMeta{
		Type:            "fork_meta",
		ParentSessionID: parentSid,
		ForkAtMessageID: atMessageID,
		Label:           label,
		CreatedAt:       time.Now(),
	}

	metaLine, err := json.Marshal(meta)
	if err != nil {
		_ = ledger.Close()

		return "", fmt.Errorf("marshal fork_meta: %w", err)
	}

	if err := ledger.Append(metaLine); err != nil {
		_ = ledger.Close()

		return "", fmt.Errorf("write fork_meta: %w", err)
	}

	_ = ledger.Close()

	// Notify all clients attached to the parent session.
	payload, _ := json.Marshal(map[string]any{
		"type":            "fork_created",
		"parentSessionId": parentSid,
		"newSessionId":    newSid,
		"atMessageId":     atMessageID,
	})

	parentEntry.Broadcaster.Broadcast(WorkerEvent{
		Type:    "fork_created",
		Payload: json.RawMessage(payload),
	})

	return newSid, nil
}

// ── Fork-aware replay ─────────────────────────────────────────────────────────

// replayWithForkAwareness replays ledger events, following any fork_meta header
// to prepend the parent's history first.
//
// afterSeq is the number of events the reconnecting client has already seen.
// Events with a 1-based sequence number ≤ afterSeq are counted but not sent,
// so the caller can efficiently resume after a network drop without replaying
// the full transcript. Pass 0 for a fresh attach.
//
// send receives the stable 1-based sequence number assigned to this line
// (consistent across reconnects) and the raw JSON bytes.
//
// Returns the total number of lines encountered (= highest seq assigned) and
// any non-EOF error.
func replayWithForkAwareness(
	ctx context.Context,
	ledger *Ledger,
	dataDir, projectRoot string,
	afterSeq int64,
	send func(seq int64, line []byte) bool,
) (int64, error) {
	// Buffer all lines so we can inspect line 0 for a fork_meta header.
	var lines [][]byte

	if err := ledger.Replay(ctx, func(line []byte) bool {
		cp := make([]byte, len(line))
		copy(cp, line)
		lines = append(lines, cp)

		return true
	}); err != nil {
		return 0, err
	}

	if len(lines) == 0 {
		return 0, nil
	}

	var counter int64

	var header struct {
		Type            string `json:"type"`
		ParentSessionID string `json:"parent_session_id"`
		ForkAtMessageID string `json:"fork_at_message_id"`
	}

	if err := json.Unmarshal(lines[0], &header); err == nil && header.Type == "fork_meta" {
		parentPath := ledgerPath(dataDir, projectRoot, header.ParentSessionID)

		// Best-effort: if parent is gone, continue with fork-only history.
		_ = replayLedgerFile(ctx, parentPath, header.ForkAtMessageID, afterSeq, &counter, send)

		lines = lines[1:] // skip fork_meta header itself
	}

	for _, line := range lines {
		if ctx.Err() != nil {
			return counter, ctx.Err()
		}

		counter++

		if counter > afterSeq {
			if !send(counter, line) {
				return counter, nil
			}
		}
	}

	return counter, nil
}

// replayLedgerFile reads lines from path without opening a write fd.
// counter is shared with the caller so sequence numbers are contiguous across
// parent + child ledgers in a forked session.
// Stops after sending the line whose "id" JSON field equals stopAt
// (empty stopAt → replay all lines).
func replayLedgerFile(
	ctx context.Context,
	path, stopAt string,
	afterSeq int64,
	counter *int64,
	send func(seq int64, line []byte) bool,
) error {
	rf, err := os.Open(path) //nolint:gosec // path from ledgerPath helper, not user input
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}

		return fmt.Errorf("open ledger for fork replay: %w", err)
	}
	defer func() { _ = rf.Close() }()

	scanner := bufio.NewScanner(rf)
	scanner.Buffer(make([]byte, 1<<20), 1<<20)

	for scanner.Scan() {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		*counter++

		if *counter > afterSeq {
			if !send(*counter, line) {
				return nil
			}
		}

		if stopAt != "" && messageHasID(line, stopAt) {
			return nil // stop after the target message
		}
	}

	return scanner.Err()
}

// messageHasID reports whether the JSON line has an "id" field equal to id.
func messageHasID(line []byte, id string) bool {
	var msg struct {
		ID string `json:"id"`
	}

	return json.Unmarshal(line, &msg) == nil && msg.ID == id
}

// ── Lineage ───────────────────────────────────────────────────────────────────

// buildLineage walks the fork chain and returns the ancestry root-first.
func buildLineage(dataDir, projectRoot, sid string) []lineageEntry {
	chain := make([]lineageEntry, 0)
	cur := sid
	seen := make(map[string]bool)

	for cur != "" && !seen[cur] {
		seen[cur] = true
		meta := readForkMeta(dataDir, projectRoot, cur)

		entry := lineageEntry{SessionID: cur}
		if meta != nil {
			entry.ParentID = meta.ParentSessionID
			entry.AtMessage = meta.ForkAtMessageID
			entry.Label = meta.Label
			entry.CreatedAt = meta.CreatedAt
		}

		chain = append([]lineageEntry{entry}, chain...) // prepend for root-first order

		if meta == nil {
			break
		}

		cur = meta.ParentSessionID
	}

	return chain
}

// readForkMeta reads the first ledger line and returns a forkMeta if the
// session was forked. Returns nil for root (non-forked) sessions.
func readForkMeta(dataDir, projectRoot, sid string) *forkMeta {
	rf, err := os.Open(ledgerPath(dataDir, projectRoot, sid))
	if err != nil {
		return nil
	}
	defer func() { _ = rf.Close() }()

	scanner := bufio.NewScanner(rf)
	scanner.Buffer(make([]byte, 1<<20), 1<<20)

	if !scanner.Scan() {
		return nil
	}

	var meta forkMeta
	if err := json.Unmarshal(scanner.Bytes(), &meta); err != nil || meta.Type != "fork_meta" {
		return nil
	}

	return &meta
}

// ── Fork REST handlers ────────────────────────────────────────────────────────

type forkSessionRequest struct {
	AtMessageID string `json:"atMessageId,omitempty"`
	Label       string `json:"label,omitempty"`
}

type forkSessionResponse struct {
	SessionID string `json:"sessionId"`
}

func (s *Server) handleForkSession(ctx *httpfx.Context) httpfx.Result {
	slug := ctx.Request.PathValue("slug")
	sid := ctx.Request.PathValue("sid")

	if _, ok := s.projectPath(slug); !ok {
		return ctx.Results.Error(
			http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("project %q not found", slug)), //nolint:err113
		)
	}

	var req forkSessionRequest
	_ = ctx.ParseJSONBody(&req)

	newSid, err := forkSession(ctx.Request.Context(), s.sessions, slug, sid, req.AtMessageID, req.Label)
	if err != nil {
		return ctx.Results.Error(
			http.StatusBadRequest,
			httpfx.WithSanitizedError(fmt.Errorf("fork session: %w", err)),
		)
	}

	return ctx.Results.JSON(&forkSessionResponse{SessionID: newSid})
}

type lineageResponse struct {
	Chain []lineageEntry `json:"chain"`
}

func (s *Server) handleSessionLineage(ctx *httpfx.Context) httpfx.Result {
	slug := ctx.Request.PathValue("slug")
	sid := ctx.Request.PathValue("sid")

	root, ok := s.projectPath(slug)
	if !ok {
		return ctx.Results.Error(
			http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("project %q not found", slug)), //nolint:err113
		)
	}

	return ctx.Results.JSON(&lineageResponse{
		Chain: buildLineage(s.config.DataDir, root, sid),
	})
}
