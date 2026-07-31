// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows && !wasip1

package exec_test

import (
	"testing"
	"time"

	shellexec "github.com/eser/stack/pkg/ajan/shellfx/exec"
)

// TestCloseWithSurvivingGrandchild pins the fix for the uninterruptible Close.
//
// The shell exits immediately but leaves a backgrounded grandchild holding the
// inherited stdout/stderr write ends. Before the fix, Close:
//   - cancelled the context, which exec.CommandContext turns into a kill of the
//     direct child only -- the grandchild survived;
//   - so the pipes never reached EOF and readerLoop stayed parked in Read;
//   - so watcherLoop's wg.Wait never returned and nothing ever sent on exitCh;
//   - so Close blocked forever on <-h.exitCh.
//
// Because EserAjanShellExecClose is a synchronous FFI symbol, that hang stalls
// the calling JS runtime's main thread, not just this child.
func TestCloseWithSurvivingGrandchild(t *testing.T) {
	t.Parallel()

	h, err := shellexec.SpawnChildProcess(shellexec.SpawnOptions{
		Command: "sh",
		Args:    []string{"-c", "sleep 120 & echo started"},
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	// Wait for the shell to actually produce output, so the grandchild is
	// guaranteed to be running before we tear down.
	select {
	case chunk, ok := <-readOnce(h):
		if !ok {
			t.Fatal("process produced no output")
		}

		_ = chunk
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for first output")
	}

	closed := make(chan int, 1)

	go func() { closed <- h.Close() }()

	select {
	case <-closed:
		// Close returned: the process group was killed and the pipe read ends
		// were closed, so the reader goroutines unwound.
	case <-time.After(15 * time.Second):
		t.Fatal("Close blocked: a surviving grandchild still holds the pipes")
	}

	// Close is documented idempotent; a second call must not block either.
	done := make(chan struct{})

	go func() { h.Close(); close(done) }()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("second Close blocked; closeOnce did not hold")
	}
}

// TestCloseOnAlreadyExitedProcess covers the ordinary path: a child that exits
// on its own must still let Close return promptly with its exit code.
func TestCloseOnAlreadyExitedProcess(t *testing.T) {
	t.Parallel()

	h, err := shellexec.SpawnChildProcess(shellexec.SpawnOptions{
		Command: "sh",
		Args:    []string{"-c", "exit 3"},
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	// Drain to EOF so the process is fully reaped by the watcher.
	for {
		if _, ok := h.Read(); !ok {
			break
		}
	}

	closed := make(chan int, 1)

	go func() { closed <- h.Close() }()

	select {
	case code := <-closed:
		if code != 3 {
			t.Fatalf("exit code = %d, want 3", code)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Close blocked on an already-exited process")
	}
}

// readOnce adapts the blocking Read into a channel so tests can bound the wait.
func readOnce(h *shellexec.ChildProcessHandle) <-chan shellexec.OutputChunk {
	ch := make(chan shellexec.OutputChunk, 1)

	go func() {
		defer close(ch)

		if chunk, ok := h.Read(); ok {
			ch <- chunk
		}
	}()

	return ch
}
