package noskillsserverfx

import (
	"encoding/json"
	"net"
	"os/exec"
	"sync"
	"testing"
	"time"
)

// TestWorkerCloseDoesNotSelfDeadlock pins the fix for the self-deadlock in
// workerImpl.Close: it holds w.mu and then used to call w.send, which locks
// w.mu again. sync.Mutex is not reentrant, so Close blocked forever -- and
// because SessionManager called it while holding its own global mutex, the
// whole daemon froze with no panic and no log.
//
// Trigger in production was any openLedger failure (ENOSPC, read-only FS, bad
// perms) on the session-create path.
func TestWorkerCloseDoesNotSelfDeadlock(t *testing.T) {
	t.Parallel()

	// A socketpair gives Close a real net.Conn to shut down. The peer end is
	// drained so the "shutdown" encode cannot block on a full pipe buffer.
	local, remote := net.Pipe()

	go func() {
		buf := make([]byte, 256)

		for {
			if _, err := remote.Read(buf); err != nil {
				return
			}
		}
	}()

	w := &workerImpl{
		sessionID: "sess-deadlock",
		cmd:       &exec.Cmd{}, // no Process: Close skips the Kill branch
		conn:      local,
		events:    make(chan WorkerEvent, 1),
		enc:       json.NewEncoder(local),
	}

	done := make(chan error, 1)

	go func() { done <- w.Close() }()

	select {
	case <-done:
		// Close returned; the lock was never taken twice.
	case <-time.After(2 * time.Second):
		t.Fatal("workerImpl.Close deadlocked: it holds w.mu and re-locked it")
	}
}

// TestWorkerSendIsStillMutuallyExclusive guards the other half of the fix:
// splitting out sendLocked must not drop the locking that send provides to
// ordinary concurrent callers, or two goroutines can interleave writes and
// corrupt the newline-delimited JSON stream the worker reads.
func TestWorkerSendIsStillMutuallyExclusive(t *testing.T) {
	t.Parallel()

	local, remote := net.Pipe()

	decoded := make(chan map[string]string, 64)

	go func() {
		dec := json.NewDecoder(remote)

		for {
			var m map[string]string
			if err := dec.Decode(&m); err != nil {
				close(decoded)

				return
			}

			decoded <- m
		}
	}()

	w := &workerImpl{
		sessionID: "sess-concurrent",
		cmd:       &exec.Cmd{},
		conn:      local,
		events:    make(chan WorkerEvent, 1),
		enc:       json.NewEncoder(local),
	}

	const senders = 8

	var wg sync.WaitGroup

	wg.Add(senders)

	for range senders {
		go func() {
			defer wg.Done()

			if err := w.PushMessage("hello"); err != nil {
				t.Errorf("PushMessage: %v", err)
			}
		}()
	}

	wg.Wait()

	// Every frame must decode cleanly; interleaved writes would produce a
	// decode error and close the channel early.
	for range senders {
		select {
		case m, ok := <-decoded:
			if !ok {
				t.Fatal("stream corrupted: decoder stopped before all frames")
			}

			if m["type"] != "push_message" {
				t.Fatalf("unexpected frame: %v", m)
			}
		case <-time.After(2 * time.Second):
			t.Fatal("timed out waiting for frames")
		}
	}

	_ = local.Close()
}
