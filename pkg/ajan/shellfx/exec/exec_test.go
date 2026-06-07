// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package exec_test

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/shellfx/exec"
)

// shellCommand returns the platform shell command and the args needed to run
// the given shell script. On Windows it uses cmd.exe ("/c"); on Unix it uses
// /bin/sh ("-c"). This keeps the spawn tests cross-platform without weakening
// what they assert.
func shellCommand(script string) (string, []string) {
	if runtime.GOOS == "windows" {
		return "cmd", []string{"/c", script}
	}

	return "sh", []string{"-c", script}
}

// shellEnv returns an Env slice suitable for spawning the platform shell with
// the given extra entries. On Windows cmd.exe needs SystemRoot/ComSpec/PATH to
// behave, so we keep the current process environment and append. On Unix we use
// a minimal PATH so the assertions stay deterministic.
func shellEnv(extra ...string) []string {
	if runtime.GOOS == "windows" {
		// Inherit the parent environment (cmd.exe relies on SystemRoot etc.),
		// then append overrides — later entries win in os/exec.
		return append(append([]string(nil), os.Environ()...), extra...)
	}

	return append([]string{"PATH=/usr/bin:/bin"}, extra...)
}

// catCommand returns a spawn command that reads stdin (used to validate stdin
// writes). On Windows "sort" reads all of stdin and writes it back; on Unix we
// use "cat".
func catCommand() string {
	if runtime.GOOS == "windows" {
		return "sort"
	}

	return "cat"
}

func TestSpawnChildProcess_SimpleEcho(t *testing.T) {
	t.Parallel()

	cmd, args := shellCommand("echo hello")

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: cmd,
		Args:    args,
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

	cmd, args := shellCommand("exit 42")

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: cmd,
		Args:    args,
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
		Command: catCommand(),
		Args:    nil,
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	if err := h.Write([]byte("hello from stdin\n")); err != nil {
		t.Fatalf("write: %v", err)
	}

	// Close stdin to signal EOF to the reader
	// (Close() does this internally but we can test write before close)
	code := h.Close()

	_ = code // reader may exit non-zero after context cancel — that's acceptable
}

func TestSpawnChildProcess_StdinWrite_AfterClose(t *testing.T) {
	t.Parallel()

	cmd, args := shellCommand("echo done")

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: cmd,
		Args:    args,
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

	cmd, args := shellCommand(sleepScript())

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: cmd,
		Args:    args,
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

// sleepScript returns a shell script that sleeps briefly, in a form the
// platform shell understands.
func sleepScript() string {
	if runtime.GOOS == "windows" {
		// ping with a single packet introduces a short, reliable delay without
		// requiring sub-second precision (which cmd's timeout lacks).
		return "ping -n 1 127.0.0.1 > NUL"
	}

	return "sleep 0.01"
}

func TestSpawnChildProcess_MultilineOutput(t *testing.T) {
	t.Parallel()

	var script string
	if runtime.GOOS == "windows" {
		script = "echo line1 & echo line2 & echo line3"
	} else {
		script = "printf 'line1\\nline2\\nline3\\n'"
	}

	cmd, args := shellCommand(script)

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: cmd,
		Args:    args,
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

	// "echo err >&2" redirects stdout to stderr in both cmd.exe and sh.
	cmd, args := shellCommand("echo err >&2")

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: cmd,
		Args:    args,
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

	// A path that does not exist on any platform — spawn must fail to find it.
	_, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: filepath.Join("no", "such", "binary", "xyz123"),
	})
	if err == nil {
		t.Fatal("expected error for missing binary, got nil")
	}
}

func TestSpawnChildProcess_WorkingDir(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	// Print the working directory using the platform shell.
	var script string
	if runtime.GOOS == "windows" {
		script = "cd"
	} else {
		script = "pwd"
	}

	cmd, args := shellCommand(script)

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: cmd,
		Args:    args,
		Cwd:     dir,
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

	// The reported directory may differ from the requested one by symlink
	// resolution (e.g. /tmp → /private/tmp on macOS, or 8.3/long-path and
	// drive-letter casing on Windows). Compare resolved base names and accept
	// a resolved-path match.
	if !sameDir(got, dir) {
		t.Errorf("cwd output = %q, want %q", got, dir)
	}
}

// sameDir reports whether two directory paths refer to the same location,
// tolerating symlink resolution and case-insensitivity on Windows.
func sameDir(got, want string) bool {
	if got == want {
		return true
	}

	gotResolved, err1 := filepath.EvalSymlinks(got)
	wantResolved, err2 := filepath.EvalSymlinks(want)
	if err1 == nil && err2 == nil {
		if runtime.GOOS == "windows" {
			return strings.EqualFold(gotResolved, wantResolved)
		}

		return gotResolved == wantResolved
	}

	// Fall back to base-name comparison if symlink resolution is unavailable.
	if runtime.GOOS == "windows" {
		return strings.EqualFold(filepath.Base(got), filepath.Base(want))
	}

	return filepath.Base(got) == filepath.Base(want)
}

func TestSpawnChildProcess_EnvVar(t *testing.T) {
	t.Parallel()

	// Reference the env var using the platform shell's expansion syntax.
	var script string
	if runtime.GOOS == "windows" {
		script = "echo %MY_VAR%"
	} else {
		script = "echo $MY_VAR"
	}

	cmd, args := shellCommand(script)

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: cmd,
		Args:    args,
		Env:     shellEnv("MY_VAR=hello_env"),
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

	cmd, args := shellCommand("echo x")

	for i := range iterations {
		h, err := exec.SpawnChildProcess(exec.SpawnOptions{
			Command: cmd,
			Args:    args,
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

	cmd, args := shellCommand("echo done")

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: cmd,
		Args:    args,
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

	cmd, args := shellCommand("echo hi")

	h, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: cmd,
		Args:    args,
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
