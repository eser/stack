package noskillsserverfx

import (
	"context"
	"errors"
	"io"
	"net"
	"path/filepath"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
)

type lifetimeKey struct{}

// newPumpFixture returns a running session manager whose server has a push
// dispatcher with one catch-all subscription and no senders, so a triggered
// notification stays on the queue where the test can read it.
func newPumpFixture(t *testing.T, lifetime context.Context) (*SessionManager, *PushDispatcher) {
	t.Helper()

	logger := logfx.NewLogger(logfx.WithWriter(io.Discard))

	push := &PushDispatcher{ //nolint:exhaustruct
		vapid: &vapidKeyPair{PublicKey: "public", PrivateKey: "private"},
		store: &subscriptionStore{ //nolint:exhaustruct
			path: filepath.Join(t.TempDir(), "subscriptions.json"),
			subs: []*pushSubscription{{ID: "sub-1", Endpoint: "https://push.invalid/1"}}, //nolint:exhaustruct
		},
		queue:    make(chan pushJob, 4),
		coalesce: newPushCoalescer(),
		logger:   logger,
	}

	server := &Server{ //nolint:exhaustruct
		config: &ServerConfig{DataDir: t.TempDir()}, //nolint:exhaustruct
		push:   push,
		logger: logger,
	}

	sm := newSessionManager(server, logger)
	sm.start(lifetime)

	return sm, push
}

// addPumpedSession registers a session of project "proj" backed by worker and
// starts its pump.
func addPumpedSession(t *testing.T, sm *SessionManager, worker WorkerHandle) *SessionEntry {
	t.Helper()

	ledger, err := openLedger(filepath.Join(t.TempDir(), "ledger.jsonl"))
	if err != nil {
		t.Fatalf("open ledger: %v", err)
	}

	entry := &SessionEntry{ //nolint:exhaustruct
		SID:         worker.SessionID(),
		Slug:        "proj",
		Worker:      worker,
		Ledger:      ledger,
		Broadcaster: newFanoutBroadcaster(),
		Pending:     newPendingPermissions(),
	}

	sm.mu.Lock()
	sm.addLocked(sessionKey(entry.Slug, entry.SID), entry)
	sm.mu.Unlock()

	return entry
}

// TestRunPumpTriggersPushUnderTheLifetimeContext pins that a notification the
// pump triggers carries the server's lifetime context, not a fresh one.
func TestRunPumpTriggersPushUnderTheLifetimeContext(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		lifetime, end := context.WithCancel(context.WithValue(t.Context(), lifetimeKey{}, "server"))
		defer end()

		sm, push := newPumpFixture(t, lifetime)

		worker := NewMockWorkerHandle("s1", []WorkerEvent{
			{Type: "query_error", Payload: []byte(`{"type":"query_error","error":"boom"}`)},
		})
		addPumpedSession(t, sm, worker)

		synctest.Wait() // the pump has handled the event and waits for the next

		select {
		case job := <-push.queue:
			if got := job.ctx.Value(lifetimeKey{}); got != "server" {
				t.Errorf("queued notification context value = %v, want the lifetime context's %q", got, "server")
			}
		default:
			t.Fatal("query_error queued no notification")
		}

		end()
		sm.stop()
	})
}

// TestSessionManagerStopClosesWorkersWhenTheLifetimeEnds pins the shutdown
// path: ending the lifetime context closes every worker, each pump cleans its
// session up, stop waits for that, and no session can be created afterwards.
func TestSessionManagerStopClosesWorkersWhenTheLifetimeEnds(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		lifetime, end := context.WithCancel(t.Context())
		defer end()

		sm, _ := newPumpFixture(t, lifetime)

		workers := []*MockWorkerHandle{NewMockWorkerHandle("s1", nil), NewMockWorkerHandle("s2", nil)}
		entries := make([]*SessionEntry, 0, len(workers))

		for _, w := range workers {
			entries = append(entries, addPumpedSession(t, sm, w))
		}

		clients := make([]<-chan WorkerEvent, 0, len(entries))
		for _, e := range entries {
			clients = append(clients, e.Broadcaster.Register("client"))
		}

		synctest.Wait()

		if got := len(sm.ListBySlug("proj")); got != len(workers) {
			t.Fatalf("ListBySlug before shutdown = %d sessions, want %d", got, len(workers))
		}

		end()
		sm.stop()

		if got := len(sm.ListBySlug("proj")); got != 0 {
			t.Errorf("ListBySlug after stop = %d sessions, want 0", got)
		}

		for i, client := range clients {
			if _, open := <-client; open {
				t.Errorf("session %d: attached client still open after stop, want its channel closed", i)
			}
		}

		_, _, err := sm.GetOrCreate(t.Context(), "proj", "s3", "")
		if !errors.Is(err, errSessionsNotRunning) {
			t.Errorf("GetOrCreate after stop = %v, want errSessionsNotRunning", err)
		}
	})
}

// selfEndingWorker is a worker whose events can end without Close, as a worker
// process that exits does. It counts the Close calls it gets.
type selfEndingWorker struct {
	*MockWorkerHandle

	closes atomic.Int32
}

func (w *selfEndingWorker) exit() { close(w.events) }

func (w *selfEndingWorker) Close() error {
	w.closes.Add(1)

	return nil
}

// TestRunPumpClosesAWorkerThatEndedOnItsOwn pins that the pump releases a
// worker whose events ended without a Close: its socket and, when only its
// reader failed, its process. The lifetime's end must not close it again.
func TestRunPumpClosesAWorkerThatEndedOnItsOwn(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		lifetime, end := context.WithCancel(t.Context())
		defer end()

		sm, _ := newPumpFixture(t, lifetime)

		worker := &selfEndingWorker{MockWorkerHandle: NewMockWorkerHandle("s1", nil)}
		addPumpedSession(t, sm, worker)

		worker.exit()
		synctest.Wait() // the pump has cleaned the session up

		if got := worker.closes.Load(); got != 1 {
			t.Errorf("Close calls after the worker ended on its own = %d, want 1", got)
		}

		if got := len(sm.ListBySlug("proj")); got != 0 {
			t.Errorf("ListBySlug after the worker ended = %d sessions, want 0", got)
		}

		end()
		sm.stop()

		if got := worker.closes.Load(); got != 1 {
			t.Errorf("Close calls after shutdown = %d, want still 1", got)
		}
	})
}

func TestGetOrCreateRefusesBeforeStart(t *testing.T) {
	t.Parallel()

	logger := logfx.NewLogger(logfx.WithWriter(io.Discard))
	sm := newSessionManager(&Server{config: &ServerConfig{DataDir: t.TempDir()}}, logger) //nolint:exhaustruct

	if _, _, err := sm.GetOrCreate(t.Context(), "proj", "s1", ""); !errors.Is(err, errSessionsNotRunning) {
		t.Errorf("GetOrCreate before start = %v, want errSessionsNotRunning", err)
	}
}

// TestPumpOfADroppedSessionLeavesItsSuccessorRegistered pins that a pump
// removes only its own entry: a session dropped after a failed start and then
// created again must survive the old worker's exit.
func TestPumpOfADroppedSessionLeavesItsSuccessorRegistered(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		lifetime, end := context.WithCancel(t.Context())
		defer end()

		sm, _ := newPumpFixture(t, lifetime)

		oldWorker := NewMockWorkerHandle("s1", nil)
		addPumpedSession(t, sm, oldWorker)

		sm.Remove("proj", "s1") // the attach that spawned it failed to start it

		successor := addPumpedSession(t, sm, NewMockWorkerHandle("s1", nil))

		if err := oldWorker.Close(); err != nil {
			t.Fatalf("close the dropped worker: %v", err)
		}

		synctest.Wait() // the dropped session's pump has finished

		got := sm.ListBySlug("proj")
		if len(got) != 1 || got[0] != successor {
			t.Errorf("ListBySlug after the dropped pump ended = %v, want only the successor", got)
		}

		end()
		sm.stop()
	})
}

// TestServerStartFailureStopsBackgroundWork pins that a Start that cannot
// listen leaves nothing running: the push senders it started have returned,
// and no session can be created.
func TestServerStartFailureStopsBackgroundWork(t *testing.T) {
	t.Parallel()

	occupied, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("occupy a UDP port: %v", err)
	}

	defer occupied.Close() //nolint:errcheck // a test socket; nothing to report

	srv := New(&ServerConfig{ //nolint:exhaustruct
		H3Addr:     occupied.LocalAddr().String(),
		DataDir:    t.TempDir(),
		SelfSigned: true,
	}, logfx.NewLogger(logfx.WithWriter(io.Discard)))

	if srv.config.GracefulShutdownTimeout != defaultShutdownTimeout {
		t.Errorf("unset GracefulShutdownTimeout = %v, want the default %v",
			srv.config.GracefulShutdownTimeout, defaultShutdownTimeout)
	}

	cleanup, err := srv.Start(t.Context())
	if err == nil {
		cleanup()
		t.Fatal("Start() on an occupied port = nil error")
	}

	if srv.push == nil {
		t.Fatal("Start() did not create the push dispatcher")
	}

	senders := make(chan struct{})

	go func() {
		srv.push.wait()
		close(senders)
	}()

	select {
	case <-senders:
	case <-time.After(5 * time.Second):
		t.Fatal("push senders still running 5s after a failed Start")
	}

	if _, _, err := srv.sessions.GetOrCreate(t.Context(), "proj", "s1", ""); !errors.Is(err, errSessionsNotRunning) {
		t.Errorf("GetOrCreate after a failed Start = %v, want errSessionsNotRunning", err)
	}
}
