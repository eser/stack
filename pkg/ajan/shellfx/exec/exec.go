// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package exec

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"os/exec"
	"sync"
)

// OutputChunk is a single chunk of output from a child process.
type OutputChunk struct {
	Stream string // "stdout" or "stderr"
	Data   []byte
}

// ChildProcessHandle manages a running child process with bidirectional I/O.
// §20 streaming: Create → Read (poll) → Close.
type ChildProcessHandle struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	merged chan OutputChunk
	done   chan struct{}
	cancel context.CancelFunc
	wg     sync.WaitGroup // tracks stdout+stderr reader goroutines
	exitCh chan int

	// closeOnce ensures idempotent Close; exitCode cached after first call.
	closeOnce sync.Once
	exitCode  int
}

// SpawnOptions configures a child process.
type SpawnOptions struct {
	Command string
	Args    []string
	Cwd     string
	Env     []string
}

// SpawnChildProcess starts a child process and returns a handle.
func SpawnChildProcess(opts SpawnOptions) (*ChildProcessHandle, error) {
	ctx, cancel := context.WithCancel(context.Background())

	cmd := exec.CommandContext(ctx, opts.Command, opts.Args...)

	if opts.Cwd != "" {
		cmd.Dir = opts.Cwd
	}

	if len(opts.Env) > 0 {
		cmd.Env = opts.Env
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		return nil, err
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, err
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		cancel()
		return nil, err
	}

	h := &ChildProcessHandle{
		cmd:    cmd,
		stdin:  stdin,
		merged: make(chan OutputChunk, 64),
		done:   make(chan struct{}),
		cancel: cancel,
		exitCh: make(chan int, 1),
	}

	h.wg.Add(2)
	go h.readerLoop(stdout, "stdout")
	go h.readerLoop(stderr, "stderr")

	go h.watcherLoop()

	return h, nil
}

// readerLoop drains a reader and sends chunks to merged.
func (h *ChildProcessHandle) readerLoop(r io.Reader, stream string) {
	defer h.wg.Done()

	buf := make([]byte, 4096)

	for {
		n, err := r.Read(buf)
		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buf[:n])
			select {
			case h.merged <- OutputChunk{Stream: stream, Data: chunk}:
			case <-h.done:
				return
			}
		}
		if err != nil {
			return
		}
	}
}

// watcherLoop waits for readers to finish, reaps the process, and closes merged.
func (h *ChildProcessHandle) watcherLoop() {
	h.wg.Wait()

	code := 0
	if err := h.cmd.Wait(); err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			code = exitErr.ExitCode()
		} else {
			code = -1
		}
	}

	h.exitCh <- code
	close(h.merged)
}

// Pid returns the process ID of the child process.
func (h *ChildProcessHandle) Pid() int {
	if h.cmd.Process == nil {
		return -1
	}
	return h.cmd.Process.Pid
}

// Read returns the next output chunk. Returns ("", false) when the process has finished.
func (h *ChildProcessHandle) Read() (OutputChunk, bool) {
	chunk, ok := <-h.merged
	return chunk, ok
}

// Write sends data to the child process stdin. Returns false if the process is done.
func (h *ChildProcessHandle) Write(data []byte) error {
	_, err := h.stdin.Write(data)
	return err
}

// Close terminates the process and waits for cleanup. Idempotent.
func (h *ChildProcessHandle) Close() int {
	h.closeOnce.Do(func() {
		h.stdin.Close() //nolint:errcheck,gosec
		close(h.done)
		h.cancel()
		h.exitCode = <-h.exitCh
	})

	return h.exitCode
}

// EncodeChunk base64-encodes chunk data for wire transmission.
func EncodeChunk(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}

// DecodeChunk base64-decodes data from wire format.
func DecodeChunk(s string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(s)
}
