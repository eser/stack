// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// runPromptsFile holds the prompt the TypeScript `noskills run` builds for
// each fixture of runPromptFixtures. Record it again with
//
//	NOSKILLS_RUN_PROMPT_RECORD=1 go test -run TestBuildRunPromptMatchesTypeScript ./pkg/ajan/noskillsfx/
//
// which runs commands/run.ts (compile with headlessHints, then
// buildAgentPrompt) under node on the same fixture projects.
const runPromptsFile = "testdata/run_prompts.json"

// runFixtureState is an EXECUTING state of spec "test" with the execution
// fields set.
func runFixtureState(execution *JSObject) *JSObject {
	state := InitialState()
	state.set("phase", PhaseExecuting)
	state.set("spec", "test")
	state.set("specDescription", "Add photo upload support")
	state.set("branch", "spec/test")
	state.set("execution", execution)

	return state
}

// runPromptFixtures are the projects the prompt is compared on, as the
// concerns the manifest lists and the state.
func runPromptFixtures() map[string]struct {
	concerns []string
	state    *JSObject
} {
	type fixture = struct {
		concerns []string
		state    *JSObject
	}

	return map[string]fixture{
		"first-iteration": {concerns: nil, state: runFixtureState(initialExecution())},
		"debt-and-failed-verification": {
			concerns: []string{"move-fast", "compliance"},
			state: runFixtureState(initialExecution().with(
				"iteration", 2.0,
				"lastProgress", "1 file changed, 3 insertions(+)",
				"lastVerification", JSObjectOf("passed", false, "output", "FAIL upload_test.go:12: want 200, got 500",
					"timestamp", "2026-10-25T11:00:00.000Z"),
				"debt", JSObjectOf("items", []any{
					JSObjectOf("id", "debt-1", "text", "handle an empty upload", "since", 1.0),
				}, "fromIteration", 1.0, "unaddressedIterations", 1.0),
				"debtCounter", 1.0,
			)),
		},
	}
}

// writeRunFixture writes a project for a fixture: the manifest with its
// concerns, the concern files, the spec directory and the state.
func writeRunFixture(t *testing.T, root string, concerns []string, state *JSObject) {
	t.Helper()

	plan := &InitPlan{Concerns: concerns, Tools: []string{"claude-code"}, Providers: []string{}, Project: DetectProject(root), Command: "noskills"}
	if plan.Concerns == nil {
		plan.Concerns = []string{}
	}

	if err := WriteInit(root, plan, false); err != nil {
		t.Fatal(err)
	}

	writeTestFile(t, filepath.Join(root, specsDir, "test", "spec.md"), "# Spec: test\n\nAdd photo upload support\n")

	if err := WriteStateAndSpec(root, state, nil); err != nil {
		t.Fatal(err)
	}
}

// tsRunPrompt runs the TypeScript prompt builder of commands/run.ts on a
// project under node.
func tsRunPrompt(t *testing.T, root string) string {
	t.Helper()

	node, err := exec.LookPath("node")
	if err != nil {
		t.Fatal("recording needs node")
	}

	pkg, err := filepath.Abs("../../@eserstack/noskills")
	if err != nil {
		t.Fatal(err)
	}

	script := `
const [root, pkg] = process.argv.slice(1);
const run = await import(pkg + "/commands/run.ts");
const compiler = await import(pkg + "/context/compiler.ts");
const persistence = await import(pkg + "/state/persistence.ts");
const syncEngine = await import(pkg + "/sync/engine.ts");
const cmd = await import(pkg + "/output/cmd.ts");
await cmd.loadCommandPrefix(root);
const state = await persistence.readState(root);
const config = await persistence.readManifest(root);
const concerns = (await persistence.listConcerns(root)).filter((c) => config.concerns.includes(c.id));
const rules = await syncEngine.loadRules(root);
const output = await compiler.compile(state, concerns, rules, config, undefined, undefined, undefined, run.headlessHints());
process.stdout.write(JSON.stringify(run.buildAgentPrompt(output)));
`

	cmd := exec.Command(node, "--disable-warning=ExperimentalWarning", "--input-type=module", "-e", script, root, pkg) //nolint:gosec,noctx // G204: node on the repository's own sources
	cmd.Dir = root

	out, err := cmd.Output()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			t.Fatalf("node: %v: %s", err, exitErr.Stderr)
		}

		t.Fatal(err)
	}

	var prompt string
	if err := json.Unmarshal(out, &prompt); err != nil {
		t.Fatalf("node printed %q: %v", out, err)
	}

	return prompt
}

func TestBuildRunPromptMatchesTypeScript(t *testing.T) {
	t.Parallel()

	record := os.Getenv("NOSKILLS_RUN_PROMPT_RECORD") == "1"
	recorded := map[string]string{}

	if !record {
		data, err := os.ReadFile(runPromptsFile)
		if err != nil {
			t.Fatalf("read %s: %v (record with NOSKILLS_RUN_PROMPT_RECORD=1)", runPromptsFile, err)
		}

		if err := json.Unmarshal(data, &recorded); err != nil {
			t.Fatal(err)
		}
	}

	got := map[string]string{}

	for name, fixture := range runPromptFixtures() {
		root := t.TempDir()
		writeRunFixture(t, root, fixture.concerns, fixture.state)

		e := &LifecycleEnv{Root: root, Cwd: root, LookupEnv: nil, Now: fixedNow, RunGit: nil, RunShell: nil, Warn: nil, Notice: nil}
		state := ReadHookState(root, nil)
		got[name] = BuildRunPrompt(CompileRunTurn(e, state), CommandPrefixOf(mustManifest(t, root)))

		if record {
			recorded[name] = tsRunPrompt(t, root)
		}
	}

	if record {
		data, err := json.MarshalIndent(recorded, "", "  ")
		if err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(runPromptsFile, append(data, '\n'), 0o644); err != nil { //nolint:gosec // G306: a test recording
			t.Fatal(err)
		}
	}

	for name, want := range recorded {
		if got[name] != want {
			t.Errorf("%s: the Go prompt differs from the TypeScript one\n--- go\n%s\n--- typescript\n%s", name, got[name], want)
		}
	}

	if len(recorded) != len(runPromptFixtures()) {
		t.Errorf("%s holds %d prompts, want %d", runPromptsFile, len(recorded), len(runPromptFixtures()))
	}
}

func mustManifest(t *testing.T, root string) *JSObject {
	t.Helper()

	manifest, ok := readManifestSection(root)
	if !ok {
		t.Fatal("the fixture has no manifest")
	}

	return manifest
}

func TestBuildRunPromptIsHeadless(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeRunFixture(t, root, []string{"move-fast", "compliance"}, runFixtureState(initialExecution()))

	e := &LifecycleEnv{Root: root, Cwd: root, LookupEnv: nil, Now: fixedNow, RunGit: nil, RunShell: nil, Warn: nil, Notice: nil}
	output := CompileRunTurn(e, ReadHookState(root, nil))
	prompt := BuildRunPrompt(output, "noskills")

	for _, want := range []string{
		"Working on spec: test",
		`When done, report progress: noskills spec test next --answer="your progress"`,
		`If blocked, run: noskills spec test block "reason"`,
		"When all tasks are complete: noskills spec test done",
		"TENSION GATE",
	} {
		if !strings.Contains(prompt, want) {
			t.Errorf("the prompt does not say %q:\n%s", want, prompt)
		}
	}

	// Nobody answers a question during a loop turn.
	for _, phrase := range []string{
		"AskUserQuestion", "Recommend first, then ask", "Display `roadmap`", "Permanent rule or just this task", "Listen first",
	} {
		if strings.Contains(prompt, phrase) {
			t.Errorf("the headless prompt says %q", phrase)
		}
	}

	if hints := RunHints(); !hints.Headless || hints.SubAgentMethod != "task" {
		t.Errorf("hints %+v", hints)
	}
}

func TestBuildRunPromptWithoutSpec(t *testing.T) {
	t.Parallel()

	output := JSObjectOf("meta", JSObjectOf("resumeHint", "Resume.", "spec", nil), "behavioral", JSObjectOf("rules", []any{}))

	want := "Resume.\n\nWhen done, report progress: nos next --answer=\"your progress\"\nIf blocked, run: nos block \"reason\"\n" +
		"When all tasks are complete: nos done"
	if got := BuildRunPrompt(output, "nos"); got != want {
		t.Errorf("prompt:\n%q\nwant:\n%q", got, want)
	}
}

func TestRunDriverClaim(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := filepath.Join(root, stateFile)
	writeTestFile(t, path, `{"phase":"EXECUTING","execution":{"iteration":1,"driver":"stale"},"z":true}`)
	specPath := filepath.Join(root, specStatesDir, "test.json")
	writeTestFile(t, specPath, `{"spec":"test","execution":{"iteration":1}}`)
	otherPath := filepath.Join(root, specStatesDir, "other.json")
	writeTestFile(t, otherPath, `{"spec":"test","execution":{}}`)

	if err := ClaimRunDriver(root, "test", 4242); err != nil {
		t.Fatal(err)
	}

	claimed := readTestFile(t, path)
	if want := "{\n  \"phase\": \"EXECUTING\",\n  \"execution\": {\n    \"iteration\": 1,\n    \"driver\": \"acp\",\n    \"driverPid\": 4242\n  },\n  \"z\": true\n}\n"; claimed != want {
		t.Errorf("claimed state:\n%s", claimed)
	}

	parsed, _ := parseJSON(claimed)
	execution, _ := fieldObject(parsed.(*JSObject), "execution") //nolint:forcetypeassert // the test wrote an object

	if !IsDriverAuthoritative(execution, func(pid int) bool { return pid == 4242 }) {
		t.Error("the Stop hook does not stand down for a live claim")
	}

	if IsDriverAuthoritative(execution, func(int) bool { return false }) {
		t.Error("a dead owner's claim is binding")
	}

	// The agent's `spec test next` writes the spec's state over state.json,
	// so the claim is in both.
	if got := readTestFile(t, specPath); !strings.Contains(got, `"driver": "acp"`) || !strings.Contains(got, `"driverPid": 4242`) {
		t.Errorf("claimed spec state:\n%s", got)
	}

	// A spec state file that names another spec is left alone.
	if err := ClaimRunDriver(root, "other", 4242); err != nil {
		t.Fatal(err)
	}

	if got := readTestFile(t, otherPath); got != `{"spec":"test","execution":{}}` {
		t.Errorf("the state of another spec was claimed:\n%s", got)
	}

	if err := ReleaseRunDriver(root, "test"); err != nil {
		t.Fatal(err)
	}

	if got, want := readTestFile(t, path), "{\n  \"phase\": \"EXECUTING\",\n  \"execution\": {\n    \"iteration\": 1\n  },\n  \"z\": true\n}\n"; got != want {
		t.Errorf("released state:\n%s", got)
	}

	if got := readTestFile(t, specPath); strings.Contains(got, "driver") {
		t.Errorf("released spec state:\n%s", got)
	}

	if err := ClaimRunDriver(t.TempDir(), "", 1); !errors.Is(err, ErrRunStateUnreadable) {
		t.Errorf("a project without state.json: %v", err)
	}
}

func TestRunStartAndResume(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	approved := runFixtureState(initialExecution().with("iteration", 4.0))
	approved.set("phase", PhaseSpecApproved)
	writeRunFixture(t, root, nil, approved)

	e := &LifecycleEnv{Root: root, Cwd: root, LookupEnv: nil, Now: fixedNow, RunGit: nil, RunShell: nil, Warn: nil, Notice: nil}

	if err := CheckRunPhase(InitialState()); !errors.Is(err, ErrRunPhase) || !strings.Contains(err.Error(), "Cannot run from phase: IDLE") {
		t.Errorf("IDLE: %v", err)
	}

	if err := CheckRunPhase(approved); err != nil {
		t.Errorf("SPEC_APPROVED: %v", err)
	}

	started, err := StartRunExecution(e, approved)
	if err != nil {
		t.Fatal(err)
	}

	// Both files: `spec test next` reads the spec's own state.
	for _, state := range []*JSObject{ReadHookState(root, nil), ReadSpecStateObject(root, "test", nil)} {
		if phaseOf(state) != PhaseExecuting || executionOf(state).num("iteration") != 0 {
			t.Errorf("started state %s", state)
		}
	}

	blocked, err := blockExecutionState(started, "need the API key")
	if err != nil {
		t.Fatal(err)
	}

	if got := BlockedReason(blocked); got != "BLOCKED: need the API key" {
		t.Errorf("blocked reason %q", got)
	}

	resumed, err := ResumeBlockedRun(e, blocked, "the key is in .env.local")
	if err != nil {
		t.Fatal(err)
	}

	if phaseOf(resumed) != PhaseExecuting || executionOf(resumed).str("lastProgress") != "Resolved: the key is in .env.local" {
		t.Errorf("resumed state %s", resumed)
	}

	if phaseOf(ReadSpecStateObject(root, "test", nil)) != PhaseExecuting {
		t.Error("the spec's own state is still BLOCKED")
	}

	if got := AutoCommitMessage(resumed); got != "noskills: iteration 0: Resolved: the key is in .env.local" {
		t.Errorf("commit message %q", got)
	}

	if got := AutoCommitMessage(runFixtureState(initialExecution())); got != "noskills: iteration 0: progress" {
		t.Errorf("commit message without progress %q", got)
	}
}

func TestSummarizeRunTurn(t *testing.T) {
	t.Parallel()

	fixture := runPromptFixtures()["debt-and-failed-verification"]
	state := fixture.state.with("decisions", []any{JSObjectOf("id", "d1")})

	got := SummarizeRunTurn(state)
	want := RunTurnSummary{
		Phase: PhaseExecuting, Iteration: "2", LastProgress: "1 file changed, 3 insertions(+)", HasLastProgress: true,
		VerificationFailed: true, HasDebt: true, DebtItems: 1, Decisions: 1,
	}

	if got != want {
		t.Errorf("summary %+v, want %+v", got, want)
	}

	if fresh := SummarizeRunTurn(runFixtureState(initialExecution())); fresh.HasLastProgress || fresh.HasDebt || fresh.VerificationFailed {
		t.Errorf("fresh summary %+v", fresh)
	}
}

func TestLogBlockedRun(t *testing.T) {
	t.Parallel()

	root := t.TempDir()

	if err := LogBlockedRun(root, "waiting on the API key", 2, fixedNow()); err != nil {
		t.Fatal(err)
	}

	if err := LogBlockedRun(root, "tests still fail", 3, fixedNow()); err != nil {
		t.Fatal(err)
	}

	want := "[2026-10-25T12:00:00.123Z] iteration=2 reason=waiting on the API key\n" +
		"[2026-10-25T12:00:00.123Z] iteration=3 reason=tests still fail\n"
	if got := readTestFile(t, filepath.Join(root, progressesDir, blockedLogFile)); got != want {
		t.Errorf("blocked.log:\n%s", got)
	}
}

func TestReadRunSettings(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, manifestFile), "noskills:\n  allowGit: true\n  autoCommit: true\n  command: bin/noskills\n")

	if got, ok := ReadRunSettings(root); !ok || got != (RunSettings{CommandPrefix: "bin/noskills", AllowGit: true, AutoCommit: true}) {
		t.Errorf("settings %+v, %v", got, ok)
	}

	if _, ok := ReadRunSettings(t.TempDir()); ok {
		t.Error("a project without a manifest has settings")
	}
}
