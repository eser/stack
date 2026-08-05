// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows && !wasip1

package exec_test

import (
	"bufio"
	"errors"
	"io"
	"strings"
	"syscall"
	"testing"
	"time"

	shellexec "github.com/eser/stack/pkg/ajan/shellfx/exec"
)

// TestStreamStdoutExcludesStderr is the reason this spawn variant exists.
//
// SpawnChildProcess merges both streams into one tagged channel. A protocol
// decoder reading that merged stream would see log lines interleaved into the
// frame stream and fail to parse. Stdout must carry the child's stdout bytes
// and nothing else.
func TestStreamStdoutExcludesStderr(t *testing.T) {
	t.Parallel()

	h, err := shellexec.SpawnStreamProcess(shellexec.SpawnOptions{ //nolint:exhaustruct
		Command: "sh",
		Args:    []string{"-c", `printf 'ERR-BEFORE\n' >&2; printf 'OUT\n'; printf 'ERR-AFTER\n' >&2`},
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	t.Cleanup(func() { _ = h.Close() })

	got := readAllWithin(t, h.Stdout(), 10*time.Second)

	if got != "OUT\n" {
		t.Fatalf("stdout = %q, want %q -- stderr leaked into the frame stream", got, "OUT\n")
	}
}

// TestStreamRoundTrip proves the handle supports the bidirectional exchange a
// JSON-RPC connection needs: write a request, read a response, on live pipes.
func TestStreamRoundTrip(t *testing.T) {
	t.Parallel()

	h, err := shellexec.SpawnStreamProcess(shellexec.SpawnOptions{ //nolint:exhaustruct
		Command: "cat",
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	t.Cleanup(func() { _ = h.Close() })

	if _, err := io.WriteString(h.Stdin(), "ping\n"); err != nil {
		t.Fatalf("write: %v", err)
	}

	line := make(chan string, 1)

	go func() {
		reader := bufio.NewReader(h.Stdout())

		text, readErr := reader.ReadString('\n')
		if readErr != nil {
			return
		}

		line <- text
	}()

	select {
	case got := <-line:
		if got != "ping\n" {
			t.Fatalf("echoed %q, want %q", got, "ping\n")
		}
	case <-time.After(10 * time.Second):
		t.Fatal("no response: the stream did not round-trip")
	}
}

// TestStreamChattyStderrDoesNotBlockChild pins why stderr is drained rather
// than left unread.
//
// A pipe holds ~64 KiB. If nothing reads stderr, a child that writes more than
// that blocks in write() and never reaches its next stdout write -- so the
// marker below would never arrive and a real agent would appear to hang mid
// handshake. The child writes ~200 KiB of stderr *before* the marker.
func TestStreamChattyStderrDoesNotBlockChild(t *testing.T) {
	t.Parallel()

	h, err := shellexec.SpawnStreamProcess(shellexec.SpawnOptions{ //nolint:exhaustruct
		Command: "sh",
		Args:    []string{"-c", `head -c 200000 /dev/zero | tr '\0' 'e' >&2; printf 'MARKER\n'`},
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	t.Cleanup(func() { _ = h.Close() })

	got := readAllWithin(t, h.Stdout(), 15*time.Second)

	if got != "MARKER\n" {
		t.Fatalf("stdout = %q, want %q -- the child blocked on an undrained stderr", got, "MARKER\n")
	}
}

// TestStreamExitCodeAndStderrTail covers the diagnosis path: when a child dies
// during a handshake, the caller needs its status and its last words.
func TestStreamExitCodeAndStderrTail(t *testing.T) {
	t.Parallel()

	h, err := shellexec.SpawnStreamProcess(shellexec.SpawnOptions{ //nolint:exhaustruct
		Command: "sh",
		Args:    []string{"-c", `printf 'fatal: no such model\n' >&2; exit 7`},
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	t.Cleanup(func() { _ = h.Close() })

	select {
	case <-h.Exited():
	case <-time.After(10 * time.Second):
		t.Fatal("child was never reaped")
	}

	if code := h.ExitCode(); code != 7 {
		t.Fatalf("exit code = %d, want 7", code)
	}

	if tail := h.StderrTail(); !strings.Contains(tail, "fatal: no such model") {
		t.Fatalf("stderr tail = %q, does not carry the child's diagnosis", tail)
	}
}

// TestStreamCloseReleasesParkedReader pins the teardown property acpfx depends
// on: a decoder parked in Read must be released by Close.
//
// The shell exits immediately but leaves a backgrounded grandchild holding the
// inherited stdout write end, so the pipe never reaches EOF on its own. That is
// exactly the state a JSON-RPC read loop sits in between frames.
//
// Close has two independent ways to release it -- killing the process group
// drops the last write end, and closing the read end unblocks read(2) directly
// -- and either alone satisfies this test. That redundancy is deliberate: the
// group kill is a no-op on platforms without process groups, and cannot reach a
// descendant that escaped the group. TestStreamCloseKillsProcessGroup pins the
// kill itself.
func TestStreamCloseReleasesParkedReader(t *testing.T) {
	t.Parallel()

	h := spawnWithSurvivingGrandchild(t)

	// Park a reader on the now-silent pipe, mimicking a decoder awaiting the
	// next frame. The grandchild holds the write end, so this cannot return
	// until Close intervenes.
	parked := make(chan error, 1)

	go func() {
		buf := make([]byte, 1)
		_, readErr := h.Stdout().Read(buf)
		parked <- readErr
	}()

	// Give the reader time to actually block rather than racing Close.
	time.Sleep(200 * time.Millisecond)

	closed := make(chan struct{})

	go func() { _ = h.Close(); close(closed) }()

	select {
	case <-closed:
	case <-time.After(15 * time.Second):
		t.Fatal("Close blocked: a surviving grandchild still holds the pipes")
	}

	select {
	case <-parked:
		// Any error is fine; returning at all is the property under test.
	case <-time.After(10 * time.Second):
		t.Fatal("Close did not release a reader parked in Read")
	}

	// Documented idempotent; a second call must not block either.
	again := make(chan struct{})

	go func() { _ = h.Close(); close(again) }()

	select {
	case <-again:
	case <-time.After(5 * time.Second):
		t.Fatal("second Close blocked; closeOnce did not hold")
	}
}

// TestStreamCloseKillsProcessGroup pins that teardown takes the whole tree,
// not just the direct child.
//
// exec.CommandContext's own cancellation signals only the process it started.
// Without the process-group kill every spawned agent would leak whatever it had
// backgrounded -- one orphan per session, accumulating for the life of the
// daemon.
func TestStreamCloseKillsProcessGroup(t *testing.T) {
	t.Parallel()

	h := spawnWithSurvivingGrandchild(t)

	pgid := h.Pid()
	if pgid <= 0 {
		t.Fatalf("pid = %d, want a live process", pgid)
	}

	// Signal 0 probes for existence without delivering anything. The grandchild
	// is still running, so the group must exist.
	if err := syscall.Kill(-pgid, 0); err != nil {
		t.Fatalf("process group %d already gone before Close: %v", pgid, err)
	}

	_ = h.Close()

	// The kill is asynchronous: the grandchild becomes a zombie and is reaped by
	// init a moment later, so poll rather than assert instantly.
	deadline := time.Now().Add(10 * time.Second)

	for {
		if err := syscall.Kill(-pgid, 0); errors.Is(err, syscall.ESRCH) {
			return
		}

		if time.Now().After(deadline) {
			t.Fatalf("process group %d survived Close: the grandchild leaked", pgid)
		}

		time.Sleep(50 * time.Millisecond)
	}
}

// spawnWithSurvivingGrandchild starts a shell that exits immediately but leaves
// a backgrounded child holding the inherited stdout/stderr write ends.
func spawnWithSurvivingGrandchild(t *testing.T) *shellexec.StreamHandle {
	t.Helper()

	h, err := shellexec.SpawnStreamProcess(shellexec.SpawnOptions{ //nolint:exhaustruct
		Command: "sh",
		Args:    []string{"-c", "sleep 120 & printf 'started\\n'"},
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	t.Cleanup(func() { _ = h.Close() })

	// Wait for real output, so the grandchild is guaranteed to be running.
	first := make(chan error, 1)

	go func() {
		buf := make([]byte, len("started\n"))
		_, readErr := io.ReadFull(h.Stdout(), buf)
		first <- readErr
	}()

	select {
	case readErr := <-first:
		if readErr != nil {
			t.Fatalf("read first output: %v", readErr)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("child produced no output")
	}

	return h
}

// TestStreamCloseStdinEndsChild covers the graceful path: closing stdin must
// let a child that reads to EOF exit on its own, without a kill.
func TestStreamCloseStdinEndsChild(t *testing.T) {
	t.Parallel()

	h, err := shellexec.SpawnStreamProcess(shellexec.SpawnOptions{ //nolint:exhaustruct
		Command: "cat",
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	t.Cleanup(func() { _ = h.Close() })

	if err := h.CloseStdin(); err != nil {
		t.Fatalf("CloseStdin: %v", err)
	}

	select {
	case <-h.Exited():
	case <-time.After(10 * time.Second):
		t.Fatal("child did not exit after stdin reached EOF")
	}

	if code := h.ExitCode(); code != 0 {
		t.Fatalf("exit code = %d, want 0 -- a graceful shutdown must not look like a kill", code)
	}
}

// readAllWithin drains a reader to EOF, failing the test rather than hanging.
func readAllWithin(t *testing.T, reader io.Reader, limit time.Duration) string {
	t.Helper()

	type result struct {
		text string
		err  error
	}

	done := make(chan result, 1)

	go func() {
		data, err := io.ReadAll(reader)
		done <- result{text: string(data), err: err}
	}()

	select {
	case got := <-done:
		if got.err != nil {
			t.Fatalf("read stdout: %v", got.err)
		}

		return got.text

	case <-time.After(limit):
		t.Fatal("timed out reading stdout")

		return ""
	}
}
