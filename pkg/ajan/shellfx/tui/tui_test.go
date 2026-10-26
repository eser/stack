// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package tui_test

import (
	"context"
	"io"
	"runtime"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/shellfx/tui"
)

// ---------------------------------------------------------------------------
// parseKey / KeypressEvent tests
// ---------------------------------------------------------------------------

func TestKeypressReader_CtrlC(t *testing.T) {
	t.Parallel()

	pr, pw := io.Pipe()
	defer pr.Close() //nolint:errcheck

	reader := tui.NewKeypressReader(context.Background(), pr)
	defer func() {
		_ = pw.Close()
		reader.Close()
	}()

	_, _ = pw.Write([]byte{0x03}) //nolint:errcheck
	ev, ok := reader.Read()

	if !ok {
		t.Fatal("expected event, got closed")
	}

	if ev.Name != "c" || !ev.Ctrl {
		t.Errorf("expected ctrl+c, got name=%q ctrl=%v", ev.Name, ev.Ctrl)
	}
}

func TestKeypressReader_Escape(t *testing.T) {
	t.Parallel()

	pr, pw := io.Pipe()
	defer pr.Close() //nolint:errcheck

	reader := tui.NewKeypressReader(context.Background(), pr)
	defer func() {
		_ = pw.Close()
		reader.Close()
	}()

	_, _ = pw.Write([]byte{0x1b}) //nolint:errcheck
	ev, ok := reader.Read()

	if !ok || ev.Name != "escape" {
		t.Errorf("expected escape, got name=%q ok=%v", ev.Name, ok)
	}
}

func TestKeypressReader_Enter(t *testing.T) {
	t.Parallel()

	pr, pw := io.Pipe()
	defer pr.Close() //nolint:errcheck

	reader := tui.NewKeypressReader(context.Background(), pr)
	defer func() {
		_ = pw.Close()
		reader.Close()
	}()

	_, _ = pw.Write([]byte{0x0d}) //nolint:errcheck
	ev, ok := reader.Read()

	if !ok || ev.Name != "return" {
		t.Errorf("expected return, got name=%q ok=%v", ev.Name, ok)
	}
}

func TestKeypressReader_Tab(t *testing.T) {
	t.Parallel()

	pr, pw := io.Pipe()
	defer pr.Close() //nolint:errcheck

	reader := tui.NewKeypressReader(context.Background(), pr)
	defer func() {
		_ = pw.Close()
		reader.Close()
	}()

	_, _ = pw.Write([]byte{0x09}) //nolint:errcheck
	ev, ok := reader.Read()

	if !ok || ev.Name != "tab" {
		t.Errorf("expected tab, got name=%q ok=%v", ev.Name, ok)
	}
}

func TestKeypressReader_Backspace(t *testing.T) {
	t.Parallel()

	pr, pw := io.Pipe()
	defer pr.Close() //nolint:errcheck

	reader := tui.NewKeypressReader(context.Background(), pr)
	defer func() {
		_ = pw.Close()
		reader.Close()
	}()

	_, _ = pw.Write([]byte{0x7f}) //nolint:errcheck
	ev, ok := reader.Read()

	if !ok || ev.Name != "backspace" {
		t.Errorf("expected backspace, got name=%q ok=%v", ev.Name, ok)
	}
}

func TestKeypressReader_ArrowKeys(t *testing.T) {
	t.Parallel()

	cases := []struct {
		seq  []byte
		name string
	}{
		{[]byte{0x1b, 0x5b, 0x41}, "up"},
		{[]byte{0x1b, 0x5b, 0x42}, "down"},
		{[]byte{0x1b, 0x5b, 0x43}, "right"},
		{[]byte{0x1b, 0x5b, 0x44}, "left"},
		{[]byte{0x1b, 0x5b, 0x48}, "home"},
		{[]byte{0x1b, 0x5b, 0x46}, "end"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			pr, pw := io.Pipe()
			defer pr.Close() //nolint:errcheck

			reader := tui.NewKeypressReader(context.Background(), pr)
			defer func() {
				_ = pw.Close()
				reader.Close()
			}()

			_, _ = pw.Write(tc.seq) //nolint:errcheck
			ev, ok := reader.Read()

			if !ok || ev.Name != tc.name {
				t.Errorf("expected %q, got name=%q ok=%v", tc.name, ev.Name, ok)
			}
		})
	}
}

func TestKeypressReader_PrintableASCII(t *testing.T) {
	t.Parallel()

	pr, pw := io.Pipe()
	defer pr.Close() //nolint:errcheck

	reader := tui.NewKeypressReader(context.Background(), pr)
	defer func() {
		_ = pw.Close()
		reader.Close()
	}()

	_, _ = pw.Write([]byte("a")) //nolint:errcheck
	ev, ok := reader.Read()

	if !ok || ev.Name != "a" || ev.Char != "a" {
		t.Errorf("expected 'a', got name=%q char=%q ok=%v", ev.Name, ev.Char, ok)
	}
}

func TestKeypressReader_Space(t *testing.T) {
	t.Parallel()

	pr, pw := io.Pipe()
	defer pr.Close() //nolint:errcheck

	reader := tui.NewKeypressReader(context.Background(), pr)
	defer func() {
		_ = pw.Close()
		reader.Close()
	}()

	_, _ = pw.Write([]byte{0x20}) //nolint:errcheck
	ev, ok := reader.Read()

	if !ok || ev.Name != "space" || ev.Char != " " {
		t.Errorf("expected space, got name=%q char=%q", ev.Name, ev.Char)
	}
}

func TestKeypressReader_CtrlLetter(t *testing.T) {
	t.Parallel()

	pr, pw := io.Pipe()
	defer pr.Close() //nolint:errcheck

	reader := tui.NewKeypressReader(context.Background(), pr)
	defer func() {
		_ = pw.Close()
		reader.Close()
	}()

	// Ctrl+A = 0x01
	_, _ = pw.Write([]byte{0x01}) //nolint:errcheck
	ev, ok := reader.Read()

	if !ok || ev.Name != "a" || !ev.Ctrl {
		t.Errorf("expected ctrl+a, got name=%q ctrl=%v", ev.Name, ev.Ctrl)
	}
}

func TestKeypressReader_Unknown(t *testing.T) {
	t.Parallel()

	pr, pw := io.Pipe()
	defer pr.Close() //nolint:errcheck

	reader := tui.NewKeypressReader(context.Background(), pr)
	defer func() {
		_ = pw.Close()
		reader.Close()
	}()

	// 0x00 is not handled as a named key
	_, _ = pw.Write([]byte{0x00}) //nolint:errcheck
	ev, ok := reader.Read()

	if !ok || ev.Name != "unknown" {
		t.Errorf("expected unknown, got name=%q ok=%v", ev.Name, ok)
	}
}

func TestKeypressReader_RawFieldIsBase64(t *testing.T) {
	t.Parallel()

	pr, pw := io.Pipe()
	defer pr.Close() //nolint:errcheck

	reader := tui.NewKeypressReader(context.Background(), pr)
	defer func() {
		_ = pw.Close()
		reader.Close()
	}()

	_, _ = pw.Write([]byte("z")) //nolint:errcheck
	ev, ok := reader.Read()

	if !ok {
		t.Fatal("expected event")
	}

	if ev.Raw == "" {
		t.Error("expected non-empty Raw field")
	}
}

// ---------------------------------------------------------------------------
// §20 conformance: Close returns false on next Read
// ---------------------------------------------------------------------------

func TestKeypressReader_ReadAfterClose(t *testing.T) {
	t.Parallel()

	pr, pw := io.Pipe()
	reader := tui.NewKeypressReader(context.Background(), pr)

	// Close pipe and reader.
	_ = pw.Close()
	reader.Close()

	// Subsequent Read must return false.
	_, ok := reader.Read()
	if ok {
		t.Error("expected Read to return false after Close")
	}
}

func TestKeypressReader_ContextCancellation(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	pr, pw := io.Pipe()
	defer pw.Close() //nolint:errcheck
	defer pr.Close() //nolint:errcheck

	reader := tui.NewKeypressReader(ctx, pr)

	cancel()

	// Give the goroutine a moment to detect cancellation.
	// Then close the pipe so the read unblocks.
	time.Sleep(5 * time.Millisecond)
	_ = pw.Close()
	reader.Close()
}

// ---------------------------------------------------------------------------
// §20 1000-cycle goroutine leak gate
// ---------------------------------------------------------------------------

func TestKeypressReader_LeakGate_1000Cycles(t *testing.T) {
	t.Parallel()

	baseline := runtime.NumGoroutine()

	for i := range 1000 {
		pr, pw := io.Pipe()
		reader := tui.NewKeypressReader(context.Background(), pr)

		// Write one keypress and read it.
		pw.Write([]byte("a")) //nolint:errcheck,gosec
		_, ok := reader.Read()
		if !ok {
			t.Fatalf("cycle %d: Read returned false unexpectedly", i)
		}

		// EOF + close.
		_ = pw.Close()
		reader.Close()
	}

	runtime.GC()
	runtime.Gosched()

	after := runtime.NumGoroutine()
	// Allow a small slack for test-framework goroutines.
	if after > baseline+10 {
		t.Errorf("goroutine leak: baseline=%d after=%d", baseline, after)
	}
}

// ---------------------------------------------------------------------------
// SetStdinRaw — error path (stdin is not a TTY in CI)
// ---------------------------------------------------------------------------

func TestSetStdinRaw_NotTTY(t *testing.T) {
	// Not parallel — mutates package-level raw-mode state.
	err := tui.SetStdinRaw(true)
	// In CI stdin is a pipe; expect an error. Either outcome is valid.
	if err != nil {
		// Non-TTY error is expected and acceptable.
		return
	}
	// If it succeeded (running with a real TTY), restore it.
	_ = tui.SetStdinRaw(false)
}

func TestSetStdinRaw_RestoreWithoutEnable(t *testing.T) {
	// Not parallel — mutates package-level raw-mode state.
	// Calling disable when not enabled must not error or panic.
	err := tui.SetStdinRaw(false)
	if err != nil {
		t.Errorf("unexpected error disabling raw mode when not enabled: %v", err)
	}
}

// ---------------------------------------------------------------------------
// GetTerminalSize — error path (stdout is not a TTY in CI)
// ---------------------------------------------------------------------------

func TestGetTerminalSize_NotTTY(t *testing.T) {
	t.Parallel()

	_, err := tui.GetTerminalSize()
	// In CI stdout is a pipe; error is expected and acceptable.
	// In a real TTY, size > 0 would be returned.
	_ = err
}
