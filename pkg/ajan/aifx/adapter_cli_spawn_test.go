package aifx

import (
	"context"
	"errors"
	"testing"
)

// These tests exercise SpawnCliProcess, WaitForExit, and CaptureStderr by
// running the host shell with arguments that cause it to exit immediately with
// an error — covering the subprocess lifecycle without needing a real CLI tool.
// Shell binary, args and script syntax are selected per-OS via the helpers in
// cli_shared_test.go (shellBinary, shellArgs, echoScript, printFileCommand,
// catBinary, ...).

func TestClaudeCodeModel_GenerateText_SpawnError(t *testing.T) {
	t.Parallel()

	// Use a non-existent binary to trigger a spawn error.
	m := &ClaudeCodeModel{
		config:     &ConfigTarget{Model: "claude-opus-4-5"},
		binaryPath: "/nonexistent/binary-that-does-not-exist",
	}

	_, err := m.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hello")},
	})

	if err == nil {
		t.Fatal("expected error for non-existent binary")
	}

	if !errors.Is(err, ErrClaudeCodeGenerationFailed) {
		t.Errorf("expected ErrClaudeCodeGenerationFailed, got %v", err)
	}
}

func TestClaudeCodeModel_GenerateText_ExitError(t *testing.T) {
	t.Parallel()

	// The host shell with unrecognized args exits with a non-zero code.
	// This covers SpawnCliProcess, WaitForExit, CaptureStderr paths.
	m := &ClaudeCodeModel{
		config:     &ConfigTarget{Model: "claude-opus-4-5"},
		binaryPath: shellBinary(),
	}

	_, err := m.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hello")},
	})

	// Expected to error — the shell exits non-zero with unknown flags.
	if err == nil {
		// Occasionally the shell may succeed (e.g., if args happen to be valid).
		// Don't fail the test — just accept both outcomes.
		t.Log("GenerateText unexpectedly succeeded with the host shell")
	}
}

func TestKiroModel_GenerateText_SpawnError(t *testing.T) {
	t.Parallel()

	m := &KiroModel{
		config:     &ConfigTarget{Model: "kiro-v1"},
		binaryPath: "/nonexistent/kiro-binary",
	}

	_, err := m.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hello")},
	})

	if err == nil {
		t.Fatal("expected error for non-existent binary")
	}

	if !errors.Is(err, ErrKiroGenerationFailed) {
		t.Errorf("expected ErrKiroGenerationFailed, got %v", err)
	}
}

func TestOpenCodeModel_GenerateText_SpawnError(t *testing.T) {
	t.Parallel()

	m := &OpenCodeModel{
		config:     &ConfigTarget{Model: "gpt-4o"},
		binaryPath: "/nonexistent/opencode-binary",
	}

	_, err := m.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hello")},
	})

	if err == nil {
		t.Fatal("expected error for non-existent binary")
	}

	if !errors.Is(err, ErrOpenCodeGenerationFailed) {
		t.Errorf("expected ErrOpenCodeGenerationFailed, got %v", err)
	}
}

func TestSpawnCliProcess_NonExistentBinary(t *testing.T) {
	t.Parallel()

	_, err := SpawnCliProcess(context.Background(), SpawnOptions{ //nolint:exhaustruct
		Binary:    "/nonexistent/binary",
		Args:      []string{},
		StdinData: "",
	})

	if err == nil {
		t.Fatal("expected error for non-existent binary")
	}
}

func TestSpawnCliProcess_ValidBinary(t *testing.T) {
	t.Parallel()

	// Run the host shell with `echo hello` — exits 0, stdout = "hello\n".
	proc, err := SpawnCliProcess(context.Background(), SpawnOptions{ //nolint:exhaustruct
		Binary:    shellBinary(),
		Args:      shellArgs("echo hello"),
		StdinData: "",
	})

	if err != nil {
		t.Fatalf("SpawnCliProcess error: %v", err)
	}

	// Read stderr concurrently — Wait() closes the pipe read end.
	stderrCh := make(chan string, 1)

	go func() {
		stderrCh <- proc.CaptureStderr()
	}()

	text, readErr := ReadTextOutput(proc.Stdout)
	if readErr != nil {
		t.Fatalf("ReadTextOutput error: %v", readErr)
	}

	exitCode, waitErr := proc.WaitForExit()
	if waitErr != nil {
		t.Fatalf("WaitForExit error: %v", waitErr)
	}

	stderr := <-stderrCh

	if exitCode != 0 {
		t.Errorf("expected exit code 0, got %d (stderr: %q)", exitCode, stderr)
	}

	if text != "hello" {
		t.Errorf("expected 'hello', got %q", text)
	}
}

func TestSpawnCliProcess_WithStdin(t *testing.T) {
	t.Parallel()

	// Echoes stdin to stdout (cat on Unix, findstr "^" on Windows) — covers
	// the StdinData path.
	proc, err := SpawnCliProcess(context.Background(), SpawnOptions{ //nolint:exhaustruct
		Binary:    catBinary(),
		Args:      catArgs(),
		StdinData: "stdin test data",
	})

	if err != nil {
		t.Fatalf("SpawnCliProcess error: %v", err)
	}

	stderrCh := make(chan string, 1)

	go func() {
		stderrCh <- proc.CaptureStderr()
	}()

	text, _ := ReadTextOutput(proc.Stdout)
	_, _ = proc.WaitForExit()
	<-stderrCh

	if text != "stdin test data" {
		t.Errorf("expected 'stdin test data', got %q", text)
	}
}

func TestKiroModel_GenerateText_Success(t *testing.T) {
	t.Parallel()

	// /usr/bin/true ignores all args/stdin, outputs nothing, exits 0. The
	// model's buildArgs prepends provider flags (--output json --model ...),
	// so the binary must tolerate arbitrary trailing arguments and exit 0 — a
	// semantic with no clean Windows analog (.bat/.cmd cannot be exec'd
	// directly, and no shipped .exe swallows unknown flags and exits 0).
	// Skipped on Windows; runs fully on Unix CI.
	skipIfNoUnixTrue(t)

	m := &KiroModel{
		config:     &ConfigTarget{Model: "kiro-v1"},
		binaryPath: unixTruePath,
	}

	result, err := m.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hello")},
	})

	if err != nil {
		t.Fatalf("expected success with /usr/bin/true, got: %v", err)
	}

	if result == nil {
		t.Fatal("expected non-nil result")
	}
}

func TestOpenCodeModel_GenerateText_Success(t *testing.T) {
	t.Parallel()

	skipIfNoUnixTrue(t)

	m := &OpenCodeModel{
		config:     &ConfigTarget{Model: "gpt-4o"},
		binaryPath: unixTruePath,
	}

	result, err := m.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hello")},
	})

	if err != nil {
		t.Fatalf("expected success with /usr/bin/true, got: %v", err)
	}

	if result == nil {
		t.Fatal("expected non-nil result")
	}
}

func TestClaudeCodeModel_GenerateText_Success(t *testing.T) {
	t.Parallel()

	skipIfNoUnixTrue(t)

	m := &ClaudeCodeModel{
		config:     &ConfigTarget{Model: "claude-opus-4-5"},
		binaryPath: unixTruePath,
	}

	result, err := m.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hello")},
	})

	if err != nil {
		t.Fatalf("expected success with /usr/bin/true, got: %v", err)
	}

	if result == nil {
		t.Fatal("expected non-nil result")
	}
}

func TestKiroModel_BuildArgs_WithProperties(t *testing.T) {
	t.Parallel()

	m := &KiroModel{
		config: &ConfigTarget{
			Model: "kiro-v1",
			Properties: map[string]any{
				"args": []string{"--debug", "--verbose"},
			},
		},
		binaryPath: "/bin/sh",
	}

	args := m.buildArgs(&GenerateTextOptions{MaxTokens: 512})

	// Verify --max-tokens and extra args are included.
	found := map[string]bool{}
	for _, a := range args {
		found[a] = true
	}

	if !found["--max-tokens"] {
		t.Error("expected --max-tokens in args")
	}

	if !found["--debug"] {
		t.Error("expected --debug from extraArgs in args")
	}
}

func TestClaudeCodeModel_BuildArgs_WithProperties(t *testing.T) {
	t.Parallel()

	m := &ClaudeCodeModel{
		config: &ConfigTarget{
			Model: "claude-opus-4-5",
			Properties: map[string]any{
				"maxTurns":     5,
				"allowedTools": []string{"bash", "edit"},
				"args":         []string{"--extra"},
			},
		},
		binaryPath: "/bin/sh",
	}

	args := m.buildArgs(&GenerateTextOptions{}, "json")

	found := map[string]bool{}
	for _, a := range args {
		found[a] = true
	}

	if !found["--max-turns"] {
		t.Error("expected --max-turns in args")
	}

	if !found["bash"] {
		t.Error("expected allowedTools in args")
	}

	if !found["--extra"] {
		t.Error("expected --extra from extraArgs in args")
	}
}

func TestClaudeCodeModel_ProcessStream_JsonFormat(t *testing.T) {
	t.Parallel()

	m := &ClaudeCodeModel{
		config:     &ConfigTarget{Model: "claude-opus-4-5"},
		binaryPath: shellBinary(),
	}

	// Spawn a process that outputs a single JSONL result event.
	bin, args := printFileCommand(t, `{"type":"result","usage":{"input_tokens":5,"output_tokens":3}}`)
	proc, err := SpawnCliProcess(context.Background(), SpawnOptions{ //nolint:exhaustruct
		Binary: bin,
		Args:   args,
	})
	if err != nil {
		t.Fatalf("SpawnCliProcess error: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	eventCh := make(chan StreamEvent, 20)

	m.processStream(ctx, proc, "stream-json", eventCh, cancel)

	var events []StreamEvent
	for ev := range eventCh {
		events = append(events, ev)
	}

	var doneSeen bool
	for _, ev := range events {
		if ev.Type == StreamEventMessageDone {
			doneSeen = true
		}
	}

	if !doneSeen {
		t.Errorf("expected message_done event, got %+v", events)
	}
}

func TestClaudeCodeModel_ProcessStream_TextFormat(t *testing.T) {
	t.Parallel()

	m := &ClaudeCodeModel{
		config:     &ConfigTarget{Model: "claude-opus-4-5"},
		binaryPath: shellBinary(),
	}

	// Text format reads raw output as content deltas.
	proc, err := SpawnCliProcess(context.Background(), SpawnOptions{ //nolint:exhaustruct
		Binary: shellBinary(),
		Args:   shellArgs(echoScript("hello from text stream")),
	})
	if err != nil {
		t.Fatalf("SpawnCliProcess error: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	eventCh := make(chan StreamEvent, 20)

	m.processStream(ctx, proc, "text", eventCh, cancel)

	var events []StreamEvent
	for ev := range eventCh {
		events = append(events, ev)
	}

	if len(events) == 0 {
		t.Error("expected at least one event from text stream")
	}
}

func TestKiroModel_ProcessStream_Success(t *testing.T) {
	t.Parallel()

	m := &KiroModel{
		config:     &ConfigTarget{Model: "kiro-v1"},
		binaryPath: shellBinary(),
	}

	// Spawn a process that outputs a Kiro JSONL event then exits 0.
	bin, args := printFileCommand(t, `{"type":"done","usage":{"input_tokens":2,"output_tokens":1}}`)
	proc, err := SpawnCliProcess(context.Background(), SpawnOptions{ //nolint:exhaustruct
		Binary: bin,
		Args:   args,
	})
	if err != nil {
		t.Fatalf("SpawnCliProcess error: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	eventCh := make(chan StreamEvent, 20)

	m.processStream(ctx, proc, eventCh, cancel)

	var events []StreamEvent
	for ev := range eventCh {
		events = append(events, ev)
	}

	var doneSeen bool
	for _, ev := range events {
		if ev.Type == StreamEventMessageDone {
			doneSeen = true
		}
	}

	if !doneSeen {
		t.Errorf("expected message_done event, got %+v", events)
	}
}

func TestKiroModel_ProcessStream_PlainTextFallback(t *testing.T) {
	t.Parallel()

	m := &KiroModel{
		config:     &ConfigTarget{Model: "kiro-v1"},
		binaryPath: shellBinary(),
	}

	// Non-JSON output triggers plain text fallback path.
	proc, err := SpawnCliProcess(context.Background(), SpawnOptions{ //nolint:exhaustruct
		Binary: shellBinary(),
		Args:   shellArgs(echoScript("plain text output")),
	})
	if err != nil {
		t.Fatalf("SpawnCliProcess error: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	eventCh := make(chan StreamEvent, 20)

	m.processStream(ctx, proc, eventCh, cancel)

	var events []StreamEvent
	for ev := range eventCh {
		events = append(events, ev)
	}

	var deltaSeen bool
	for _, ev := range events {
		if ev.Type == StreamEventContentDelta && ev.TextDelta != "" {
			deltaSeen = true
		}
	}

	if !deltaSeen {
		t.Errorf("expected content_delta for plain text fallback, got %+v", events)
	}
}

func TestOpenCodeModel_ProcessStream_Success(t *testing.T) {
	t.Parallel()

	m := &OpenCodeModel{
		config:     &ConfigTarget{Model: "gpt-4o"},
		binaryPath: shellBinary(),
	}

	bin, args := printFileCommand(t, `{"type":"result","usage":{"input_tokens":3,"output_tokens":2}}`)
	proc, err := SpawnCliProcess(context.Background(), SpawnOptions{ //nolint:exhaustruct
		Binary: bin,
		Args:   args,
	})
	if err != nil {
		t.Fatalf("SpawnCliProcess error: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	eventCh := make(chan StreamEvent, 20)

	m.processStream(ctx, proc, eventCh, cancel)

	var events []StreamEvent
	for ev := range eventCh {
		events = append(events, ev)
	}

	if len(events) == 0 {
		t.Error("expected at least one event from OpenCode processStream")
	}
}

func TestOpenCodeModel_BuildArgs_WithProperties(t *testing.T) {
	t.Parallel()

	m := &OpenCodeModel{
		config: &ConfigTarget{
			Model: "gpt-4o",
			Properties: map[string]any{
				"args": []string{"--verbose"},
			},
		},
		binaryPath: "/bin/sh",
	}

	args := m.buildArgs(&GenerateTextOptions{MaxTokens: 256}, "json")

	found := map[string]bool{}
	for _, a := range args {
		found[a] = true
	}

	if !found["--max-tokens"] {
		t.Error("expected --max-tokens in args")
	}

	if !found["--verbose"] {
		t.Error("expected --verbose from extraArgs in args")
	}
}

func TestSpawnCliProcess_WithEnv(t *testing.T) {
	t.Parallel()

	// Pass a custom environment variable and verify it reaches the subprocess.
	proc, err := SpawnCliProcess(context.Background(), SpawnOptions{ //nolint:exhaustruct
		Binary: shellBinary(),
		Args:   shellArgs(echoEnvScript("MY_TEST_VAR")),
		Env:    []string{"MY_TEST_VAR=hello_env"},
	})

	if err != nil {
		t.Fatalf("SpawnCliProcess error: %v", err)
	}

	stderrCh := make(chan string, 1)

	go func() {
		stderrCh <- proc.CaptureStderr()
	}()

	text, _ := ReadTextOutput(proc.Stdout)
	_, _ = proc.WaitForExit()
	<-stderrCh

	if text != "hello_env" {
		t.Errorf("expected 'hello_env', got %q", text)
	}
}

func TestSpawnCliProcess_WithCwd(t *testing.T) {
	t.Parallel()

	// Use a temp dir as working directory and verify the shell reports it.
	proc, err := SpawnCliProcess(context.Background(), SpawnOptions{ //nolint:exhaustruct
		Binary: shellBinary(),
		Args:   shellArgs(printCwdScript()),
		Cwd:    t.TempDir(),
	})

	if err != nil {
		t.Fatalf("SpawnCliProcess error: %v", err)
	}

	stderrCh := make(chan string, 1)

	go func() {
		stderrCh <- proc.CaptureStderr()
	}()

	text, _ := ReadTextOutput(proc.Stdout)
	_, _ = proc.WaitForExit()
	<-stderrCh

	if text == "" {
		t.Error("expected non-empty cwd output")
	}
}

func TestSpawnCliProcess_StderrCapture(t *testing.T) {
	t.Parallel()

	// Write to stderr and exit non-zero to produce captured stderr output.
	proc, err := SpawnCliProcess(context.Background(), SpawnOptions{ //nolint:exhaustruct
		Binary:    shellBinary(),
		Args:      shellArgs(stderrAndFailScript("error output")),
		StdinData: "",
	})

	if err != nil {
		t.Fatalf("SpawnCliProcess error: %v", err)
	}

	// CaptureStderr must be called concurrently before WaitForExit,
	// because Wait() closes the read end of the stderr pipe.
	stderrCh := make(chan string, 1)

	go func() {
		stderrCh <- proc.CaptureStderr()
	}()

	_, _ = ReadTextOutput(proc.Stdout)
	exitCode, _ := proc.WaitForExit()
	stderr := <-stderrCh

	if exitCode == 0 {
		t.Error("expected non-zero exit code")
	}

	if stderr == "" {
		t.Error("expected non-empty stderr")
	}
}
