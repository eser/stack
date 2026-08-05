// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package exec

import (
	"context"
	"io"
	"os"
	"os/exec"
	"sync"
)

// stderrTailBytes caps how much of a child's stderr is retained for diagnosis.
const stderrTailBytes = 8 << 10

// StreamHandle is a child process whose stdout is handed to the caller as an
// untouched byte stream.
//
// SpawnChildProcess merges stdout and stderr into one stream-tagged channel,
// which is what an FFI caller polling for output chunks needs. A protocol
// client needs the opposite: a raw io.Reader to hand to a decoder, with the two
// streams kept apart. A JSON-RPC agent writes protocol frames on stdout and
// logs on stderr, so merging them corrupts the frame stream.
//
// The pipes are built with os.Pipe rather than cmd.StdoutPipe because Cmd.Wait
// closes the pipes it created itself, and doing that while the caller's decoder
// is still reading is a race the os/exec docs call out explicitly. Owning both
// ends means Wait never touches the caller's reader.
type StreamHandle struct {
	cmd    *exec.Cmd
	cancel context.CancelFunc

	stdin  *os.File
	stdout *os.File

	stderrTail *tailBuffer

	// exited is closed once the child is reaped and exitCode is final.
	exited   chan struct{}
	exitCode int

	closeOnce sync.Once
	stdinOnce sync.Once
}

// SpawnStreamProcess starts a child process and exposes its stdin and stdout as
// raw streams.
//
// Stderr is drained continuously into a capped tail rather than exposed: an
// unread stderr pipe fills its kernel buffer and blocks a chatty child forever,
// and the tail is the part that explains a failed handshake.
func SpawnStreamProcess(opts SpawnOptions) (*StreamHandle, error) {
	cmd, cancel := newCommand(opts)

	stdinR, stdinW, err := os.Pipe()
	if err != nil {
		cancel()

		return nil, err
	}

	stdoutR, stdoutW, err := os.Pipe()
	if err != nil {
		cancel()
		closeAll(stdinR, stdinW)

		return nil, err
	}

	stderrR, stderrW, err := os.Pipe()
	if err != nil {
		cancel()
		closeAll(stdinR, stdinW, stdoutR, stdoutW)

		return nil, err
	}

	// Passing *os.File directly means os/exec hands the descriptors to the child
	// rather than spawning copy goroutines, so Wait has nothing to await beyond
	// the process itself.
	cmd.Stdin = stdinR
	cmd.Stdout = stdoutW
	cmd.Stderr = stderrW

	if err := cmd.Start(); err != nil {
		cancel()
		closeAll(stdinR, stdinW, stdoutR, stdoutW, stderrR, stderrW)

		return nil, err
	}

	// The child holds its own dups now. Our copies of the child-side ends must
	// go, or stdout never reaches EOF: this process would still be holding a
	// write end open long after the child died.
	closeAll(stdinR, stdoutW, stderrW)

	handle := &StreamHandle{ //nolint:exhaustruct
		cmd:        cmd,
		cancel:     cancel,
		stdin:      stdinW,
		stdout:     stdoutR,
		stderrTail: &tailBuffer{}, //nolint:exhaustruct
		exited:     make(chan struct{}),
	}

	stderrDone := make(chan struct{})

	go func() {
		defer close(stderrDone)

		_, _ = io.Copy(handle.stderrTail, stderrR)
	}()

	go handle.reap(stderrR, stderrDone)

	return handle, nil
}

// reap waits for the child and then unwinds the stderr drain.
//
// Order matters. Waiting on the drain first would reintroduce the hang class
// Close exists to prevent: a surviving grandchild keeps stderr's write end
// open, so the drain would block on an EOF that never arrives. Reaping first
// and then closing the read end bounds it -- at the cost of a few trailing
// bytes from a process that has already outlived its parent.
func (h *StreamHandle) reap(stderrR *os.File, stderrDone <-chan struct{}) {
	defer close(h.exited)

	h.exitCode = waitExitCode(h.cmd)

	_ = stderrR.Close()

	<-stderrDone
}

// Stdin is the child's standard input.
//
// It is deliberately an io.Writer, not an io.WriteCloser: closing stdin is a
// shutdown signal with ordering constraints, so it goes through CloseStdin.
func (h *StreamHandle) Stdin() io.Writer { return h.stdin }

// Stdout is the child's standard output, untouched. Reads return io.EOF once
// the child exits and no descendant holds the write end.
func (h *StreamHandle) Stdout() io.Reader { return h.stdout }

// Pid returns the process ID of the child process.
func (h *StreamHandle) Pid() int {
	if h.cmd.Process == nil {
		return -1
	}

	return h.cmd.Process.Pid
}

// Exited is closed once the child has been reaped and ExitCode is final.
func (h *StreamHandle) Exited() <-chan struct{} { return h.exited }

// ExitCode reports the child's exit status, or -1 while it is still running.
func (h *StreamHandle) ExitCode() int {
	select {
	case <-h.exited:
		return h.exitCode
	default:
		return -1
	}
}

// StderrTail returns the last stderrTailBytes the child wrote to stderr. Read
// it after Exited closes for the full picture; earlier reads are safe but may
// be truncated mid-stream.
func (h *StreamHandle) StderrTail() string { return h.stderrTail.String() }

// CloseStdin closes the child's stdin without killing it.
//
// This is the graceful half of teardown: a well-behaved protocol agent treats
// EOF on stdin as "finish up and exit", so callers that want a clean shutdown
// should call this, wait on Exited for as long as they are willing, and only
// then call Close. Idempotent.
func (h *StreamHandle) CloseStdin() error {
	var err error

	h.stdinOnce.Do(func() { err = h.stdin.Close() })

	return err
}

// Close terminates the process and waits for it to be reaped. Idempotent.
//
// Like ChildProcessHandle.Close, this must never block indefinitely. Two
// independent mechanisms guarantee that a caller's decoder, parked in Read
// between frames, is released: killing the process group drops the last write
// end so the pipe reaches EOF, and closing the read end unblocks read(2)
// directly. Either suffices on its own; both are here because the group kill is
// a no-op where process groups do not exist and cannot reach a descendant that
// escaped the group.
//
// The returned error is always nil; it exists so a StreamHandle satisfies
// io.Closer. Use ExitCode and StderrTail for diagnosis -- after a kill, the
// wait error only ever says the child was signalled, which is the intent.
func (h *StreamHandle) Close() error {
	h.closeOnce.Do(func() {
		_ = h.CloseStdin()

		// Take down the whole tree first. exec.CommandContext's own cancel only
		// signals the direct child, leaving grandchildren holding the pipes.
		killProcessGroup(h.cmd)

		// Always release the context too: it is the fallback on platforms with
		// no process groups, and it stops CommandContext leaking a watcher.
		h.cancel()

		// Belt to the kill's braces: reaches a reader parked in read(2) even
		// when a descendant escaped the group and still holds the write end.
		_ = h.stdout.Close()

		<-h.exited
	})

	return nil
}

// closeAll closes every file, ignoring errors. Used only on teardown paths
// where nothing can be done about a failure.
func closeAll(files ...*os.File) {
	for _, file := range files {
		_ = file.Close()
	}
}

// tailBuffer retains the last stderrTailBytes written to it.
//
// A child's stderr has to be drained or its pipe buffer fills and the child
// blocks, but the volume is unbounded and almost all of it is noise. The tail
// is the useful part: when a handshake fails, the child explains itself in the
// last thing it said.
type tailBuffer struct {
	mu  sync.Mutex
	buf []byte
}

func (t *tailBuffer) Write(p []byte) (int, error) {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.buf = append(t.buf, p...)

	if len(t.buf) > stderrTailBytes {
		// Shift the tail down in place; append over a zeroed length is a
		// memmove, so the overlap is safe and the backing array stays bounded.
		t.buf = append(t.buf[:0], t.buf[len(t.buf)-stderrTailBytes:]...)
	}

	return len(p), nil
}

func (t *tailBuffer) String() string {
	t.mu.Lock()
	defer t.mu.Unlock()

	return string(t.buf)
}
