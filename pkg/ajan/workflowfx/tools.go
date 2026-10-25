// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"text/template"
	"time"

	"github.com/eser/stack/pkg/ajan/lib"
)

// ─── shellTool ─────────────────────────────────────────────────────────────────

// shellTool runs options["command"] under `sh -c`, as the TypeScript shell
// tool (pkg/@eserstack/workflows/shell-tool.ts) does:
//
//   - fixCommand runs instead of command when options["fix"] is true, unless
//     options["dryRun"] is true;
//   - workingDirectory is the command's directory, relative to root;
//   - name is the step's display name (the command when unset);
//   - the step's timeout ends the command and every process it started;
//   - stats holds the numeric exitCode, and a failure's issue holds the
//     command's output, or "Command exited with code N" when it printed none.
type shellTool struct{}

// NewShellTool returns the built-in shell tool.
func NewShellTool() WorkflowTool { //nolint:ireturn
	return &shellTool{}
}

func (t *shellTool) Name() string        { return "shell" }
func (t *shellTool) Description() string { return "run a shell command from options[command]" }
func (t *shellTool) Run(ctx context.Context, opts map[string]any) (*WorkflowToolResult, error) {
	command, _ := opts["command"].(string)
	if command == "" {
		return failResult(t.Name(), `the shell tool requires a "command" option, such as { shell: { command: "deno fmt --check" } }`), nil
	}

	displayName := optString(opts, "name", command)
	fixCommand, _ := opts["fixCommand"].(string)
	fix, _ := opts["fix"].(bool)
	dryRun, _ := opts["dryRun"].(bool)

	run := command
	if fix && !dryRun && fixCommand != "" {
		run = fixCommand
	}

	root := optString(opts, "root", ".")

	dir := root
	if wd, ok := opts["workingDirectory"].(string); ok && wd != "" {
		dir = filepath.Join(root, wd)
		if filepath.IsAbs(wd) {
			dir = wd
		}
	}

	//nolint:gosec // command comes from trusted workflow definition
	cmd := exec.CommandContext(ctx, "sh", "-c", run)
	cmd.Dir = dir
	// Ensure context cancellation/timeout terminates the command AND any child
	// processes it spawned (platform-specific — see tools_unix.go /
	// tools_windows.go). Without this, killing the `sh` parent can leave a
	// long-running child alive (and holding the output pipe) on Windows.
	setupCancelKill(cmd)

	out, err := cmd.CombinedOutput()
	if err == nil {
		return &WorkflowToolResult{
			Name:   displayName,
			Passed: true,
			Issues: []WorkflowIssue{},
			Stats:  map[string]any{"exitCode": 0},
		}, nil
	}

	exitCode := -1

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		exitCode = exitErr.ExitCode()
	}

	message := strings.TrimSpace(string(out))

	switch {
	case ctx.Err() != nil:
		message = strings.TrimSpace(fmt.Sprintf("%s\nstopped at the step's timeout: %v", message, ctx.Err()))
	case message == "" && exitCode >= 0:
		message = fmt.Sprintf("Command exited with code %d", exitCode)
	case message == "":
		message = err.Error()
	}

	return &WorkflowToolResult{
		Name:   displayName,
		Passed: false,
		Issues: []WorkflowIssue{{Message: message}},
		Stats:  map[string]any{"exitCode": exitCode},
	}, nil
}

// ─── fileReadTool ──────────────────────────────────────────────────────────────

type fileReadTool struct{}

func (t *fileReadTool) Name() string        { return "file-read" }
func (t *fileReadTool) Description() string { return "read a file and return its content" }
func (t *fileReadTool) Run(_ context.Context, opts map[string]any) (*WorkflowToolResult, error) {
	path, err := resolveFilePath(opts)
	if err != nil {
		return failResult(t.Name(), err.Error()), nil
	}

	data, err := os.ReadFile(path) //nolint:gosec
	if err != nil {
		return failResult(t.Name(), err.Error()), nil
	}

	return &WorkflowToolResult{
		Name:   t.Name(),
		Passed: true,
		Stats:  map[string]any{"content": string(data), "bytes": len(data)},
	}, nil
}

// ─── fileWriteTool ─────────────────────────────────────────────────────────────

type fileWriteTool struct{}

func (t *fileWriteTool) Name() string        { return "file-write" }
func (t *fileWriteTool) Description() string { return "write content to a file, creating it if absent" }
func (t *fileWriteTool) Run(_ context.Context, opts map[string]any) (*WorkflowToolResult, error) {
	path, err := resolveFilePath(opts)
	if err != nil {
		return failResult(t.Name(), err.Error()), nil
	}

	content, _ := opts["content"].(string)

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return failResult(t.Name(), err.Error()), nil
	}

	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return failResult(t.Name(), err.Error()), nil
	}

	return &WorkflowToolResult{
		Name:   t.Name(),
		Passed: true,
		Stats:  map[string]any{"bytes": len(content)},
	}, nil
}

// ─── fileCopyTool ──────────────────────────────────────────────────────────────

type fileCopyTool struct{}

func (t *fileCopyTool) Name() string        { return "file-copy" }
func (t *fileCopyTool) Description() string { return "copy src file to dst, overwriting if present" }
func (t *fileCopyTool) Run(_ context.Context, opts map[string]any) (*WorkflowToolResult, error) {
	root := optString(opts, "root", ".")

	src, err := resolveRelPath(root, opts, "src")
	if err != nil {
		return failResult(t.Name(), err.Error()), nil
	}

	dst, err := resolveRelPath(root, opts, "dst")
	if err != nil {
		return failResult(t.Name(), err.Error()), nil
	}

	in, err := os.Open(src) //nolint:gosec
	if err != nil {
		return failResult(t.Name(), err.Error()), nil
	}
	// in is only read; a failed close loses nothing.
	defer func() { _ = in.Close() }()

	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return failResult(t.Name(), err.Error()), nil
	}

	out, err := os.Create(dst) //nolint:gosec
	if err != nil {
		return failResult(t.Name(), err.Error()), nil
	}
	// Closes out on the error paths. The success path closes it below and
	// checks the result; closing again then only returns os.ErrClosed.
	defer func() { _ = out.Close() }()

	n, err := io.Copy(out, in)
	if err != nil {
		return failResult(t.Name(), err.Error()), nil
	}

	// A failed close can mean the copy never reached the disk.
	if err := out.Close(); err != nil {
		return failResult(t.Name(), fmt.Sprintf("close %s: %v", dst, err)), nil
	}

	return &WorkflowToolResult{
		Name:   t.Name(),
		Passed: true,
		Stats:  map[string]any{"bytes": n},
	}, nil
}

// ─── fileRemoveTool ────────────────────────────────────────────────────────────

type fileRemoveTool struct{}

func (t *fileRemoveTool) Name() string        { return "file-remove" }
func (t *fileRemoveTool) Description() string { return "delete a file; no-op if absent" }
func (t *fileRemoveTool) Run(_ context.Context, opts map[string]any) (*WorkflowToolResult, error) {
	path, err := resolveFilePath(opts)
	if err != nil {
		return failResult(t.Name(), err.Error()), nil
	}

	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return failResult(t.Name(), err.Error()), nil
	}

	return &WorkflowToolResult{Name: t.Name(), Passed: true, Stats: map[string]any{}}, nil
}

// ─── templateRenderTool ────────────────────────────────────────────────────────

type templateRenderTool struct{}

func (t *templateRenderTool) Name() string { return "template-render" }
func (t *templateRenderTool) Description() string {
	return "render a Go text/template string with data"
}
func (t *templateRenderTool) Run(_ context.Context, opts map[string]any) (*WorkflowToolResult, error) {
	src, _ := opts["template"].(string)
	if src == "" {
		return failResult(t.Name(), "option 'template' (string) is required"), nil
	}

	data := opts["data"]

	tmpl, err := template.New("").Parse(src)
	if err != nil {
		return failResult(t.Name(), fmt.Sprintf("parse: %v", err)), nil
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return failResult(t.Name(), fmt.Sprintf("execute: %v", err)), nil
	}

	return &WorkflowToolResult{
		Name:   t.Name(),
		Passed: true,
		Stats:  map[string]any{"output": buf.String()},
	}, nil
}

// ─── httpFetchTool ─────────────────────────────────────────────────────────────

// httpFetchMaxBodyBytes caps the response body http-fetch reads into memory.
// The body ends up in the step's stats, so anything larger is a download, not
// a fetch, and fails the step.
const httpFetchMaxBodyBytes = 10 << 20

type httpFetchTool struct {
	client *http.Client
}

func (t *httpFetchTool) Name() string        { return "http-fetch" }
func (t *httpFetchTool) Description() string { return "HTTP GET a URL and return status + body" }
func (t *httpFetchTool) Run(ctx context.Context, opts map[string]any) (*WorkflowToolResult, error) {
	url, _ := opts["url"].(string)
	if url == "" {
		return failResult(t.Name(), "option 'url' (string) is required"), nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return failResult(t.Name(), err.Error()), nil
	}

	client := t.client
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}

	resp, err := client.Do(req)
	if err != nil {
		return failResult(t.Name(), err.Error()), nil
	}
	// The body is read in full or abandoned on error; a failed close loses nothing.
	defer func() { _ = resp.Body.Close() }()

	body, err := lib.ReadAllLimited(resp.Body, httpFetchMaxBodyBytes)
	if errors.Is(err, lib.ErrReadLimitExceeded) {
		return failResult(t.Name(), fmt.Sprintf(
			"response body of %s is larger than %d bytes; fetch a smaller resource or download it with the shell tool",
			url, httpFetchMaxBodyBytes,
		)), nil
	}

	if err != nil {
		return failResult(t.Name(), err.Error()), nil
	}

	passed := resp.StatusCode >= 200 && resp.StatusCode < 300

	result := &WorkflowToolResult{
		Name:   t.Name(),
		Passed: passed,
		Stats: map[string]any{
			"status": resp.StatusCode,
			"body":   string(body),
			"bytes":  len(body),
		},
	}

	if !passed {
		result.Issues = []WorkflowIssue{{
			Message: fmt.Sprintf("HTTP %d: %s", resp.StatusCode, url),
		}}
	}

	return result, nil
}

// ─── NewDefaultRegistry ────────────────────────────────────────────────────────

// NewDefaultRegistry returns a Registry pre-populated with all built-in tools:
// shell, file-read, file-write, file-copy, file-remove, template-render, http-fetch, variable-set.
func NewDefaultRegistry() *Registry {
	r := NewRegistry()
	r.Register(&shellTool{})
	r.Register(&fileReadTool{})
	r.Register(&fileWriteTool{})
	r.Register(&fileCopyTool{})
	r.Register(&fileRemoveTool{})
	r.Register(&templateRenderTool{})
	r.Register(&httpFetchTool{})
	r.Register(NewVariableSetTool())

	return r
}

// NewVariableSetTool returns the built-in variable-set tool.
// NewDefaultRegistry registers it automatically; call this only when building a custom registry.
func NewVariableSetTool() WorkflowTool { //nolint:ireturn
	return &variableSetTool{}
}

// ─── helpers ───────────────────────────────────────────────────────────────────

func optString(opts map[string]any, key, def string) string {
	if v, ok := opts[key].(string); ok && v != "" {
		return v
	}

	return def
}

// resolveFilePath derives an absolute path from opts["root"] + opts["path"].
func resolveFilePath(opts map[string]any) (string, error) {
	root := optString(opts, "root", ".")
	rel, _ := opts["path"].(string)

	if rel == "" {
		return "", fmt.Errorf("option 'path' (string) is required")
	}

	if filepath.IsAbs(rel) {
		return rel, nil
	}

	return filepath.Join(root, rel), nil
}

// resolveRelPath resolves opts[key] relative to root.
func resolveRelPath(root string, opts map[string]any, key string) (string, error) {
	rel, _ := opts[key].(string)
	if rel == "" {
		return "", fmt.Errorf("option '%s' (string) is required", key)
	}

	if filepath.IsAbs(rel) {
		return rel, nil
	}

	return filepath.Join(root, rel), nil
}

// failResult is a convenience constructor for a single-issue failed result.
func failResult(name, msg string) *WorkflowToolResult {
	return &WorkflowToolResult{
		Name:   name,
		Passed: false,
		Issues: []WorkflowIssue{{Message: msg}},
		Stats:  map[string]any{},
	}
}
