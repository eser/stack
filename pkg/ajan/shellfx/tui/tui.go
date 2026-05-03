// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package tui provides the Go-side keypress event source, raw-mode control,
// and terminal-size query used by the FFI bridge (EserAjanShellTui* exports).
package tui

import (
	"context"
	"encoding/base64"
	"io"
	"os"
	"sync"

	"golang.org/x/term"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// KeypressEvent is the wire-format for a single terminal input event.
// Resize events have Name="resize" and non-zero Cols/Rows.
type KeypressEvent struct {
	Name  string `json:"name"`
	Char  string `json:"char,omitempty"`
	Ctrl  bool   `json:"ctrl"`
	Meta  bool   `json:"meta"`
	Shift bool   `json:"shift"`
	Raw   string `json:"raw,omitempty"`  // base64-encoded raw bytes
	Cols  int    `json:"cols,omitempty"` // resize events only
	Rows  int    `json:"rows,omitempty"` // resize events only
}

// TerminalSize holds terminal dimensions in character cells.
type TerminalSize struct {
	Cols int `json:"cols"`
	Rows int `json:"rows"`
}

// ---------------------------------------------------------------------------
// KeypressReader — §20-conformant streaming handle
// ---------------------------------------------------------------------------

// KeypressReader reads and parses terminal keypress events from a byte stream.
// Lifecycle: NewKeypressReader → Read (poll) → Close.
type KeypressReader struct {
	events chan KeypressEvent
	done   chan struct{}
	once   sync.Once
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewKeypressReader creates a reader from r and immediately starts the read
// goroutine. r is typically os.Stdin for production; use io.Pipe for tests.
func NewKeypressReader(ctx context.Context, r io.Reader) *KeypressReader {
	rctx, cancel := context.WithCancel(ctx) //nolint:gosec // G118 false positive: cancel is stored in kr.cancel and called by Close
	kr := &KeypressReader{
		events: make(chan KeypressEvent, 64),
		done:   make(chan struct{}),
		cancel: cancel,
	}

	kr.wg.Add(1)
	go func() {
		defer kr.wg.Done()
		kr.readLoop(rctx, r)
	}()

	kr.startSIGWINCH(rctx)

	return kr
}

func (kr *KeypressReader) readLoop(ctx context.Context, r io.Reader) {
	buf := make([]byte, 32)

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		n, err := r.Read(buf)
		if err != nil {
			return
		}

		raw := make([]byte, n)
		copy(raw, buf[:n])
		event := parseKey(raw)

		select {
		case kr.events <- event:
		case <-ctx.Done():
			return
		}
	}
}

// Read blocks until the next event arrives or the reader is closed.
// Returns (event, true) on success; (zero, false) when permanently done.
func (kr *KeypressReader) Read() (KeypressEvent, bool) {
	select {
	case ev := <-kr.events:
		return ev, true
	case <-kr.done:
		// Drain any events buffered before Close was called.
		select {
		case ev := <-kr.events:
			return ev, true
		default:
			return KeypressEvent{}, false
		}
	}
}

// Close cancels the read loop, waits for all goroutines to exit, then
// signals done so subsequent Read calls return false.
func (kr *KeypressReader) Close() {
	kr.cancel()
	kr.wg.Wait()
	kr.once.Do(func() { close(kr.done) })
}

// ---------------------------------------------------------------------------
// Key parsing
// ---------------------------------------------------------------------------

func parseKey(raw []byte) KeypressEvent {
	encoded := base64.StdEncoding.EncodeToString(raw)

	// Ctrl+C
	if len(raw) == 1 && raw[0] == 0x03 {
		return KeypressEvent{Name: "c", Ctrl: true, Raw: encoded}
	}
	// Escape
	if len(raw) == 1 && raw[0] == 0x1b {
		return KeypressEvent{Name: "escape", Raw: encoded}
	}
	// Enter
	if len(raw) == 1 && (raw[0] == 0x0d || raw[0] == 0x0a) {
		return KeypressEvent{Name: "return", Raw: encoded}
	}
	// Tab
	if len(raw) == 1 && raw[0] == 0x09 {
		return KeypressEvent{Name: "tab", Raw: encoded}
	}
	// Backspace
	if len(raw) == 1 && raw[0] == 0x7f {
		return KeypressEvent{Name: "backspace", Raw: encoded}
	}
	// ANSI arrow / navigation sequences: ESC [ X
	if len(raw) >= 3 && raw[0] == 0x1b && raw[1] == 0x5b {
		switch raw[2] {
		case 0x41:
			return KeypressEvent{Name: "up", Raw: encoded}
		case 0x42:
			return KeypressEvent{Name: "down", Raw: encoded}
		case 0x43:
			return KeypressEvent{Name: "right", Raw: encoded}
		case 0x44:
			return KeypressEvent{Name: "left", Raw: encoded}
		case 0x48:
			return KeypressEvent{Name: "home", Raw: encoded}
		case 0x46:
			return KeypressEvent{Name: "end", Raw: encoded}
		}
	}
	// Ctrl+letter (0x01–0x1a, excluding already-handled 0x03/0x09/0x0a/0x0d)
	if len(raw) == 1 && raw[0] >= 0x01 && raw[0] <= 0x1a {
		return KeypressEvent{Name: string(rune(raw[0] + 0x60)), Ctrl: true, Raw: encoded}
	}
	// Space
	if len(raw) == 1 && raw[0] == 0x20 {
		return KeypressEvent{Name: "space", Char: " ", Raw: encoded}
	}
	// Printable ASCII
	if len(raw) == 1 && raw[0] >= 0x21 && raw[0] <= 0x7e {
		ch := string(rune(raw[0]))
		return KeypressEvent{Name: ch, Char: ch, Raw: encoded}
	}
	// Multi-byte UTF-8 printable character
	if len(raw) > 0 && raw[0] >= 0xc0 {
		ch := string(raw)
		return KeypressEvent{Name: ch, Char: ch, Raw: encoded}
	}

	return KeypressEvent{Name: "unknown", Raw: encoded}
}

// ---------------------------------------------------------------------------
// Raw mode
// ---------------------------------------------------------------------------

var (
	rawMu    sync.Mutex
	rawState *term.State
	rawFd    int
)

// SetStdinRaw enables or disables raw mode on os.Stdin.
// Returns an error if stdin is not a TTY (e.g., in CI or pipes).
func SetStdinRaw(enable bool) error {
	fd := int(os.Stdin.Fd())

	rawMu.Lock()
	defer rawMu.Unlock()

	if enable {
		state, err := term.MakeRaw(fd)
		if err != nil {
			return err
		}

		rawState = state
		rawFd = fd

		return nil
	}

	if rawState != nil {
		err := term.Restore(rawFd, rawState)
		rawState = nil
		rawFd = 0

		return err
	}

	return nil
}

// ---------------------------------------------------------------------------
// Terminal size
// ---------------------------------------------------------------------------

// GetTerminalSize returns the current terminal dimensions.
// Returns an error if stdout is not a TTY.
func GetTerminalSize() (TerminalSize, error) {
	cols, rows, err := term.GetSize(int(os.Stdout.Fd()))
	if err != nil {
		return TerminalSize{}, err
	}

	return TerminalSize{Cols: cols, Rows: rows}, nil
}
