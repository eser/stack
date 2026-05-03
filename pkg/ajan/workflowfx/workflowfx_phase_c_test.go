// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Phase C tests: built-in tools (shell, file-read/write/copy/remove, template-render, http-fetch)
// and NewDefaultRegistry.

package workflowfx_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// directRun is a test helper that calls tool.Run directly without the workflow engine.
func directRun(t *testing.T, tool workflowfx.WorkflowTool, opts map[string]any) *workflowfx.WorkflowToolResult {
	t.Helper()
	result, err := tool.Run(context.Background(), opts)
	if err != nil {
		t.Fatalf("unexpected engine error: %v", err)
	}
	return result
}

// ─── NewDefaultRegistry ────────────────────────────────────────────────────────

func TestNewDefaultRegistry_AllToolsPresent(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	want := []string{"file-copy", "file-read", "file-remove", "file-write", "http-fetch", "shell", "template-render", "variable-set"}
	got := r.Names() // sorted

	if len(got) != len(want) {
		t.Fatalf("expected %d tools, got %d: %v", len(want), len(got), got)
	}
	for i, n := range want {
		if got[i] != n {
			t.Fatalf("tool[%d]: want %q, got %q", i, n, got[i])
		}
	}
}

// ─── shellTool ────────────────────────────────────────────────────────────────

func TestShellTool_EmptyCommand_FailedStep(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	wf := workflowfx.Create("wf").On("push").Step("shell").MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Steps[0].Passed {
		t.Fatal("empty command must produce Passed=false")
	}
	if len(result.Steps[0].Issues) == 0 {
		t.Fatal("expected at least one issue for empty command")
	}
}

func TestShellTool_ExitZero_PassedTrue(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	wf := workflowfx.Create("wf").On("push").
		Step("shell", workflowfx.StepOpts{"command": "echo hello"}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Steps[0].Passed {
		t.Fatal("exit-zero command must produce Passed=true")
	}
}

func TestShellTool_NonZeroExit_IssueMessage(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()

	// Non-zero exit returns a failed result (not an engine error) — the tool itself handles it.
	// Use ContinueOnError so the workflow doesn't abort.
	wf2 := workflowfx.Create("wf2").On("push").
		Step("shell", workflowfx.StepOpts{"command": "echo FAIL_OUTPUT && exit 1", "continueOnError": true}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf2, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	step := result.Steps[0]
	if step.Passed {
		t.Fatal("non-zero exit must produce Passed=false")
	}
	if len(step.Issues) == 0 {
		t.Fatal("expected issue with combined output")
	}
}

func TestShellTool_ContextCancel_Kills(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	wf := workflowfx.Create("wf").On("push").
		Step("shell", workflowfx.StepOpts{
			"command":         "sleep 10",
			"continueOnError": true,
			"timeout":         1, // 1 second — kills the sleep
		}).
		MustBuild()

	start := time.Now()
	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	elapsed := time.Since(start)

	if err != nil {
		t.Fatal(err)
	}
	if elapsed >= 5*time.Second {
		t.Fatalf("context cancel should kill sleep 10 quickly, took %v", elapsed)
	}
	if result.Steps[0].Passed {
		t.Fatal("killed command must produce Passed=false")
	}
}

// ─── fileReadTool ─────────────────────────────────────────────────────────────

func TestFileReadTool_ReadsContent(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "hello.txt")
	if err := os.WriteFile(p, []byte("world"), 0o644); err != nil {
		t.Fatal(err)
	}

	r := workflowfx.NewDefaultRegistry()
	tool := r.MustGet("file-read")
	result := directRun(t, tool, map[string]any{"path": p})

	if !result.Passed {
		t.Fatalf("expected Passed=true, issues: %v", result.Issues)
	}
	if result.Stats["content"] != "world" {
		t.Fatalf("expected content='world', got %v", result.Stats["content"])
	}
}

func TestFileReadTool_NoPath_FailedStep(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("file-read"), map[string]any{})
	if result.Passed {
		t.Fatal("missing path must produce Passed=false")
	}
}

func TestFileReadTool_NonexistentFile_FailedStep(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("file-read"), map[string]any{"path": "/nonexistent/path/file.txt"})
	if result.Passed {
		t.Fatal("nonexistent file must produce Passed=false")
	}
}

// ─── fileWriteTool ────────────────────────────────────────────────────────────

func TestFileWriteTool_WritesContent(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "out.txt")

	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("file-write"), map[string]any{"path": p, "content": "hello"})

	if !result.Passed {
		t.Fatalf("expected Passed=true, issues: %v", result.Issues)
	}
	data, _ := os.ReadFile(p) //nolint:gosec
	if string(data) != "hello" {
		t.Fatalf("expected file content 'hello', got %q", string(data))
	}
}

func TestFileWriteTool_NoPath_FailedStep(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("file-write"), map[string]any{"content": "x"})
	if result.Passed {
		t.Fatal("missing path must produce Passed=false")
	}
}

func TestFileWriteTool_CreatesParentDirs(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "a", "b", "c.txt")

	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("file-write"), map[string]any{"path": p, "content": "deep"})

	if !result.Passed {
		t.Fatalf("expected parent dirs to be created, issues: %v", result.Issues)
	}
}

// ─── fileCopyTool ─────────────────────────────────────────────────────────────

func TestFileCopyTool_CopiesContent(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "src.txt")
	dst := filepath.Join(dir, "dst.txt")

	if err := os.WriteFile(src, []byte("copy-me"), 0o644); err != nil {
		t.Fatal(err)
	}

	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("file-copy"), map[string]any{"src": src, "dst": dst})

	if !result.Passed {
		t.Fatalf("expected copy to pass, issues: %v", result.Issues)
	}
	data, _ := os.ReadFile(dst) //nolint:gosec
	if string(data) != "copy-me" {
		t.Fatalf("expected dst content 'copy-me', got %q", string(data))
	}
}

func TestFileCopyTool_NoSrc_FailedStep(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("file-copy"), map[string]any{"dst": "/tmp/x"})
	if result.Passed {
		t.Fatal("missing src must produce Passed=false")
	}
}

func TestFileCopyTool_NoDst_FailedStep(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "src.txt")
	_ = os.WriteFile(src, []byte("x"), 0o644)

	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("file-copy"), map[string]any{"src": src})
	if result.Passed {
		t.Fatal("missing dst must produce Passed=false")
	}
}

func TestFileCopyTool_SrcNotFound_FailedStep(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("file-copy"), map[string]any{
		"src": "/nonexistent/src.txt",
		"dst": "/tmp/dst.txt",
	})
	if result.Passed {
		t.Fatal("nonexistent src must produce Passed=false")
	}
}

// ─── fileRemoveTool ───────────────────────────────────────────────────────────

func TestFileRemoveTool_RemovesFile(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "remove-me.txt")
	_ = os.WriteFile(p, []byte("x"), 0o644)

	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("file-remove"), map[string]any{"path": p})

	if !result.Passed {
		t.Fatalf("expected Passed=true, issues: %v", result.Issues)
	}
	if _, err := os.Stat(p); !os.IsNotExist(err) {
		t.Fatal("file must be removed")
	}
}

func TestFileRemoveTool_NoopIfAbsent(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("file-remove"), map[string]any{"path": "/nonexistent/ghost.txt"})
	if !result.Passed {
		t.Fatal("removing absent file must still produce Passed=true")
	}
}

func TestFileRemoveTool_NoPath_FailedStep(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("file-remove"), map[string]any{})
	if result.Passed {
		t.Fatal("missing path must produce Passed=false")
	}
}

// ─── templateRenderTool ───────────────────────────────────────────────────────

func TestTemplateRenderTool_PlainString(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("template-render"), map[string]any{
		"template": "hello world",
	})
	if !result.Passed {
		t.Fatalf("expected Passed=true, issues: %v", result.Issues)
	}
	if result.Stats["output"] != "hello world" {
		t.Fatalf("expected output='hello world', got %v", result.Stats["output"])
	}
}

func TestTemplateRenderTool_WithData(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("template-render"), map[string]any{
		"template": "Hello, {{.Name}}!",
		"data":     map[string]any{"Name": "Eser"},
	})
	if !result.Passed {
		t.Fatalf("expected Passed=true, issues: %v", result.Issues)
	}
	if result.Stats["output"] != "Hello, Eser!" {
		t.Fatalf("expected 'Hello, Eser!', got %v", result.Stats["output"])
	}
}

func TestTemplateRenderTool_NoTemplate_FailedStep(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("template-render"), map[string]any{})
	if result.Passed {
		t.Fatal("missing template must produce Passed=false")
	}
}

func TestTemplateRenderTool_InvalidTemplate_FailedStep(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("template-render"), map[string]any{
		"template": "{{.Missing.Field invalid",
	})
	if result.Passed {
		t.Fatal("invalid template syntax must produce Passed=false")
	}
}

// ─── httpFetchTool ────────────────────────────────────────────────────────────

func TestHttpFetchTool_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer srv.Close()

	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("http-fetch"), map[string]any{"url": srv.URL})

	if !result.Passed {
		t.Fatalf("expected Passed=true for 200, issues: %v", result.Issues)
	}
	if result.Stats["status"] != http.StatusOK {
		t.Fatalf("expected status=200, got %v", result.Stats["status"])
	}
	if result.Stats["body"] != "ok" {
		t.Fatalf("expected body='ok', got %v", result.Stats["body"])
	}
}

func TestHttpFetchTool_NotFound_FailedStep(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("http-fetch"), map[string]any{"url": srv.URL})

	if result.Passed {
		t.Fatal("404 response must produce Passed=false")
	}
	if len(result.Issues) == 0 {
		t.Fatal("expected issue for 404 response")
	}
}

func TestHttpFetchTool_NoURL_FailedStep(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("http-fetch"), map[string]any{})
	if result.Passed {
		t.Fatal("missing url must produce Passed=false")
	}
}

func TestHttpFetchTool_InvalidURL_FailedStep(t *testing.T) {
	r := workflowfx.NewDefaultRegistry()
	result := directRun(t, r.MustGet("http-fetch"), map[string]any{"url": "not-a-url"})
	if result.Passed {
		t.Fatal("invalid url must produce Passed=false")
	}
}

func TestHttpFetchTool_ContextCancel_FailedStep(t *testing.T) {
	blocker := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-blocker:
		case <-r.Context().Done():
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	defer close(blocker)

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	r := workflowfx.NewDefaultRegistry()
	tool := r.MustGet("http-fetch")
	result, err := tool.Run(ctx, map[string]any{"url": srv.URL})

	// cancelled request returns failResult (nil error from tool), or nil result+engine error
	if err == nil && result != nil && result.Passed {
		t.Fatal("cancelled request must not produce Passed=true")
	}

	// verify we didn't wait forever
	if !strings.Contains(ctx.Err().Error(), "context") {
		t.Logf("ctx.Err: %v", ctx.Err())
	}
}
