// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/aifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// These tests run `noskills run` in process against a fake aifx provider
// factory: each turn is a function that streams events and may change the
// project, as an agent would. Nothing is spawned and nothing goes to the
// network. run_binary_test.go drives the built binary through the real
// claude-code provider with a fake claude CLI.

const fakeAgentPid = 4242

var (
	errFakeCreate = errors.New("claude: command not found")
	errFakeStream = errors.New("claude-code: exited 1 without running the turn")
)

// fakeTurn is one agent turn: it gets the prompt and a send function that
// reports false once the stream is cancelled.
type fakeTurn func(ctx context.Context, prompt string, send func(aifx.StreamEvent) bool) (aifx.StopReason, error)

// fakeAgent is an aifx.ProviderFactory whose models play the turns in
// order; a turn past the last one fails the test.
type fakeAgent struct {
	t         *testing.T
	turns     []fakeTurn
	createErr error

	mu      sync.Mutex
	prompts []string
	configs []*aifx.ConfigTarget
}

func (f *fakeAgent) GetProvider() string { return noskillsfx.DefaultAgentProvider }

func (f *fakeAgent) CreateModel(_ context.Context, config *aifx.ConfigTarget) (aifx.LanguageModel, error) { //nolint:ireturn // the aifx interface
	f.mu.Lock()
	defer f.mu.Unlock()

	f.configs = append(f.configs, config)

	if f.createErr != nil {
		return nil, f.createErr
	}

	return &fakeModel{agent: f}, nil
}

func (f *fakeAgent) calls() int {
	f.mu.Lock()
	defer f.mu.Unlock()

	return len(f.prompts)
}

type fakeModel struct{ agent *fakeAgent }

func (m *fakeModel) GetCapabilities() []aifx.ProviderCapability {
	return []aifx.ProviderCapability{aifx.CapabilityTextGeneration, aifx.CapabilityStreaming}
}

func (m *fakeModel) GetProvider() string { return noskillsfx.DefaultAgentProvider }
func (m *fakeModel) GetModelID() string  { return noskillsfx.DefaultAgentModel }
func (m *fakeModel) GetRawClient() any   { return nil }

func (m *fakeModel) Close(context.Context) error { return nil }

var errNotStreamed = errors.New("the loop streams its turns")

func (m *fakeModel) GenerateText(context.Context, *aifx.GenerateTextOptions) (*aifx.GenerateTextResult, error) {
	return nil, errNotStreamed
}

func (m *fakeModel) StreamText(ctx context.Context, opts *aifx.StreamTextOptions) (*aifx.StreamIterator, error) {
	f := m.agent

	f.mu.Lock()
	index := len(f.prompts)
	f.prompts = append(f.prompts, opts.Messages[0].Content[0].Text)
	f.mu.Unlock()

	if index >= len(f.turns) {
		f.t.Errorf("turn %d was not scripted", index+1)

		return nil, errNotStreamed
	}

	turn := f.turns[index]
	streamCtx, cancel := context.WithCancel(ctx)
	events := make(chan aifx.StreamEvent)

	go func() {
		defer close(events)
		defer cancel()

		send := func(event aifx.StreamEvent) bool {
			select {
			case events <- event:
				return true
			case <-streamCtx.Done():
				return false
			}
		}

		stop, err := turn(streamCtx, f.prompts[index], send)
		if err != nil {
			send(aifx.StreamEvent{Type: aifx.StreamEventError, Error: err}) //nolint:exhaustruct

			return
		}

		send(aifx.StreamEvent{Type: aifx.StreamEventMessageDone, StopReason: stop}) //nolint:exhaustruct
	}()

	return aifx.NewStreamIterator(events, cancel), nil
}

func textEvent(text string) aifx.StreamEvent {
	return aifx.StreamEvent{Type: aifx.StreamEventContentDelta, TextDelta: text} //nolint:exhaustruct
}

func toolEvent(name string) aifx.StreamEvent {
	return aifx.StreamEvent{Type: aifx.StreamEventToolCallDelta, ToolCall: &aifx.ToolCall{ID: "t1", Name: name}} //nolint:exhaustruct
}

// commandCall is one program the loop's auto-commit ran.
type commandCall struct {
	args    []string
	environ []string
}

// runTest is a project, a test env on it and the fake agent.
type runTest struct {
	*testEnv

	root  string
	agent *fakeAgent

	mu       sync.Mutex
	commands []commandCall
	status   string
}

// writeRunProject writes a project with spec "test" in phase; manifest
// replaces the allowGit line of the noskills section.
func writeRunProject(t *testing.T, phase, manifest string) string {
	t.Helper()

	root := t.TempDir()

	plan := &noskillsfx.InitPlan{Concerns: []string{}, Tools: []string{"claude-code"}, Providers: []string{}, Project: noskillsfx.DetectProject(root), Command: "noskills"}
	if err := noskillsfx.WriteInit(root, plan, false); err != nil {
		t.Fatal(err)
	}

	if manifest != "" {
		path := filepath.Join(root, ".eser", "manifest.yml")

		data, err := os.ReadFile(path) //nolint:gosec // G304: the test's project
		if err != nil {
			t.Fatal(err)
		}

		if !strings.Contains(string(data), "  allowGit: false\n") {
			t.Fatalf("the manifest has no allowGit line:\n%s", data)
		}

		writeProjectFile(t, path, strings.Replace(string(data), "  allowGit: false\n", manifest, 1))
	}

	writeProjectFile(t, filepath.Join(root, ".eser", "specs", "test", "spec.md"), "# Spec: test\n\nAdd photo upload support\n")

	state := noskillsfx.InitialState()
	state.Set("phase", phase)
	state.Set("spec", "test")
	state.Set("specDescription", "Add photo upload support")
	state.Set("branch", "spec/test")

	if err := noskillsfx.WriteStateAndSpec(root, state, nil); err != nil {
		t.Fatal(err)
	}

	return root
}

// newRunTest writes a project with spec "test" in phase and returns the
// env `noskills run` runs in on it, with the fake agent playing turns.
func newRunTest(t *testing.T, phase, manifest string, turns ...fakeTurn) *runTest {
	t.Helper()

	root := writeRunProject(t, phase, manifest)

	rt := &runTest{testEnv: newTestEnv(t, root), root: root, agent: &fakeAgent{t: t, turns: turns}} //nolint:exhaustruct
	rt.env.agent = &runPorts{
		agent: rt.agent,
		pid:   fakeAgentPid,
		setEnv: func(key string, value *string) {
			rt.mu.Lock()
			defer rt.mu.Unlock()

			if value == nil {
				delete(rt.vars, key)
			} else {
				rt.vars[key] = *value
			}
		},
		runCommand: func(_ context.Context, _ string, args []string, _ string, environ []string) (string, string, error) {
			rt.mu.Lock()
			defer rt.mu.Unlock()

			rt.commands = append(rt.commands, commandCall{args: args, environ: environ})

			if args[0] == "status" {
				return rt.status, "", nil
			}

			return "", "", nil
		},
	}
	rt.environ = func() []string {
		rt.mu.Lock()
		defer rt.mu.Unlock()

		return []string{"KEEP=1", "PATH=" + rt.vars["PATH"]}
	}

	return rt
}

func (rt *runTest) run(ctx context.Context, args ...string) int {
	return run(ctx, rt.env, append([]string{"run"}, args...))
}

func (rt *runTest) state(t *testing.T) map[string]any {
	t.Helper()

	return readJSONFile(t, filepath.Join(rt.root, ".eser", ".state", "progresses", "state.json"))
}

// writeProjectFile writes a file of a test's own directories.
func writeProjectFile(t *testing.T, path, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(path, []byte(content), 0o600); err != nil { //nolint:gosec // G703: a path under the test's temp dirs
		t.Fatal(err)
	}
}

func readJSONFile(t *testing.T, path string) map[string]any {
	t.Helper()

	data, err := os.ReadFile(path) //nolint:gosec // G304: a file of the test's project
	if err != nil {
		t.Fatal(err)
	}

	var value map[string]any
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatalf("%s is not valid JSON: %v\n%s", path, err, data)
	}

	return value
}

func executionField(state map[string]any, key string) (any, bool) {
	execution, _ := state["execution"].(map[string]any)
	value, ok := execution[key]

	return value, ok
}

// assertReleased checks that the driver claim is gone.
func assertReleased(t *testing.T, state map[string]any) {
	t.Helper()

	for _, key := range []string{"driver", "driverPid"} {
		if value, ok := executionField(state, key); ok {
			t.Errorf("state.json keeps execution.%s = %v", key, value)
		}
	}
}

// assertClaimed checks, from inside a turn, that the loop holds the turn.
func assertClaimed(t *testing.T, root string) {
	t.Helper()

	state := readJSONFile(t, filepath.Join(root, ".eser", ".state", "progresses", "state.json"))
	driver, _ := executionField(state, "driver")
	pid, _ := executionField(state, "driverPid")

	if driver != noskillsfx.RunDriver || pid != float64(fakeAgentPid) {
		t.Errorf("during the turn execution.driver = %v, driverPid = %v", driver, pid)
	}
}

// editTurn is a turn that writes a file, logs it as the PostToolUse hook
// does and says what it did.
func editTurn(t *testing.T, root, file string, stop aifx.StopReason) fakeTurn {
	t.Helper()

	return func(_ context.Context, _ string, send func(aifx.StreamEvent) bool) (aifx.StopReason, error) {
		assertClaimed(t, root)

		writeProjectFile(t, filepath.Join(root, file), "package upload\n")
		noskillsfx.AppendProgressLog(root, "files-changed.jsonl",
			[]*noskillsfx.JSObject{noskillsfx.JSObjectOf("file", file, "tool", "Write", "ts", "2026-10-25T12:00:00.000Z")})

		send(textEvent("Writing the upload handler.\n"))
		send(toolEvent("Write"))
		send(textEvent("Done: " + file))

		return stop, nil
	}
}

// blockTurn is a turn whose agent runs `spec test block`.
func blockTurn(t *testing.T, root string) fakeTurn {
	t.Helper()

	return func(ctx context.Context, _ string, send func(aifx.StreamEvent) bool) (aifx.StopReason, error) {
		if err := noskillsfx.Block(ctx, &noskillsfx.LifecycleEnv{Root: root, Cwd: root, Now: fixedTime}, "test", "need the API key"); err != nil { //nolint:exhaustruct
			t.Error(err)
		}

		send(textEvent("Blocked: the upload needs the API key."))

		return aifx.StopReasonEndTurn, nil
	}
}

func fixedTime() time.Time { return time.Date(2026, 10, 25, 12, 0, 0, 0, time.UTC) }

func TestRunDrivesASpecToCompletion(t *testing.T) {
	t.Parallel()

	var rt *runTest

	doneTurn := func(ctx context.Context, _ string, send func(aifx.StreamEvent) bool) (aifx.StopReason, error) {
		// The agent ends the spec the way the prompt tells it to.
		agentEnv := newTestEnv(t, rt.root)
		if code := run(ctx, agentEnv.env, []string{"spec", "test", "done"}); code != 0 {
			t.Errorf("spec test done: exit %d: %s", code, agentEnv.stdout)
		}

		send(textEvent("All tasks are complete."))

		return aifx.StopReasonEndTurn, nil
	}

	rt = newRunTest(t, noskillsfx.PhaseSpecApproved, "  allowGit: true\n", nil, doneTurn)
	rt.agent.turns[0] = editTurn(t, rt.root, "src/upload.go", aifx.StopReasonEndTurn)

	if code := rt.run(context.Background()); code != 0 {
		t.Fatalf("exit %d:\n%s%s", code, rt.stdout, rt.stderr)
	}

	out := rt.stdout.String()
	for _, want := range []string{
		dim("Starting execution from approved spec...") + ansiReset,
		bold("noskills run") + ansiReset,
		dim("Mode: interactive, max-turns: 10, max-iterations: 50") + ansiReset,
		cyan("── Iteration 1") + dim(" (execution: 0, debt: 0)"),
		dim("  Spawning agent...") + ansiReset + "\n    Writing the upload handler.\n" + dim("    ▸ Write") + ansiReset + "\n    Done: src/upload.go\n",
		dim("  Agent finished (end_turn). Iteration 1: no file changes"),
		cyan("── Iteration 2") + dim(" (execution: 1, debt: 0)"),
		"    All tasks are complete.\n",
		dim("  Agent finished (end_turn). The spec left EXECUTING, so the turn is not recorded as an iteration."),
		green("✔") + " Spec completed!",
		"\n  Iterations: 1\n",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("stdout does not hold %q:\n%s", want, out)
		}
	}

	if rt.agent.calls() != 2 {
		t.Errorf("the agent ran %d turns, want 2", rt.agent.calls())
	}

	// Every turn gets the headless prompt for the spec, rooted at the project.
	if prompt := rt.agent.prompts[0]; !strings.Contains(prompt, "Working on spec: test") ||
		!strings.Contains(prompt, `noskills spec test next --answer="your progress"`) || strings.Contains(prompt, "AskUserQuestion") {
		t.Errorf("prompt:\n%s", prompt)
	}

	if config := rt.agent.configs[0]; config.Provider != "claude-code" || config.Model != noskillsfx.DefaultAgentModel ||
		config.Properties["maxTurns"] != 10 || config.Properties["cwd"] != rt.root {
		t.Errorf("model config %+v", config)
	}

	// The loop recorded the first turn itself, with the file the hook logged.
	record := readJSONFile(t, filepath.Join(rt.root, ".eser", ".state", "progresses", "iterations", "iteration-1.json"))
	if files, _ := record["files"].([]any); len(files) != 1 || files[0] != "src/upload.go" {
		t.Errorf("iteration-1.json %v", record)
	}

	specState := readJSONFile(t, filepath.Join(rt.root, ".eser", ".state", "progresses", "specs", "test.json"))
	if specState["phase"] != noskillsfx.PhaseCompleted {
		t.Errorf("the spec's state is %v", specState["phase"])
	}

	state := rt.state(t)
	if state["phase"] != noskillsfx.PhaseIdle {
		t.Errorf("the global state is %v", state["phase"])
	}

	assertReleased(t, state)
}

func TestRunStopsAtMaxIterations(t *testing.T) {
	t.Parallel()

	rt := newRunTest(t, noskillsfx.PhaseExecuting, "  allowGit: true\n")
	rt.agent.turns = []fakeTurn{
		editTurn(t, rt.root, "a.go", aifx.StopReasonEndTurn),
		editTurn(t, rt.root, "b.go", aifx.StopReasonMaxTokens),
	}

	if code := rt.run(context.Background(), "--max-iterations=2", "--max-turns=3x", "--unattended"); code != exitMaxIterations {
		t.Fatalf("exit %d:\n%s", code, rt.stdout)
	}

	out := rt.stdout.String()
	for _, want := range []string{
		"Mode: unattended, max-turns: 3, max-iterations: 2",
		"Agent finished (max_tokens). Iteration 2: no file changes",
		yellow("  Turn ended early: max_tokens"),
		yellow("⚠") + " Max iterations (2) reached. Stopping.",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("stdout does not hold %q:\n%s", want, out)
		}
	}

	state := rt.state(t)
	if iteration, _ := executionField(state, "iteration"); iteration != 2.0 {
		t.Errorf("execution.iteration = %v, want 2", iteration)
	}

	if files, _ := executionField(state, "modifiedFiles"); !slices.Equal(files.([]any), []any{"b.go"}) { //nolint:forcetypeassert // recorded as a list
		t.Errorf("execution.modifiedFiles = %v", files)
	}

	for _, name := range []string{"iteration-1.json", "iteration-2.json"} {
		readJSONFile(t, filepath.Join(rt.root, ".eser", ".state", "progresses", "iterations", name))
	}

	if rt.agent.configs[0].Properties["maxTurns"] != 3 {
		t.Errorf("--max-turns=3x gave %v", rt.agent.configs[0].Properties["maxTurns"])
	}

	assertReleased(t, state)
}

func TestRunBlocked(t *testing.T) {
	t.Parallel()

	t.Run("unattended logs and stops", func(t *testing.T) {
		t.Parallel()

		rt := newRunTest(t, noskillsfx.PhaseExecuting, "  allowGit: true\n")
		rt.agent.turns = []fakeTurn{blockTurn(t, rt.root)}

		if code := rt.run(context.Background(), "--unattended"); code != 1 {
			t.Fatalf("exit %d:\n%s", code, rt.stdout)
		}

		if !strings.Contains(rt.stdout.String(), yellow("⚠")+" Execution blocked: "+dim("BLOCKED: need the API key")) {
			t.Errorf("stdout:\n%s", rt.stdout)
		}

		log, err := os.ReadFile(filepath.Join(rt.root, ".eser", ".state", "progresses", "blocked.log"))
		if err != nil || !strings.HasSuffix(string(log), "] iteration=2 reason=BLOCKED: need the API key\n") {
			t.Errorf("blocked.log %q, %v", log, err)
		}

		if rt.agent.calls() != 1 {
			t.Errorf("the agent ran %d turns, want the one that blocked", rt.agent.calls())
		}

		// The Stop hook would not count a turn that blocked, and neither does the loop.
		if iteration, _ := executionField(rt.state(t), "iteration"); iteration != 0.0 {
			t.Errorf("execution.iteration = %v", iteration)
		}

		assertReleased(t, rt.state(t))
	})

	t.Run("a resolution resumes the loop", func(t *testing.T) {
		t.Parallel()

		rt := newRunTest(t, noskillsfx.PhaseExecuting, "  allowGit: true\n")
		rt.agent.turns = []fakeTurn{blockTurn(t, rt.root), editTurn(t, rt.root, "a.go", aifx.StopReasonEndTurn)}
		rt.stdin = strings.NewReader("the key is in .env.local\n")

		if code := rt.run(context.Background(), "--max-iterations=3"); code != exitMaxIterations {
			t.Fatalf("exit %d:\n%s", code, rt.stdout)
		}

		if !strings.Contains(rt.stdout.String(), "Enter resolution (or leave empty to stop):") ||
			!strings.Contains(rt.stdout.String(), dim("  Last: Resolved: the key is in .env.local")) {
			t.Errorf("stdout:\n%s", rt.stdout)
		}

		if !strings.Contains(rt.agent.prompts[1], "Resolved: the key is in .env.local") {
			t.Errorf("the turn after the resolution was not told about it:\n%s", rt.agent.prompts[1])
		}

		specState := readJSONFile(t, filepath.Join(rt.root, ".eser", ".state", "progresses", "specs", "test.json"))
		if specState["phase"] != noskillsfx.PhaseExecuting {
			t.Errorf("the spec's own state is %v", specState["phase"])
		}
	})

	t.Run("an empty resolution stops", func(t *testing.T) {
		t.Parallel()

		rt := newRunTest(t, noskillsfx.PhaseExecuting, "  allowGit: true\n")
		rt.agent.turns = []fakeTurn{blockTurn(t, rt.root)}
		rt.stdin = strings.NewReader("\n")

		if code := rt.run(context.Background()); code != 0 || !strings.Contains(rt.stdout.String(), dim("Stopped by user.")) {
			t.Errorf("exit %d:\n%s", code, rt.stdout)
		}
	})
}

func TestRunRefusals(t *testing.T) {
	t.Parallel()

	t.Run("not initialized", func(t *testing.T) {
		t.Parallel()

		te := newTestEnv(t, t.TempDir())
		te.agent = &runPorts{agent: &fakeAgent{t: t}} //nolint:exhaustruct

		if code := run(context.Background(), te.env, []string{"run"}); code != 1 ||
			te.stdout.String() != red("noskills not initialized. Run: npx eser@latest noskills init")+ansiReset+"\n" {
			t.Errorf("exit %d: %q", code, te.stdout)
		}
	})

	t.Run("a phase run does not start from", func(t *testing.T) {
		t.Parallel()

		rt := newRunTest(t, noskillsfx.PhaseIdle, "")

		want := red("Cannot run from phase: IDLE") + ansiReset + "\n" + dim("Must be in SPEC_APPROVED or EXECUTING to start.") + ansiReset + "\n"
		if code := rt.run(context.Background()); code != 1 || rt.stdout.String() != want {
			t.Errorf("exit %d: %q", code, rt.stdout)
		}
	})

	t.Run("an unknown spec", func(t *testing.T) {
		t.Parallel()

		rt := newRunTest(t, noskillsfx.PhaseExecuting, "")

		if code := rt.run(context.Background(), "--spec=missing"); code != 1 || !strings.Contains(rt.stderr.String(), "missing") {
			t.Errorf("exit %d: %q", code, rt.stderr)
		}
	})

	t.Run("help", func(t *testing.T) {
		t.Parallel()

		rt := newRunTest(t, noskillsfx.PhaseExecuting, "")

		if code := rt.run(context.Background(), "--help"); code != 0 || !strings.Contains(rt.stdout.String(), "Usage: noskills run") || rt.agent.calls() != 0 {
			t.Errorf("exit %d: %q", code, rt.stdout)
		}
	})
}

func TestRunAgentFailures(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name      string
		createErr error
		turn      fakeTurn
		want      string
	}{
		{
			name: "the model cannot be created", createErr: errFakeCreate,
			want: red("  Failed to run the agent: the agent could not be started: claude: command not found") + dim(" Is the claude CLI installed?"),
		},
		{
			name: "the turn fails",
			turn: func(_ context.Context, _ string, send func(aifx.StreamEvent) bool) (aifx.StopReason, error) {
				send(textEvent("starting"))

				return "", errFakeStream
			},
			want: "    starting\n" + red("  Agent turn failed: claude-code: exited 1 without running the turn"),
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			rt := newRunTest(t, noskillsfx.PhaseExecuting, "  allowGit: true\n", tc.turn)
			rt.agent.createErr = tc.createErr

			if code := rt.run(context.Background()); code != 1 || !strings.Contains(rt.stdout.String(), tc.want) {
				t.Errorf("exit %d:\n%s", code, rt.stdout)
			}

			state := rt.state(t)
			if iteration, _ := executionField(state, "iteration"); iteration != 0.0 {
				t.Errorf("a failed turn was recorded: iteration %v", iteration)
			}

			assertReleased(t, state)
		})
	}
}

// gitOnPath is a PATH directory with a stand-in git, so the loop installs
// the wrapper.
func gitOnPath(t *testing.T) string {
	t.Helper()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "git"), []byte("#!/bin/sh\n"), 0o755); err != nil { //nolint:gosec // G306: a stand-in executable
		t.Fatal(err)
	}

	return dir
}

func TestRunCancelledMidStream(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	started := make(chan struct{})

	var rt *runTest

	hang := func(turnCtx context.Context, _ string, send func(aifx.StreamEvent) bool) (aifx.StopReason, error) {
		assertClaimed(t, rt.root)

		if path := rt.pathValue(); !strings.HasPrefix(path, noskillsfx.WrapperBinDir(rt.root)+string(os.PathListSeparator)) {
			t.Errorf("the agent's PATH %q does not start with the git wrapper", path)
		}

		send(textEvent("Reading the upload handler"))
		close(started)

		// An agent in the middle of a turn: only the cancel ends it.
		<-turnCtx.Done()

		return "", turnCtx.Err()
	}

	rt = newRunTest(t, noskillsfx.PhaseExecuting, "", hang)
	pathDir := gitOnPath(t)
	rt.vars["PATH"] = pathDir

	go func() {
		select {
		case <-started:
			cancel() // Ctrl-C: main's signal context is cancelled.
		case <-ctx.Done():
		case <-time.After(10 * time.Second):
			t.Error("the turn never started")
			cancel()
		}
	}()

	if code := rt.run(ctx); code != exitInterrupted {
		t.Fatalf("exit %d, want %d:\n%s", code, exitInterrupted, rt.stdout)
	}

	out := rt.stdout.String()
	if !strings.Contains(out, "    Reading the upload handler\n") || !strings.Contains(out, yellow("⚠")+" Interrupted.") {
		t.Errorf("stdout:\n%s", out)
	}

	state := rt.state(t)
	assertReleased(t, state)

	if iteration, _ := executionField(state, "iteration"); iteration != 0.0 {
		t.Errorf("the cancelled turn was recorded: iteration %v", iteration)
	}

	if state["phase"] != noskillsfx.PhaseExecuting {
		t.Errorf("phase %v", state["phase"])
	}

	if _, err := os.Stat(filepath.Join(rt.root, ".eser", ".state", "progresses", "iterations")); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("an iteration log was written: %v", err)
	}

	if got := rt.pathValue(); got != pathDir {
		t.Errorf("PATH after the loop is %q, want %q", got, pathDir)
	}
}

func (rt *runTest) pathValue() string {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	return rt.vars["PATH"]
}

func TestRunAutoCommitsWithTheRealGit(t *testing.T) {
	t.Parallel()

	rt := newRunTest(t, noskillsfx.PhaseExecuting, "  allowGit: false\n  autoCommit: true\n")
	rt.agent.turns = []fakeTurn{editTurn(t, rt.root, "a.go", aifx.StopReasonEndTurn)}
	rt.status = " M a.go\n"
	pathDir := gitOnPath(t)
	rt.vars["PATH"] = pathDir

	if code := rt.run(context.Background(), "--max-iterations=1"); code != exitMaxIterations {
		t.Fatalf("exit %d:\n%s", code, rt.stdout)
	}

	if !strings.Contains(rt.stdout.String(), dim("  Auto-committed.")) {
		t.Errorf("stdout:\n%s", rt.stdout)
	}

	rt.mu.Lock()
	defer rt.mu.Unlock()

	ran := make([][]string, 0, len(rt.commands))
	for _, call := range rt.commands {
		ran = append(ran, call.args)

		// The commit runs outside the agent's guard.
		if !slices.Contains(call.environ, "PATH="+pathDir) {
			t.Errorf("git %v ran with %v", call.args, call.environ)
		}
	}

	want := [][]string{{"status", "--porcelain"}, {"add", "-A"}, {"commit", "-m", "noskills: iteration 1: progress"}}
	if !slices.EqualFunc(ran, want, slices.Equal[[]string]) {
		t.Errorf("git calls %v, want %v", ran, want)
	}
}

func TestParseLeadingInt(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		in   string
		want int
		ok   bool
	}{
		{"12", 12, true}, {" 7x", 7, true}, {"+3", 3, true}, {"-4", -4, true}, {"3.9", 3, true}, {"", 0, false}, {"x1", 0, false},
	} {
		if got, ok := parseLeadingInt(tc.in); got != tc.want || ok != tc.ok {
			t.Errorf("parseLeadingInt(%q) = %d, %v", tc.in, got, ok)
		}
	}

	if got := positiveFlag([]string{"--max-turns=0", "--max-turns=5"}, "--max-turns", 10); got != 5 {
		t.Errorf("positiveFlag skipped to %d", got)
	}
}

func TestAgentPrinterDropsControlCharacters(t *testing.T) {
	t.Parallel()

	var out strings.Builder

	p := &agentPrinter{w: &out, lineStart: true}
	p.text("one\x1b[2J\n\ttwo\x07")
	p.tool("Bash\x1b]0;x")
	p.text("three")
	p.finish()

	if want := "    one[2J\n    \ttwo\n" + dim("    ▸ Bash]0;x") + ansiReset + "\n    three\n"; out.String() != want {
		t.Errorf("printed %q, want %q", out.String(), want)
	}
}
