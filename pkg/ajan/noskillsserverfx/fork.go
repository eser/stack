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

// forkMeta is written as line 1 of a forked session's ledger.
// Replay logic checks for this header and prepends the parent history first.
type forkMeta struct {
	Type            string `json:"type"` // always "fork_meta"
	ParentSessionID string `json:"parent_session_id"`
	ForkAtMessageID string `json:"fork_at_message_id"` // empty → replay the parent to ParentLines
	// ParentLines is how many lines the parent's ledger held at the fork, the
	// most of it the fork replays. Headers written before it was recorded
	// lack it, and those forks replay the parent to its end or to
	// ForkAtMessageID, as they did when they were made.
	ParentLines *int64    `json:"parent_lines,omitempty"`
	Label       string    `json:"label,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
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
// The header records the parent's line count, so lines the parent appends
// later, its fork_created line for this fork among them, are never part of the
// fork's history.
//
// atMessageID may be empty to fork at the current parent tail.
// label is informational and stored in fork_meta.
func forkSession(
	ctx context.Context,
	sm *SessionManager,
	slug, parentSid, atMessageID, label string,
) (string, error) {
	sm.mu.Lock()
	parentEntry, exists := sm.sessions[sessionKey(slug, parentSid)]
	sm.mu.Unlock()

	if !exists {
		return "", fmt.Errorf("parent session %q not found in project %q", parentSid, slug) //nolint:err113
	}

	// The fork point: every line the parent holds now, and none it appends
	// from here on.
	parentLines := parentEntry.Ledger.lineCount()

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
		ParentLines:     &parentLines,
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

	// Journal the fork in the parent session and notify the clients attached
	// to it. The parent's ledger keeps where its forks branched off, and a
	// client that was away when one was made learns of it on reattach. The
	// fork exists either way, so a failed write is logged, not returned.
	payload, _ := json.Marshal(map[string]any{
		"type":            "fork_created",
		"parentSessionId": parentSid,
		"newSessionId":    newSid,
		"atMessageId":     atMessageID,
	})

	evt := WorkerEvent{Type: "fork_created", Payload: payload}
	if err := parentEntry.publishOrSend(evt, payload); err != nil {
		sm.logger.WarnContext(ctx, "fork: fork_created not journalled in the parent session",
			"sid", parentSid, "err", err)
	}

	return newSid, nil
}

// ── Lineage ───────────────────────────────────────────────────────────────────

// buildLineage walks the fork chain and returns the ancestry root-first, up
// to maxForkDepth ancestors, as far as a replay walks.
func buildLineage(dataDir, projectRoot, sid string) []lineageEntry {
	chain := make([]lineageEntry, 0)
	cur := sid
	seen := make(map[string]bool)

	for cur != "" && !seen[cur] && len(chain) <= maxForkDepth {
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
