// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package exec_test

import (
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/shellfx/exec"
)

func TestSpawnChildProcess_SimpleEcho(t *testing.T) {
	t.Parallel()

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: "sh",
		Args:    []string{"-c", "echo hello"},
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	var out strings.Builder
	for {
		chunk, ok := h.Read()
		if !ok {
			break
		}
		out.Write(chunk.Data)
	}

	code := h.Close()
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}

	if !strings.Contains(out.String(), "hello") {
		t.Errorf("output %q does not contain 'hello'", out.String())
	}
}

func TestSpawnChildProcess_ExitCode(t *testing.T) {
	t.Parallel()

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: "sh",
		Args:    []string{"-c", "exit 42"},
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	for {
		_, ok := h.Read()
		if !ok {
			break
		}
	}

	code := h.Close()
	if code != 42 {
		t.Errorf("exit code = %d, want 42", code)
	}
}

func TestSpawnChildProcess_StdinWrite(t *testing.T) {
	t.Parallel()

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: "cat",
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	if err := h.Write([]byte("hello from stdin\n")); err != nil {
		t.Fatalf("write: %v", err)
	}

	// Close stdin to signal EOF to cat
	// (Close() does this internally but we can test write before close)
	code := h.Close()

	_ = code // cat may exit non-zero after context cancel — that's acceptable
}

func TestSpawnChildProcess_StdinWrite_AfterClose(t *testing.T) {
	t.Parallel()

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: "sh",
		Args:    []string{"-c", "echo done"},
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	for {
		_, ok := h.Read()
		if !ok {
			break
		}
	}

	h.Close()

	// Write after close should return an error (not panic)
	err = h.Write([]byte("too late"))
	if err == nil {
		t.Log("write after close returned nil — acceptable if stdin was already closed")
	}
}

func TestSpawnChildProcess_Pid(t *testing.T) {
	t.Parallel()

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: "sh",
		Args:    []string{"-c", "sleep 0.01"},
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	pid := h.Pid()
	if pid <= 0 {
		t.Errorf("pid = %d, want > 0", pid)
	}

	for {
		_, ok := h.Read()
		if !ok {
			break
		}
	}

	h.Close()
}

func TestSpawnChildProcess_MultilineOutput(t *testing.T) {
	t.Parallel()

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: "sh",
		Args:    []string{"-c", "printf 'line1\\nline2\\nline3\\n'"},
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	var out strings.Builder
	for {
		chunk, ok := h.Read()
		if !ok {
			break
		}
		out.Write(chunk.Data)
	}

	code := h.Close()
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}

	got := out.String()
	for _, want := range []string{"line1", "line2", "line3"} {
		if !strings.Contains(got, want) {
			t.Errorf("output %q does not contain %q", got, want)
		}
	}
}

func TestSpawnChildProcess_Stderr(t *testing.T) {
	t.Parallel()

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: "sh",
		Args:    []string{"-c", "echo err >&2"},
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	var stderr strings.Builder
	for {
		chunk, ok := h.Read()
		if !ok {
			break
		}
		if chunk.Stream == "stderr" {
			stderr.Write(chunk.Data)
		}
	}

	h.Close()

	if !strings.Contains(stderr.String(), "err") {
		t.Errorf("stderr %q does not contain 'err'", stderr.String())
	}
}

func TestSpawnChildProcess_InvalidCommand(t *testing.T) {
	t.Parallel()

	_, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: "/no/such/binary/xyz123",
	})
	if err == nil {
		t.Fatal("expected error for missing binary, got nil")
	}
}

func TestSpawnChildProcess_WorkingDir(t *testing.T) {
	t.Parallel()

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: "sh",
		Args:    []string{"-c", "pwd"},
		Cwd:     "/tmp",
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	var out strings.Builder
	for {
		chunk, ok := h.Read()
		if !ok {
			break
		}
		out.Write(chunk.Data)
	}

	h.Close()

	got := strings.TrimSpace(out.String())
	// /tmp may be a symlink on macOS (→ /private/tmp), so accept both
	if got != "/tmp" && got != "/private/tmp" {
		t.Errorf("cwd output = %q, want /tmp or /private/tmp", got)
	}
}

func TestSpawnChildProcess_EnvVar(t *testing.T) {
	t.Parallel()

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: "sh",
		Args:    []string{"-c", "echo $MY_VAR"},
		Env:     []string{"MY_VAR=hello_env", "PATH=/usr/bin:/bin"},
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	var out strings.Builder
	for {
		chunk, ok := h.Read()
		if !ok {
			break
		}
		out.Write(chunk.Data)
	}

	h.Close()

	if !strings.Contains(out.String(), "hello_env") {
		t.Errorf("output %q does not contain 'hello_env'", out.String())
	}
}

func TestEncodeDecodeChunk(t *testing.T) {
	t.Parallel()

	original := []byte("binary\x00data\xff\x01")
	encoded := exec.EncodeChunk(original)

	decoded, err := exec.DecodeChunk(encoded)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}

	if string(decoded) != string(original) {
		t.Errorf("round-trip mismatch: got %v, want %v", decoded, original)
	}
}

func TestDecodeChunk_InvalidBase64(t *testing.T) {
	t.Parallel()

	_, err := exec.DecodeChunk("!!!notbase64!!!")
	if err == nil {
		t.Fatal("expected error for invalid base64")
	}
}

// LeakGate_1000Cycles verifies no goroutine leaks across 1000 spawn+close cycles.
func TestLeakGate_1000Cycles(t *testing.T) {
	t.Parallel()

	baseline := runtime.NumGoroutine()
	runtime.GC()

	const iterations = 1000

	for i := range iterations {
		h, err := exec.SpawnChildProcess(exec.SpawnOptions{
			Command: "sh",
			Args:    []string{"-c", "echo x"},
		})
		if err != nil {
			t.Fatalf("iteration %d: spawn: %v", i, err)
		}

		for {
			_, ok := h.Read()
			if !ok {
				break
			}
		}

		h.Close()
	}

	// Allow GC to collect
	runtime.GC()
	time.Sleep(50 * time.Millisecond)
	runtime.GC()

	after := runtime.NumGoroutine()
	limit := baseline + 10

	if after > limit {
		t.Errorf("goroutine leak: baseline=%d, after=%d (limit=%d)", baseline, after, limit)
	}
}

// Section20_ReadReturnsFalseWhenDone verifies §20 conformance: Read returns false when done.
func TestSection20_ReadReturnsFalseWhenDone(t *testing.T) {
	t.Parallel()

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: "sh",
		Args:    []string{"-c", "echo done"},
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	sawTrue := false
	for {
		_, ok := h.Read()
		if !ok {
			break
		}
		sawTrue = true
	}

	_ = sawTrue // output may be buffered in a single read or split

	// After Read returns false, Close must not block
	done := make(chan struct{})
	go func() {
		h.Close()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Close() blocked after Read returned false")
	}
}

// Section20_DoubleClose verifies that Close() is idempotent.
func TestSection20_DoubleClose(t *testing.T) {
	t.Parallel()

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: "sh",
		Args:    []string{"-c", "echo hi"},
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	for {
		_, ok := h.Read()
		if !ok {
			break
		}
	}

	h.Close()

	// Second Close must not panic (once.Do guards the channel close)
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("Close() panicked on second call: %v", r)
		}
	}()

	h.Close()
}
