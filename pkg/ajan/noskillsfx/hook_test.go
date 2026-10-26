// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
)

var errGitMissing = errors.New("exec: git: not found")

// fakeGit answers git calls from a table keyed by the joined arguments,
// with or without the directory first. The hooks call it from several
// goroutines.
type fakeGit struct {
	answers map[string]string
	fail    map[string]bool
	err     error

	mu    sync.Mutex
	calls []string
}

func (f *fakeGit) run(_ context.Context, _ string, args []string, dir string) (string, bool, error) {
	key := strings.Join(args, " ")

	f.mu.Lock()
	f.calls = append(f.calls, dir+": "+key)
	f.mu.Unlock()

	if f.err != nil {
		return "", false, f.err
	}

	if f.fail[key] || f.fail[dir+": "+key] {
		return "", false, nil
	}

	if answer, ok := f.answers[dir+": "+key]; ok {
		return answer, true, nil
	}

	return f.answers[key], true, nil
}

func writeTestFile(t *testing.T, path, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func readTestFile(t *testing.T, path string) string {
	t.Helper()

	data, err := os.ReadFile(path) //nolint:gosec // G304: a file of the test's temp dir
	if err != nil {
		t.Fatal(err)
	}

	return string(data)
}

func fixedNow() time.Time {
	return time.Date(2026, 10, 25, 12, 0, 0, 123_000_000, time.UTC)
}

func TestDefaultConcernsMatchTypeScript(t *testing.T) {
	t.Parallel()

	tsDir := filepath.Join("..", "..", "@eserstack", "noskills", "defaults", "concerns")

	entries, err := os.ReadDir(tsDir)
	if err != nil {
		t.Fatal(err)
	}

	count := 0

	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		count++

		want := readTestFile(t, filepath.Join(tsDir, entry.Name()))

		got, err := defaultConcernFiles.ReadFile("defaults/concerns/" + strings.ReplaceAll(entry.Name(), "-", "_"))
		if err != nil {
			t.Fatalf("%s has no embedded copy: %v", entry.Name(), err)
		}

		if string(got) != want {
			t.Errorf("defaults/concerns/%s differs from the TypeScript file; copy it again", entry.Name())
		}
	}

	concerns, err := DefaultConcerns()
	if err != nil {
		t.Fatal(err)
	}

	if len(concerns) != count || concerns[0].ID != "open-source" || concerns[count-1].ID != "retro-fed" {
		t.Errorf("DefaultConcerns gives %d concerns from %s to %s", len(concerns), concerns[0].ID, concerns[len(concerns)-1].ID)
	}
}

func TestRecordIterationKeepsTheStateAndLogsTheTurn(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	statePath := filepath.Join(root, stateFile)
	writeTestFile(t, statePath, `{"phase":"EXECUTING","zeta":{"keep":[1,2.5]},"execution":{"driver":"none","iteration":2,"lastProgress":"earlier"},"lastCalledAt":null,"1":"index"}`)
	writeTestFile(t, filepath.Join(root, progressesDir, filesChangedLog),
		`{"file":"a.go","tool":"Write"}`+"\n"+"not json\n"+`{"file":"a.go"}`+"\n"+`{"file":""}`+"\n"+`{"file":"c.go"}`+"\n")

	git := &fakeGit{answers: map[string]string{
		"diff --name-only": "b.go\na.go\n",
		"diff --stat":      " a.go | 2 +-\n b.go | 1 +\n 2 files changed, 2 insertions(+), 1 deletion(-)\n",
	}}

	record, err := RecordIteration(context.Background(), root, git.run, "git", fixedNow())
	if err != nil {
		t.Fatal(err)
	}

	if record.Iteration != 3 || !slices.Equal(record.ModifiedFiles, []string{"a.go", "c.go", "b.go"}) {
		t.Errorf("record %+v", record)
	}

	want := `{
  "1": "index",
  "phase": "EXECUTING",
  "zeta": {
    "keep": [
      1,
      2.5
    ]
  },
  "execution": {
    "driver": "none",
    "iteration": 3,
    "lastProgress": "2 files changed, 2 insertions(+), 1 deletion(-)",
    "modifiedFiles": [
      "a.go",
      "c.go",
      "b.go"
    ]
  },
  "lastCalledAt": "2026-10-25T12:00:00.123Z"
}
`
	if got := readTestFile(t, statePath); got != want {
		t.Errorf("state.json:\n%s\nwant:\n%s", got, want)
	}

	if got := readTestFile(t, filepath.Join(root, progressesDir, filesChangedLog)); got != "" {
		t.Errorf("files-changed.jsonl keeps %q", got)
	}

	log := readTestFile(t, filepath.Join(root, progressesDir, "iterations", "iteration-3.json"))
	if !strings.Contains(log, `"gitStat": "2 files changed`) || !strings.Contains(log, `"timestamp": "2026-10-25T12:00:00.123Z"`) {
		t.Errorf("iteration log:\n%s", log)
	}
}

func TestRecordIterationKeepsTheProgressNoteWhenGitCannotAnswer(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, stateFile), `{"execution":{"lastProgress":"earlier"}}`)

	if _, err := RecordIteration(context.Background(), root, (&fakeGit{err: errGitMissing}).run, "git", fixedNow()); err != nil {
		t.Fatal(err)
	}

	if got := readTestFile(t, filepath.Join(root, stateFile)); !strings.Contains(got, `"lastProgress": "earlier"`) || !strings.Contains(got, `"iteration": 1`) {
		t.Errorf("state.json:\n%s", got)
	}

	if _, err := RecordIteration(context.Background(), t.TempDir(), (&fakeGit{}).run, "git", fixedNow()); err == nil {
		t.Error("a project without state.json records an iteration")
	}
}

func TestStopHook(t *testing.T) {
	t.Parallel()

	alive := func(int) bool { return true }
	dead := func(int) bool { return false }

	cases := []struct {
		name     string
		state    string
		manifest string
		input    string
		isAlive  func(int) bool
		notice   string
		recorded bool
	}{
		{name: "records and warns at the threshold", state: `{"phase":"EXECUTING","execution":{"iteration":1}}`,
			manifest: "noskills:\n  maxIterationsBeforeRestart: 2\n", input: `{}`, isAlive: dead,
			notice: "noskills: iteration 2 reached threshold (2). Consider starting a fresh conversation.\n", recorded: true},
		{name: "uses 15 without a manifest", state: `{"phase":"EXECUTING","execution":{"iteration":14}}`,
			input: `{}`, isAlive: dead, notice: "noskills: iteration 15 reached threshold (15). Consider starting a fresh conversation.\n", recorded: true},
		{name: "a manifest without the key never warns", state: `{"phase":"EXECUTING","execution":{"iteration":99}}`,
			manifest: "noskills:\n  allowGit: false\n", input: `{}`, isAlive: dead, recorded: true},
		{name: "not EXECUTING", state: `{"phase":"DISCOVERY"}`, input: `{}`, isAlive: dead},
		{name: "a stop the hook caused", state: `{"phase":"EXECUTING"}`, input: `{"stop_hook_active":true}`, isAlive: dead},
		{name: "noskills run holds the turn", state: `{"phase":"EXECUTING","execution":{"driver":"acp","driverPid":42}}`, input: `{}`, isAlive: alive},
		{name: "a dead driver releases the turn", state: `{"phase":"EXECUTING","execution":{"driver":"acp","driverPid":42}}`, input: `{}`, isAlive: dead, recorded: true},
		{name: "a claim without a pid is not binding", state: `{"phase":"EXECUTING","execution":{"driver":"acp"}}`, input: `{}`, isAlive: alive, recorded: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			root := t.TempDir()
			writeTestFile(t, filepath.Join(root, stateFile), tc.state)
			writeTestFile(t, filepath.Join(root, progressesDir, executorFlagFile), "x")

			if tc.manifest != "" {
				writeTestFile(t, filepath.Join(root, manifestFile), tc.manifest)
			}

			notice := StopHook(context.Background(), ParseHookInput(tc.input), &StopHookInput{
				Root: root, Run: (&fakeGit{}).run, Git: "git", IsAlive: tc.isAlive, Now: fixedNow(),
			})
			if notice != tc.notice {
				t.Errorf("notice %q, want %q", notice, tc.notice)
			}

			_, err := os.Stat(filepath.Join(root, progressesDir, executorFlagFile))
			if recorded := errors.Is(err, os.ErrNotExist); recorded != tc.recorded {
				t.Errorf("recorded %v, want %v", recorded, tc.recorded)
			}
		})
	}
}

func TestInstallGitWrapper(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	bin := t.TempDir()
	writeTestFile(t, filepath.Join(bin, "git"), "#!/bin/sh\n")

	if err := os.Chmod(filepath.Join(bin, "git"), 0o755); err != nil { //nolint:gosec // G302: a fake git must be executable
		t.Fatal(err)
	}

	pathValue := "relative:" + WrapperBinDir(root) + ":" + bin
	git := &fakeGit{answers: map[string]string{"rev-parse --path-format=absolute --git-common-dir": "/repo/.git\n"}}

	opts := &InstallGitWrapperOptions{Root: root, CommandPrefix: "noskills", PathValue: pathValue, GOOS: "darwin", Run: git.run}

	wrapper, err := InstallGitWrapper(context.Background(), opts)
	if err != nil || wrapper == nil {
		t.Fatalf("InstallGitWrapper: %v, %v", wrapper, err)
	}

	script := readTestFile(t, filepath.Join(WrapperBinDir(root), "git"))
	if !strings.Contains(script, "real_git='"+bin+"/git'") || !strings.Contains(script, "project_git_dir='/repo/.git'") ||
		!strings.Contains(script, " noskills invoke-hook git-exec ") {
		t.Errorf("script:\n%s", script)
	}

	info, err := os.Stat(filepath.Join(WrapperBinDir(root), "git"))
	if err != nil || info.Mode().Perm() != 0o755 {
		t.Errorf("mode %v, %v", info.Mode(), err)
	}

	for name, change := range map[string]func(o *InstallGitWrapperOptions){
		"windows":   func(o *InstallGitWrapperOptions) { o.GOOS = "windows" },
		"no git":    func(o *InstallGitWrapperOptions) { o.PathValue = "/nonexistent" },
		"wrapper":   func(o *InstallGitWrapperOptions) { o.PathValue = WrapperBinDir(root) },
		"no answer": func(o *InstallGitWrapperOptions) { o.Run = (&fakeGit{err: errGitMissing}).run },
	} {
		copied := *opts
		change(&copied)

		wrapper, err := InstallGitWrapper(context.Background(), &copied)
		if name == "no answer" {
			if err == nil {
				t.Errorf("%s: no error", name)
			}

			continue
		}

		if wrapper != nil || err != nil {
			t.Errorf("%s: %v, %v", name, wrapper, err)
		}
	}
}

func TestCheckGitExec(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	revParse := "rev-parse --path-format=absolute --git-common-dir"
	project := &fakeGit{answers: map[string]string{revParse: "/repo/.git\n"}}
	other := &fakeGit{answers: map[string]string{root + ": " + revParse: "/repo/.git\n", "/elsewhere: " + revParse: "/other/.git\n"}}
	outside := &fakeGit{answers: map[string]string{root + ": " + revParse: "/repo/.git\n"}, fail: map[string]bool{"/elsewhere: " + revParse: true}}

	cases := []struct {
		name   string
		args   []string
		git    *fakeGit
		cwd    string
		denied bool
		err    bool
	}{
		{name: "a read", args: []string{"status"}, git: project, cwd: root},
		{name: "a clone", args: []string{"clone", "x"}, git: project, cwd: root},
		{name: "a push anywhere", args: []string{"push"}, git: other, cwd: "/elsewhere", denied: true},
		{name: "a write here", args: []string{"commit", "-m", "x"}, git: project, cwd: root, denied: true},
		{name: "a write in another repository", args: []string{"commit"}, git: other, cwd: "/elsewhere"},
		{name: "a write outside any repository", args: []string{"commit"}, git: outside, cwd: "/elsewhere"},
		{name: "an unknown option first", args: []string{"--weird", "commit"}, git: other, cwd: "/elsewhere", denied: true},
		{name: "git cannot run", args: []string{"commit"}, git: &fakeGit{err: errGitMissing}, cwd: root, err: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			denial, err := CheckGitExec(context.Background(), tc.args, &GitExecContext{Root: root, RealGit: "/g", Cwd: tc.cwd, Run: tc.git.run})
			if (err != nil) != tc.err || (denial != "") != tc.denied {
				t.Errorf("denial %q, err %v", denial, err)
			}
		})
	}

	allowed := t.TempDir()
	writeTestFile(t, filepath.Join(allowed, manifestFile), "noskills:\n  allowGit: true\n")

	if denial, err := CheckGitExec(context.Background(), []string{"push"}, &GitExecContext{Root: allowed, RealGit: "/g", Cwd: allowed, Run: project.run}); denial != "" || err != nil {
		t.Errorf("allowGit true: %q, %v", denial, err)
	}
}

func TestExportFromEnvFile(t *testing.T) {
	t.Parallel()

	envFile := filepath.Join(t.TempDir(), "env")
	writeTestFile(t, envFile, "export A=1\n")

	for range 2 {
		if err := ExportFromEnvFile(envFile, "/p/.eser/.state/bin"); err != nil {
			t.Fatal(err)
		}
	}

	if got := readTestFile(t, envFile); got != "export A=1\nexport PATH='/p/.eser/.state/bin':\"$PATH\"\n" {
		t.Errorf("env file: %q", got)
	}
}

func TestFileRules(t *testing.T) {
	t.Parallel()

	base := t.TempDir()
	root := filepath.Join(base, "project")
	writeTestFile(t, filepath.Join(base, ".folder-rules.md"), "- outside the project\n")
	writeTestFile(t, filepath.Join(root, ".folder-rules.md"), "# heading\n- root rule\n\n")
	writeTestFile(t, filepath.Join(root, "src", "api", ".folder-rules.md"), "* api rule\nroot rule\n")
	writeTestFile(t, filepath.Join(root, rulesDir, "a.md"), "---\nphases: [EXECUTING]\napplies_to: [\"*.go\", 'src/api']\n---\nGo rule\nsecond line\n")
	writeTestFile(t, filepath.Join(root, rulesDir, "b.txt"), "Every file\n")
	writeTestFile(t, filepath.Join(root, rulesDir, "c.md"), "---\nphases: [DISCOVERY]\napplies_to: [*.go]\n---\nNot now\n")
	writeTestFile(t, filepath.Join(root, rulesDir, "d.json"), "ignored")
	writeTestFile(t, filepath.Join(root, manifestFile), "noskills:\n  concerns: [api-care]\n")
	writeTestFile(t, filepath.Join(root, concernsDir, "api.json"),
		`{"id":"api-care","reminders":["always",{"text":"source files","scope":["api"]},{"text":"ui files","scope":["ui"]}]}`)
	writeTestFile(t, filepath.Join(root, concernsDir, "bad.json"), `{"id":"bad","reminders":[{"text":"x","scope":["nope"]}]}`)

	var warnings []string

	warn := func(path string, _ error) { warnings = append(warnings, filepath.Base(path)) }

	got := FileRules(root, JSObjectOf("classification", nil), "src/api/handler.go", warn)
	want := []string{"Go rule", "(src/api/) api rule", "(src/api/) root rule", "(./) root rule", "api-care: source files"}

	if !slices.Equal(got, want) {
		t.Errorf("FileRules:\n  %q\nwant\n  %q", got, want)
	}

	if !slices.Equal(warnings, []string{"bad.json"}) {
		t.Errorf("warnings %v", warnings)
	}

	if escaped := CollectFolderRules(root, []string{"../x.go", "/abs/y.go"}); slices.ContainsFunc(escaped, func(r FolderRule) bool { return r.Rule == "outside the project" }) {
		t.Errorf("a path out of the project read %v", escaped)
	}
}

func TestReadHookManifest(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		manifest string
		want     HookManifest
		init     bool
	}{
		{name: "missing"},
		{name: "not YAML", manifest: "noskills: [", init: false},
		{name: "no section", manifest: "scripts: {}\n"},
		{name: "an empty section", manifest: "noskills:\n", init: true},
		{name: "a scalar section", manifest: "noskills: 5\n", want: HookManifest{Present: true, Concerns: []string{}, Tools: []string{}}, init: true},
		{name: "two documents", manifest: "noskills:\n  allowGit: true\n---\nx: 1\n"},
		{
			name:     "fields",
			manifest: "noskills:\n  allowGit: \"true\"\n  command: noskills\n  concerns: [a, 1]\n  tools: [codex]\n  maxIterationsBeforeRestart: 0x10\n",
			want:     HookManifest{Present: true, Command: "noskills", Concerns: []string{"a"}, Tools: []string{"codex"}, MaxIterations: 16, HasMaxIterations: true},
			init:     true,
		},
		{
			name: "allowGit true", manifest: "noskills:\n  allowGit: true\n",
			want: HookManifest{Present: true, AllowGit: true, Concerns: []string{}, Tools: []string{}}, init: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			root := t.TempDir()
			if tc.manifest != "" {
				writeTestFile(t, filepath.Join(root, manifestFile), tc.manifest)
			}

			got := ReadHookManifest(root)
			if got.Present != tc.want.Present || got.AllowGit != tc.want.AllowGit || got.Command != tc.want.Command ||
				!slices.Equal(got.Concerns, tc.want.Concerns) || !slices.Equal(got.Tools, tc.want.Tools) ||
				got.MaxIterations != tc.want.MaxIterations || got.HasMaxIterations != tc.want.HasMaxIterations {
				t.Errorf("ReadHookManifest = %+v, want %+v", got, tc.want)
			}

			if IsHookInitialized(root) != tc.init {
				t.Errorf("IsHookInitialized = %v, want %v", !tc.init, tc.init)
			}
		})
	}

	if prefix := (&HookManifest{}).CommandPrefix(); prefix != DefaultCommandPrefix {
		t.Errorf("CommandPrefix without a command = %q", prefix)
	}
}

func TestResolveHookState(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, specsDir, "a", "spec.md"), "x")
	writeTestFile(t, filepath.Join(root, specsDir, "b", "spec.md"), "x")
	writeTestFile(t, filepath.Join(root, specsDir, "c", "spec.md"), "x")
	writeTestFile(t, filepath.Join(root, specStatesDir, "a.json"), `{"phase":"EXECUTING","spec":"a"}`)
	writeTestFile(t, filepath.Join(root, specStatesDir, "c.json"), `{broken`)
	writeTestFile(t, filepath.Join(root, stateFile), `{"phase":"DISCOVERY","spec":"b","discovery":{"userContext":"legacy text"}}`)

	var warned []string

	warn := func(path string, _ error) { warned = append(warned, filepath.Base(path)) }

	for name, want := range map[string]string{
		"a": `{"phase":"EXECUTING","spec":"a"}`,
		"b": `{"phase":"DISCOVERY","spec":"b","discovery":{"userContext":["legacy text"]}}`,
	} {
		got, err := ResolveHookState(root, name, warn)
		if err != nil || got.String() != want {
			t.Errorf("ResolveHookState(%s) = %v, %v; want %s", name, got, err, want)
		}
	}

	got, err := ResolveHookState(root, "c", warn)
	if err != nil || StringField(got, "spec") != "c" || StringField(got, "phase") != PhaseIdle {
		t.Errorf("a corrupt per-spec state: %v, %v", got, err)
	}

	if !slices.Contains(warned, "c.json") {
		t.Errorf("no warning for c.json: %v", warned)
	}

	for _, name := range []string{"missing", "../a", "..", "a/b"} {
		if _, err := ResolveHookState(root, name, warn); !errors.Is(err, ErrSpecNotFound) {
			t.Errorf("ResolveHookState(%q) error %v", name, err)
		}
	}
}

func TestProcessAskUserQuestion(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, stateFile),
		`{"phase":"DISCOVERY","spec":"s","specDescription":"d","discovery":{"answers":[],"mode":"full","premisesCompleted":true,"planPath":null}}`)

	ask := func(question string, at time.Time, token string) {
		input := JSObjectOf("tool_name", "AskUserQuestion", "tool_input", JSObjectOf("question", question))
		ProcessAskUserQuestion(input, root, at, token, nil)
	}

	ask("What does the user do today without this feature?", fixedNow(), "aaaaaaaa")
	ask("How do you verify this works correctly?", fixedNow().Add(time.Minute), "bbbbbbbb")

	got := readTestFile(t, AskTokenFile(root))
	if !strings.Contains(got, `"token":"bbbbbbbb"`) || !strings.Contains(got, `"stepId":"status_quo","match":"exact"`) ||
		!strings.Contains(got, `"stepId":"verification","match":"exact"`) {
		t.Errorf("token %s", got)
	}

	// A token older than the TTL is not extended.
	ask("Describe the 1-star and 10-star versions.", fixedNow().Add(AskTokenTTL+time.Hour), "cccccccc")

	if got := readTestFile(t, AskTokenFile(root)); strings.Contains(got, "status_quo") || !strings.Contains(got, "ambition") {
		t.Errorf("stale token extended: %s", got)
	}

	other := JSObjectOf("tool_name", "Bash", "tool_input", JSObjectOf("question", "x"))
	ProcessAskUserQuestion(other, root, fixedNow(), "dddddddd", nil)

	if got := readTestFile(t, AskTokenFile(root)); strings.Contains(got, "dddddddd") {
		t.Errorf("another tool wrote a token: %s", got)
	}
}

func TestParseYAMLCore(t *testing.T) {
	t.Parallel()

	value, err := parseYAMLCore("a: 012\nb: 0o17\nc: .inf\nd: ~\ne: 'x'\nf: [1, true, null]\n1: one\n<<: merge\n")
	if err != nil {
		t.Fatal(err)
	}

	if got := jsonStringify(value); got != `{"1":"one","a":12,"b":15,"c":null,"d":null,"e":"x","f":[1,true,null],"<<":"merge"}` {
		t.Errorf("parsed %s", got)
	}

	for _, text := range []string{"a: 1\n---\nb: 2\n", "a: 1\na: 2\n", "? [x]\n: y\n", "a: [\n"} {
		if _, err := parseYAMLCore(text); err == nil {
			t.Errorf("%q parsed", text)
		}
	}

	if value, err := parseYAMLCore(""); value != nil || err != nil {
		t.Errorf("empty text: %v, %v", value, err)
	}
}

func TestJSTextHelpers(t *testing.T) {
	t.Parallel()

	if got := jsTrim("\u00a0\ufeff x \u3000"); got != "x" {
		t.Errorf("jsTrim %q", got)
	}

	if got := jsToLower("İSTANBUL ΟΔΟΣ ΣΑΣ."); got != "i\u0307stanbul οδος σας." {
		t.Errorf("jsToLower %q", got)
	}

	if got := jsSplitWhitespace(""); !slices.Equal(got, []string{""}) {
		t.Errorf("split of empty %q", got)
	}

	if got := jsLength("a𝒜"); got != 3 {
		t.Errorf("jsLength %d", got)
	}

	var b bytes.Buffer

	writeJSONString(&b, "\u0000\u001f")

	if b.String() != `"\u0000\u001f"` {
		t.Errorf("control characters %s", b.String())
	}
}
