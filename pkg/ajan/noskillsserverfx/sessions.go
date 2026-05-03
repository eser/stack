package noskillsserverfx

import (
	"context"
	"fmt"
	"sync"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// ── Session entry ─────────────────────────────────────────────────────────────

// SessionEntry holds the worker, ledger, and broadcaster for one active session.
type SessionEntry struct {
	SID         string
	Root        string
	Slug        string
	Worker      WorkerHandle
	Ledger      *Ledger
	Broadcaster *FanoutBroadcaster
}

// ── Session manager ───────────────────────────────────────────────────────────

// SessionManager is the in-memory map of active sessions. Thread-safe.
// Phase 3: each session has an append-only JSONL ledger and a fan-out broadcaster.
type SessionManager struct {
	mu       sync.Mutex
	sessions map[string]*SessionEntry // key: "<slug>/<sid>"
	server   *Server
	logger   *logfx.Logger
}

func newSessionManager(server *Server, logger *logfx.Logger) *SessionManager {
	return &SessionManager{
		sessions: make(map[string]*SessionEntry),
		server:   server,
		logger:   logger,
	}
}

func sessionKey(slug, sid string) string { return slug + "/" + sid }

// GetOrCreate looks up an existing session or creates a new one (spawning the
// TS worker, opening the ledger, and starting the pump goroutine).
// Returns the entry and whether it was newly created.
func (sm *SessionManager) GetOrCreate(
	ctx context.Context,
	slug, sid string,
) (*SessionEntry, bool, error) {
	sm.mu.Lock()

	key := sessionKey(slug, sid)

	if e, ok := sm.sessions[key]; ok {
		sm.mu.Unlock()

		return e, false, nil
	}

	root, ok := sm.server.projectPath(slug)
	if !ok {
		sm.mu.Unlock()

		return nil, false, fmt.Errorf("project %q not found", slug) //nolint:err113
	}

	worker, err := SpawnWorker(
		ctx,
		sid,
		root,
		sm.server.config.DataDir,
		"", // workerPath: resolved inside SpawnWorker
		sm.logger,
	)
	if err != nil {
		sm.mu.Unlock()

		return nil, false, fmt.Errorf("spawn worker: %w", err)
	}

	lpath := ledgerPath(sm.server.config.DataDir, root, sid)

	ledger, err := openLedger(lpath)
	if err != nil {
		_ = worker.Close()
		sm.mu.Unlock()

		return nil, false, fmt.Errorf("open ledger: %w", err)
	}

	entry := &SessionEntry{
		SID:         sid,
		Root:        root,
		Slug:        slug,
		Worker:      worker,
		Ledger:      ledger,
		Broadcaster: newFanoutBroadcaster(),
	}

	sm.sessions[key] = entry

	// Release the lock before starting the goroutine to avoid holding it
	// while the scheduler queues the pump.
	sm.mu.Unlock()

	go sm.runPump(entry)

	return entry, true, nil
}

// Remove cleans up a session entry. Called by the pump goroutine when the
// worker process exits; also safe to call from error paths in handleAttach.
func (sm *SessionManager) Remove(slug, sid string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	delete(sm.sessions, sessionKey(slug, sid))
}

// ListBySlug returns all active session entries for the given project slug.
func (sm *SessionManager) ListBySlug(slug string) []*SessionEntry {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	prefix := slug + "/"
	result := make([]*SessionEntry, 0)

	for key, entry := range sm.sessions {
		if len(key) > len(prefix) && key[:len(prefix)] == prefix {
			result = append(result, entry)
		}
	}

	return result
}

// runPump is the single consumer of entry.Worker.Events(). For each event it:
//  1. Writes the translated client JSON to the JSONL ledger (persistent)
//  2. Broadcasts the raw WorkerEvent to all registered WT clients
//
// When the worker process exits (Events channel closes), runPump closes the
// ledger, signals all attached clients via broadcaster.Close(), then removes
// the session from the map.
func (sm *SessionManager) runPump(entry *SessionEntry) {
	for evt := range entry.Worker.Events() {
		if data := marshalEventForLedger(evt, sm.logger); data != nil {
			_ = entry.Ledger.Append(data)
		}

		entry.Broadcaster.Broadcast(evt)

		if sm.server.push != nil {
			sm.server.push.MaybeTrigger(entry, evt)
		}
	}

	// Worker exited — clean up in order: ledger → broadcaster → sessions map.
	_ = entry.Ledger.Close()
	entry.Broadcaster.Close() // unblocks all attach-handler goroutines
	sm.Remove(entry.Slug, entry.SID)

	sm.logger.Info("noskills session ended", "slug", entry.Slug, "sid", entry.SID)
}
