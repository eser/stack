// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package tui_test

import (
	"context"
	"io"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/shellfx/tui"
)

// blockingReader parks in Read until the test releases it, standing in for
// raw-mode stdin: a descriptor with no pending input and no deadline support.
type blockingReader struct {
	release chan struct{}
}

func (b *blockingReader) Read(_ []byte) (int, error) {
	<-b.release

	return 0, io.EOF
}

// TestCloseWithReaderParkedInRead pins the fix for the uninterruptible Close.
//
// readLoop only checks ctx *between* reads. A goroutine parked inside r.Read
// never observes cancellation, so Close's unconditional kr.wg.Wait() blocked
// until the user happened to press a key. Because
// EserAjanShellTuiKeypressClose is a synchronous FFI symbol, that stalled the
// calling JS runtime's main thread.
func TestCloseWithReaderParkedInRead(t *testing.T) {
	t.Parallel()

	r := &blockingReader{release: make(chan struct{})}

	kr := tui.NewKeypressReader(context.Background(), r)

	// Let the read goroutine reach its blocking Read.
	time.Sleep(50 * time.Millisecond)

	done := make(chan struct{})

	go func() {
		kr.Close()
		close(done)
	}()

	select {
	case <-done:
		// Close returned despite the reader still being parked.
	case <-time.After(10 * time.Second):
		t.Fatal("Close blocked on a reader parked in Read")
	}

	// Read must report the reader as permanently done after Close.
	if _, ok := kr.Read(); ok {
		t.Fatal("Read returned an event after Close")
	}

	close(r.release)
}

// TestCloseIsIdempotent guards the once-guard on the done channel: a double
// Close must not panic on a second close of the same channel.
func TestCloseIsIdempotent(t *testing.T) {
	t.Parallel()

	r := &blockingReader{release: make(chan struct{})}
	kr := tui.NewKeypressReader(context.Background(), r)

	done := make(chan struct{})

	go func() {
		kr.Close()
		kr.Close()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(15 * time.Second):
		t.Fatal("repeated Close blocked")
	}

	close(r.release)
}

// TestCloseUnblocksPollableReader covers the good path: a reader that supports
// deadlines is interrupted immediately rather than waiting out the bound.
func TestCloseUnblocksPollableReader(t *testing.T) {
	t.Parallel()

	pr, pw := io.Pipe()

	defer func() { _ = pw.Close() }()

	kr := tui.NewKeypressReader(context.Background(), pr)

	time.Sleep(50 * time.Millisecond)

	start := time.Now()
	kr.Close()

	if elapsed := time.Since(start); elapsed > 8*time.Second {
		t.Fatalf("Close took %v; expected to return promptly", elapsed)
	}
}
