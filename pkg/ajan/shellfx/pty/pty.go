// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package pty provides a real cross-platform pseudo-terminal used by the FFI
// bridge (EserAjanShellPty* exports). It mirrors the KeypressReader /
// ChildProcessHandle lifecycle: a goroutine pumps master-fd bytes onto a
// buffered channel that the TypeScript side polls one chunk at a time, so the
// blocking read never stalls the host event loop.
//
// Platform backends live in build-tag files: pty_unix.go (openpty + TIOCSWINSZ),
// pty_windows.go (ConPTY), and pty_other.go (unsupported stub). A PTY merges the
// child's stdout and stderr onto a single stream, so — unlike shellfx/exec — the
// output chunk carries no stream tag.
package pty

import (
	"context"
	"encoding/base64"
	"sync"
)

// SpawnOptions configures a pseudo-terminal child process.
type SpawnOptions struct {
	Command string
	Args    []string
	Cwd     string
	Env     []string
	Cols    int
	Rows    int
}

// Session is a running pseudo-terminal with bidirectional I/O.
// Lifecycle: Spawn → Read (poll) / Write / Resize → Kill (optional) → Close.
type Session struct {
	plat   *platform
	output chan []byte
	done   chan struct{}
	cancel context.CancelFunc
	wg     sync.WaitGroup // tracks the reader goroutine
	exitCh chan int

	// closeOnce ensures idempotent Close; exitCode cached after first call.
	closeOnce sync.Once
	exitCode  int
}

// Spawn starts a command attached to a new pseudo-terminal and returns a handle.
func Spawn(opts SpawnOptions) (*Session, error) {
	ctx, cancel := context.WithCancel(context.Background())

	plat, err := platformSpawn(ctx, opts)
	if err != nil {
		cancel()

		return nil, err
	}

	s := &Session{
		plat:   plat,
		output: make(chan []byte, 64),
		done:   make(chan struct{}),
		cancel: cancel,
		exitCh: make(chan int, 1),
	}

	s.wg.Add(1)
	go s.readerLoop()

	go s.watcherLoop()

	return s, nil
}

// readerLoop drains the PTY master into the output channel until EOF/error.
func (s *Session) readerLoop() {
	defer s.wg.Done()

	buf := make([]byte, 4096)

	for {
		n, err := platformRead(s.plat, buf)
		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buf[:n])

			select {
			case s.output <- chunk:
			case <-s.done:
				return
			}
		}

		if err != nil {
			return
		}
	}
}

// watcherLoop waits for the child to exit, unblocks and drains the reader, then
// releases resources and reports the exit code.
func (s *Session) watcherLoop() {
	code := platformWaitProcess(s.plat)

	// On Windows the output pipe only reaches EOF once the pseudoconsole is
	// closed, so this is what lets readerLoop drain the tail and return; on Unix
	// the master already EOFs when the child's fds close, so it is a no-op.
	platformAfterExit(s.plat)

	s.wg.Wait()

	// Close the master / remaining handles only after the reader has exited, so
	// we never close a handle that readerLoop is still reading.
	platformCleanup(s.plat)

	s.exitCh <- code
	close(s.output)
}

// Pid returns the process ID of the child, or -1 if not started.
func (s *Session) Pid() int {
	return platformPid(s.plat)
}

// Read returns the next output chunk. Returns (nil, false) when the PTY closed.
func (s *Session) Read() ([]byte, bool) {
	chunk, ok := <-s.output

	return chunk, ok
}

// Write sends data to the child via the PTY master.
func (s *Session) Write(data []byte) error {
	_, err := platformWrite(s.plat, data)

	return err
}

// Resize updates the PTY window size; the child receives SIGWINCH on Unix.
func (s *Session) Resize(cols, rows int) error {
	return platformResize(s.plat, cols, rows)
}

// Kill signals the child ("SIGKILL" for a hard kill, otherwise a graceful term).
func (s *Session) Kill(signal string) error {
	return platformKill(s.plat, signal)
}

// Close terminates the PTY, reaps the child, and returns its exit code. Idempotent.
func (s *Session) Close() int {
	s.closeOnce.Do(func() {
		// Terminate a still-running child so watcherLoop's process wait returns;
		// closing done lets a backpressured reader bail if nothing is draining.
		// watcherLoop owns master/handle teardown once the reader has exited.
		_ = platformKill(s.plat, "SIGTERM")
		close(s.done)
		s.cancel()
		s.exitCode = <-s.exitCh
	})

	return s.exitCode
}

// EncodeChunk base64-encodes chunk data for wire transmission.
func EncodeChunk(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}

// DecodeChunk base64-decodes data from wire format.
func DecodeChunk(s string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(s)
}
