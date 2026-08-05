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
	Kind        string // "" / "agent" | "mux"
	Worker      WorkerHandle
	Ledger      *Ledger
	Broadcaster *FanoutBroadcaster

	// Pending joins the two halves of a permission exchange: the tool name
	// arrives from the worker, the decision arrives from a client, and only
	// together do they say how durably the decision must be journalled.
	Pending *pendingPermissions
}

// ── Session manager ───────────────────────────────────────────────────────────

// SessionManager is the in-memory map of active sessions. Thread-safe.
// Phase 3: each session has an append-only JSONL ledger and a fan-out broadcaster.
type SessionManager struct {
	mu       sync.Mutex
	sessions map[string]*SessionEntry // key: "<slug>/<sid>"
	kinds    map[string]string        // key: "<slug>/<sid>" → worker kind, set at create
	pending  map[string]chan struct{} // key: "<slug>/<sid>" → in-flight creation
	server   *Server
	logger   *logfx.Logger
}

func newSessionManager(server *Server, logger *logfx.Logger) *SessionManager {
	return &SessionManager{
		sessions: make(map[string]*SessionEntry),
		kinds:    make(map[string]string),
		pending:  make(map[string]chan struct{}),
		server:   server,
		logger:   logger,
	}
}

func sessionKey(slug, sid string) string { return slug + "/" + sid }

// RecordKind remembers the worker flavour chosen at session-create time so the
// worker spawned on first attach matches, regardless of which client attaches or
// what its query string says. A durable fact about the session, not the request.
func (sm *SessionManager) RecordKind(slug, sid, kind string) {
	if kind == "" {
		return
	}

	sm.mu.Lock()
	sm.kinds[sessionKey(slug, sid)] = kind
	sm.mu.Unlock()
}

// GetOrCreate looks up an existing session or creates a new one (spawning the
// TS worker, opening the ledger, and starting the pump goroutine).
// Returns the entry and whether it was newly created.
//
// Creation is expensive -- SpawnWorker carries a 30s deadline -- so it runs
// with sm.mu released; holding the global session mutex across a spawn stalls
// every other session operation behind the slowest one. To keep "one worker per
// key" without the lock, the creating caller publishes a placeholder channel in
// sm.pending and concurrent callers for the same key wait on that instead of
// starting a second worker.
func (sm *SessionManager) GetOrCreate(
	ctx context.Context,
	slug, sid, kind string,
) (*SessionEntry, bool, error) {
	key := sessionKey(slug, sid)

	for {
		sm.mu.Lock()

		if e, ok := sm.sessions[key]; ok {
			sm.mu.Unlock()

			return e, false, nil
		}

		if done, ok := sm.pending[key]; ok {
			sm.mu.Unlock()

			select {
			case <-done:
				// The in-flight creation finished. It may have failed, so loop
				// and re-check: this iteration either finds the entry or claims
				// the creation itself.
				continue
			case <-ctx.Done():
				return nil, false, ctx.Err() //nolint:wrapcheck
			}
		}

		// The kind recorded at session-create wins over the per-attach query, so a
		// session's worker flavour is fixed by its creation, not by whoever attaches.
		effectiveKind := kind
		if recorded, ok := sm.kinds[key]; ok {
			effectiveKind = recorded
		}

		root, ok := sm.server.projectPath(slug)
		if !ok {
			sm.mu.Unlock()

			return nil, false, fmt.Errorf("project %q not found", slug) //nolint:err113
		}

		dataDir := sm.server.config.DataDir

		done := make(chan struct{})
		sm.pending[key] = done
		sm.mu.Unlock()

		entry, err := sm.spawnSession(ctx, slug, sid, root, effectiveKind, dataDir)

		sm.mu.Lock()
		delete(sm.pending, key)

		if err == nil {
			sm.sessions[key] = entry
		}

		sm.mu.Unlock()
		close(done)

		if err != nil {
			return nil, false, err
		}

		go sm.runPump(entry)

		return entry, true, nil
	}
}

// spawnSession performs the expensive half of GetOrCreate. It must be called
// with sm.mu released: it spawns a child process and opens a file, and on the
// failure path it tears the worker back down (which kills that child).
func (sm *SessionManager) spawnSession(
	ctx context.Context,
	slug, sid, root, kind, dataDir string,
) (*SessionEntry, error) {
	worker, err := SpawnWorker(
		ctx,
		sid,
		root,
		dataDir,
		"", // workerPath: resolved inside SpawnWorker
		kind,
		sm.logger,
	)
	if err != nil {
		return nil, fmt.Errorf("spawn worker: %w", err)
	}

	ledger, err := openLedger(ledgerPath(dataDir, root, sid))
	if err != nil {
		_ = worker.Close()

		return nil, fmt.Errorf("open ledger: %w", err)
	}

	return &SessionEntry{
		SID:         sid,
		Root:        root,
		Slug:        slug,
		Kind:        kind,
		Worker:      worker,
		Ledger:      ledger,
		Broadcaster: newFanoutBroadcaster(),
		Pending:     newPendingPermissions(),
	}, nil
}

// Remove cleans up a session entry. Called by the pump goroutine when the
// worker process exits; also safe to call from error paths in handleAttach.
func (sm *SessionManager) Remove(slug, sid string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	key := sessionKey(slug, sid)
	delete(sm.sessions, key)
	delete(sm.kinds, key)
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
		// Remember what each permission request is about. The decision comes back
		// on a different path carrying only the request id, so this is the only
		// point at which the tool name and the id are both in hand.
		if evt.Type == "permission_request" {
			if requestID, tool := permissionRequestTool(evt.Payload); requestID != "" {
				entry.Pending.record(requestID, tool)
			}
		}

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
