// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows

package main

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// These tests run the built binary as a user does: `noskills run` drives
// the real claude-code provider (aifx over acpfx and its shim), which
// starts a fake `claude` from PATH. The fake speaks the CLI's stream-json
// and plays one scripted turn per start:
//
//	edit  appends a line to src/a.go and logs it as the PostToolUse hook does
//	done  runs `$NOSKILLS_UNDER_TEST spec test done`, as the prompt asks
//	hang  says something and then sleeps until it is killed
//
// No network is used. A TypeScript run of the same fixture is compared when
// NOSKILLS_RUN_PARITY=1. It needs deno: the TypeScript claude-code provider
// runs through the native ajan library, which node loads only from 26.9 on.

const fakeClaudeScript = `#!/bin/sh
# Stands in for claude --print --input-format stream-json --output-format stream-json.
n=$(( $(cat "$FAKE_DIR/count" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$FAKE_DIR/count"
cat > "$FAKE_DIR/prompt-$n.txt"
echo "$*" > "$FAKE_DIR/args-$n.txt"
command -v git > "$FAKE_DIR/git-$n.txt"
echo "$$" > "$FAKE_DIR/pid-$n.txt"
mode=$(sed -n "${n}p" "$FAKE_DIR/script")
say() {
  printf '%s\n' '{"type":"assistant","session_id":"s1","message":{"content":[{"type":"text","text":"'"$1"'"}]}}'
}
printf '%s\n' '{"type":"system","subtype":"init","session_id":"s1"}'
case "$mode" in
  edit)
    echo "// turn $n" >> src/a.go
    printf '{"file":"src/a.go","tool":"Edit","ts":"2026-10-25T12:00:00.000Z"}\n' >> .eser/.state/progresses/files-changed.jsonl
    say "turn $n edited src/a.go"
    ;;
  done)
    $NOSKILLS_UNDER_TEST spec test done > "$FAKE_DIR/done-$n.txt" 2>&1
    say "turn $n finished the spec"
    ;;
  hang)
    say "turn $n is working"
    touch "$FAKE_DIR/started"
    exec sleep 600
    ;;
esac
printf '%s\n' '{"type":"result","subtype":"success","session_id":"s1","result":"ok","stop_reason":"end_turn"}'
`

// fakeClaude writes the fake CLI and its script of turns and returns the
// directory to put first on PATH and the directory it records into.
func fakeClaude(t *testing.T, modes ...string) (binDir, fakeDir string) {
	t.Helper()

	binDir = t.TempDir()
	fakeDir = t.TempDir()

	if err := os.WriteFile(filepath.Join(binDir, "claude"), []byte(fakeClaudeScript), 0o755); err != nil { //nolint:gosec // G306: the fake must be executable
		t.Fatal(err)
	}

	writeProjectFile(t, filepath.Join(fakeDir, "script"), strings.Join(modes, "\n")+"\n")

	return binDir, fakeDir
}

// gitProject makes the project a git repository with src/a.go committed,
// so the loop's git diff sees what a turn changed.
func gitProject(t *testing.T, root string) {
	t.Helper()

	writeProjectFile(t, filepath.Join(root, "src", "a.go"), "package a\n")

	for _, args := range [][]string{
		{"init", "-q"},
		{"add", "src/a.go"},
		{"-c", "user.name=noskills", "-c", "user.email=noskills@example.com", "commit", "-q", "-m", "start"},
	} {
		cmd := exec.Command("git", args...) //nolint:noctx // a bounded local git call
		cmd.Dir = root

		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v: %s", args, err, out)
		}
	}
}

// runEnviron is the environment the run starts with.
func runEnviron(binDir, fakeDir, under string) []string {
	environ := []string{"PATH=" + binDir + string(os.PathListSeparator) + os.Getenv("PATH"), "FAKE_DIR=" + fakeDir,
		"NOSKILLS_UNDER_TEST=" + under, "NOSKILLS_NO_FORWARD=1", "HOME=" + fakeDir, "XDG_CONFIG_HOME=" + fakeDir}

	for _, entry := range os.Environ() {
		// The tool variables would make `next` answer an agent.
		if strings.HasPrefix(entry, "CLAUDE") || strings.HasPrefix(entry, "NOSKILLS_") || strings.HasPrefix(entry, "PATH=") ||
			strings.HasPrefix(entry, "HOME=") || strings.HasPrefix(entry, "XDG_CONFIG_HOME=") {
			continue
		}

		environ = append(environ, entry)
	}

	return environ
}

type runResult struct {
	code   int
	stdout string
	stderr string
}

func runCommandLine(t *testing.T, ctx context.Context, dir string, environ []string, name string, args ...string) runResult { //nolint:revive // the test comes first, as in the other helpers
	t.Helper()

	cmd := exec.CommandContext(ctx, name, args...) //nolint:gosec // G204: the binary or the TypeScript CLI under test
	cmd.Dir = dir
	cmd.Env = environ

	var stdout, stderr bytes.Buffer

	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()

	var exitErr *exec.ExitError
	if err != nil && !errors.As(err, &exitErr) {
		t.Fatalf("run %s: %v", name, err)
	}

	return runResult{code: cmd.ProcessState.ExitCode(), stdout: stdout.String(), stderr: stderr.String()}
}

func readText(t *testing.T, path string) string {
	t.Helper()

	data, err := os.ReadFile(path) //nolint:gosec // G304: a file of the test's dirs
	if err != nil {
		t.Fatal(err)
	}

	return string(data)
}

func TestRunBinaryDrivesTheClaudeCLI(t *testing.T) {
	if testing.Short() {
		t.Skip("builds the binary; run without -short")
	}

	binary := buildBinary(t)
	root := writeRunProject(t, noskillsfx.PhaseSpecApproved, "")
	gitProject(t, root)

	binDir, fakeDir := fakeClaude(t, "edit", "done")

	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	result := runCommandLine(t, ctx, root, runEnviron(binDir, fakeDir, binary), binary, "run")
	if result.code != 0 {
		t.Fatalf("exit %d:\n%s\n%s", result.code, result.stdout, result.stderr)
	}

	for _, want := range []string{
		"    turn 1 edited src/a.go\n",
		dim("  Agent finished (end_turn). Iteration 1: 1 file changed, 1 insertion(+)"),
		"    turn 2 finished the spec\n",
		green("✔") + " Spec completed!",
		"  Iterations: 1\n",
	} {
		if !strings.Contains(result.stdout, want) {
			t.Errorf("stdout does not hold %q:\n%s", want, result.stdout)
		}
	}

	// The prompt went in on stdin, and the vendor flags carry the model and
	// the turn limit.
	if prompt := readText(t, filepath.Join(fakeDir, "prompt-1.txt")); !strings.Contains(prompt, "Working on spec: test") {
		t.Errorf("prompt:\n%s", prompt)
	}

	if args := readText(t, filepath.Join(fakeDir, "args-1.txt")); !strings.Contains(args, "--model "+noskillsfx.DefaultAgentModel) ||
		!strings.Contains(args, "--max-turns 10") {
		t.Errorf("claude ran with %s", args)
	}

	// allowGit is false: the agent's git is the wrapper.
	wrapperGit, err := filepath.EvalSymlinks(filepath.Join(noskillsfx.WrapperBinDir(root), "git"))
	if err != nil {
		t.Fatal(err)
	}

	if git := strings.TrimSpace(readText(t, filepath.Join(fakeDir, "git-1.txt"))); git != wrapperGit {
		t.Errorf("the agent's git is %q, want the wrapper %q", git, wrapperGit)
	}

	record := readJSONFile(t, filepath.Join(root, ".eser", ".state", "progresses", "iterations", "iteration-1.json"))
	if files, _ := record["files"].([]any); len(files) != 1 || files[0] != "src/a.go" {
		t.Errorf("iteration-1.json %v", record)
	}

	for _, path := range []string{"state.json", filepath.Join("specs", "test.json")} {
		assertReleased(t, readJSONFile(t, filepath.Join(root, ".eser", ".state", "progresses", path)))
	}
}

func TestRunBinaryInterruptReleasesTheTurn(t *testing.T) {
	if testing.Short() {
		t.Skip("builds the binary; run without -short")
	}

	binary := buildBinary(t)
	root := writeRunProject(t, noskillsfx.PhaseExecuting, "  allowGit: true\n")
	binDir, fakeDir := fakeClaude(t, "hang")

	cmd := exec.Command(binary, "run", "--unattended") //nolint:noctx // the test ends it with SIGINT
	cmd.Dir = root
	cmd.Env = runEnviron(binDir, fakeDir, binary)

	var stdout, stderr bytes.Buffer

	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}

	exited := make(chan error, 1)

	go func() { exited <- cmd.Wait() }()

	deadline := time.Now().Add(30 * time.Second)
	for {
		if _, err := os.Stat(filepath.Join(fakeDir, "started")); err == nil {
			break
		}

		if time.Now().After(deadline) {
			_ = cmd.Process.Kill()

			t.Fatalf("the turn never started:\n%s\n%s", stdout.String(), stderr.String())
		}

		time.Sleep(20 * time.Millisecond)
	}

	// The turn is in flight: the loop holds it, as this process.
	state := readJSONFile(t, filepath.Join(root, ".eser", ".state", "progresses", "state.json"))
	if driver, _ := executionField(state, "driver"); driver != noskillsfx.RunDriver {
		t.Errorf("during the turn execution.driver = %v", driver)
	}

	if pid, _ := executionField(state, "driverPid"); pid != float64(cmd.Process.Pid) {
		t.Errorf("during the turn execution.driverPid = %v, want %d", pid, cmd.Process.Pid)
	}

	if err := cmd.Process.Signal(os.Interrupt); err != nil {
		t.Fatal(err)
	}

	select {
	case <-exited:
	case <-time.After(30 * time.Second):
		_ = cmd.Process.Kill()

		t.Fatal("the run did not end after SIGINT")
	}

	if code := cmd.ProcessState.ExitCode(); code != exitInterrupted {
		t.Errorf("exit %d, want %d:\n%s\n%s", code, exitInterrupted, stdout.String(), stderr.String())
	}

	if !strings.Contains(stdout.String(), "    turn 1 is working\n") || !strings.Contains(stdout.String(), " Interrupted.") {
		t.Errorf("stdout:\n%s", stdout.String())
	}

	for _, path := range []string{"state.json", filepath.Join("specs", "test.json")} {
		state := readJSONFile(t, filepath.Join(root, ".eser", ".state", "progresses", path))
		assertReleased(t, state)

		if iteration, _ := executionField(state, "iteration"); iteration != 0.0 || state["phase"] != noskillsfx.PhaseExecuting {
			t.Errorf("%s: phase %v, iteration %v", path, state["phase"], iteration)
		}
	}

	// The agent process went with the turn.
	pid, err := strconv.Atoi(strings.TrimSpace(readText(t, filepath.Join(fakeDir, "pid-1.txt"))))
	if err != nil {
		t.Fatal(err)
	}

	gone := false
	for range 100 {
		if err := syscall.Kill(pid, 0); errors.Is(err, syscall.ESRCH) {
			gone = true

			break
		}

		time.Sleep(20 * time.Millisecond)
	}

	if !gone {
		_ = syscall.Kill(pid, syscall.SIGKILL)

		t.Errorf("the fake claude (pid %d) outlived the interrupted turn", pid)
	}
}

// timestamps are the ISO times a run writes.
var timestamps = regexp.MustCompile(`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z`)

// comparedFiles are the project files the TypeScript and Go runs must
// leave alike, with their timestamps blanked. The spec's own state is not
// among them: the Go loop copies each recorded iteration and the claim into
// it, and the TypeScript loop leaves it as it was.
func comparedFiles(t *testing.T, root string) map[string]string {
	t.Helper()

	files := map[string]string{}

	for _, path := range []string{
		".eser/.state/progresses/state.json",
		".eser/.state/progresses/iterations/iteration-1.json",
		".eser/.state/progresses/iterations/iteration-2.json",
		".eser/.state/progresses/files-changed.jsonl",
		"src/a.go",
	} {
		data, err := os.ReadFile(filepath.Join(root, path)) //nolint:gosec // G304: a file of the test's project
		if err != nil {
			files[path] = "<missing>"

			continue
		}

		files[path] = timestamps.ReplaceAllString(string(data), "<time>")
	}

	return files
}

// loopLines are the lines both CLIs print: the Go build's streamed agent
// text (indented four spaces) is left out.
func loopLines(stdout string) []string {
	var lines []string

	for line := range strings.SplitSeq(stdout, "\n") {
		if !strings.HasPrefix(line, agentOutputIndent) {
			lines = append(lines, line)
		}
	}

	return lines
}

func TestRunBinaryMatchesTypeScript(t *testing.T) {
	if os.Getenv("NOSKILLS_RUN_PARITY") != "1" {
		t.Skip("set NOSKILLS_RUN_PARITY=1 to compare with the TypeScript CLI (needs deno)")
	}

	deno, err := exec.LookPath("deno")
	if err != nil {
		t.Fatal("the comparison needs deno")
	}

	mainTS, err := filepath.Abs("../../pkg/@eserstack/noskills/main.ts")
	if err != nil {
		t.Fatal(err)
	}

	binary := buildBinary(t)
	tsArgs := []string{"run", "-A", "--quiet", mainTS}
	tsCommand := deno + " " + strings.Join(tsArgs, " ")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	results := map[string]runResult{}
	files := map[string]map[string]string{}

	for _, cli := range []string{"go", "typescript"} {
		root := writeRunProject(t, noskillsfx.PhaseExecuting, "  allowGit: true\n")
		gitProject(t, root)

		binDir, fakeDir := fakeClaude(t, "edit", "edit", "edit")

		if cli == "go" {
			results[cli] = runCommandLine(t, ctx, root, runEnviron(binDir, fakeDir, binary), binary, "run", "--max-iterations=2")
		} else {
			results[cli] = runCommandLine(t, ctx, root, runEnviron(binDir, fakeDir, tsCommand), deno,
				append(tsArgs, "run", "--max-iterations=2")...)
		}

		files[cli] = comparedFiles(t, root)
	}

	goRun, tsRun := results["go"], results["typescript"]

	if goRun.code != tsRun.code {
		t.Errorf("exit %d in Go, %d in TypeScript", goRun.code, tsRun.code)
	}

	if got, want := strings.Join(loopLines(goRun.stdout), "\n"), strings.Join(loopLines(tsRun.stdout), "\n"); got != want {
		t.Errorf("stdout differs\n--- go\n%s\n--- typescript\n%s\n--- typescript stderr\n%s", got, want, tsRun.stderr)
	}

	for path, want := range files["typescript"] {
		if got := files["go"][path]; got != want {
			t.Errorf("%s differs\n--- go\n%s\n--- typescript\n%s", path, got, want)
		}
	}
}
