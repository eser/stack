// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package golden is the noskills golden harness (TASK-256, M4-T1). Each
// scenario runs noskills commands in a fresh fixture project and records, per
// step, the exit code, stdout and every file the project holds afterwards.
//
// Recording runs the TypeScript CLI and writes testdata/golden (all
// scenarios, or the comma-separated NOSKILLS_GOLDEN_SCENARIOS):
//
//	NOSKILLS_GOLDEN_RECORD=1 go test ./pkg/ajan/noskillsfx/golden/
//
// Replay builds cmd/noskills and compares it with the recordings, from each
// scenario's first step that runs in Go (TASK-257 ported the hooks,
// TASK-258 the lifecycle, TASK-259 purge, restore, the state commands and
// sync). The recordings are also checked for being complete.
package golden

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"maps"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"
)

const repoRoot = "../../../.."

// step is one noskills invocation. Write holds files the step writes into
// the project before the command runs, and Env extra environment for it;
// <PROJECT> and <HOME> in Args, Stdin, Write and Env stand for the fixture's
// directories. Stderr records the command's stderr too.
type step struct {
	Args   []string          `json:"args"`
	Stdin  string            `json:"stdin,omitempty"`
	Write  map[string]string `json:"write,omitempty"`
	Env    map[string]string `json:"env,omitempty"`
	Stderr bool              `json:"stderr,omitempty"`
	// Before changes the project before the command runs, after Write, for
	// a state no command reaches (the same change in the recording and the
	// replay).
	Before func(t *testing.T, project string) `json:"-"`
}

// scenario is a sequence of steps in one fixture project. The replay runs
// the steps from nativeFrom on cmd/noskills; the ones before it belong to
// portedBy and are seeded from the recording. A delta scenario's recording
// holds, per step, only the files that step added or changed and the ones
// it removed, which keeps a long scenario's recording small.
type scenario struct {
	name       string
	setup      func(t *testing.T, project string)
	steps      []step
	nativeFrom int
	portedBy   string
	delta      bool
}

// recorded is the golden of one step. Files is every file of the project
// after the step; in a delta recording on disk it holds the changed files
// only, and Removed the files the step deleted.
type recorded struct {
	Args     []string          `json:"args"`
	ExitCode int               `json:"exitCode"`
	Stdout   string            `json:"stdout"`
	Stderr   string            `json:"stderr,omitempty"`
	Files    map[string]string `json:"files"`
	Removed  []string          `json:"removed,omitempty"`
}

// toDelta keeps, in each step, the files that differ from the step before.
func toDelta(steps []recorded) []recorded {
	out := make([]recorded, len(steps))
	previous := map[string]string{}

	for i, st := range steps {
		changed := map[string]string{}

		for path, content := range st.Files {
			if old, ok := previous[path]; !ok || old != content {
				changed[path] = content
			}
		}

		var removed []string

		for path := range previous {
			if _, ok := st.Files[path]; !ok {
				removed = append(removed, path)
			}
		}

		slices.Sort(removed)

		out[i] = st
		out[i].Files = changed
		out[i].Removed = removed
		previous = st.Files
	}

	return out
}

// fromDelta rebuilds the full snapshot of every step.
func fromDelta(steps []recorded) []recorded {
	out := make([]recorded, len(steps))
	current := map[string]string{}

	for i, st := range steps {
		next := maps.Clone(current)
		maps.Copy(next, st.Files)

		for _, path := range st.Removed {
			delete(next, path)
		}

		out[i] = st
		out[i].Files = next
		out[i].Removed = nil
		current = next
	}

	return out
}

var (
	fileTime  = regexp.MustCompile(`\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z`)                           //nolint:gochecknoglobals
	isoTime   = regexp.MustCompile(`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?`) //nolint:gochecknoglobals
	isoDate   = regexp.MustCompile(`\b\d{4}-\d{2}-\d{2}(\D|$)`)                                            //nolint:gochecknoglobals
	uuid      = regexp.MustCompile(`\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b`)     //nolint:gochecknoglobals
	epochMs   = regexp.MustCompile(`\b1[6-9]\d{11}\b`)                                                     //nolint:gochecknoglobals
	ansiEsc   = regexp.MustCompile("\x1b\\[[0-9;]*[A-Za-z]")                                               //nolint:gochecknoglobals
	gitObject = regexp.MustCompile(`\b[0-9a-f]{40}\b`)                                                     //nolint:gochecknoglobals
	askToken  = regexp.MustCompile(`"token":"[0-9a-f]{8}"`)                                                //nolint:gochecknoglobals
	// The stored validator result's key hashes the spec document, which
	// holds the date.
	validationKey = regexp.MustCompile(`"key": "[0-9a-f]{64}"`) //nolint:gochecknoglobals
)

// normalize replaces what differs between runs and machines with placeholders.
func normalize(text string, replacements map[string]string) string {
	keys := make([]string, 0, len(replacements))
	for key := range replacements {
		keys = append(keys, key)
	}

	// Longer paths first, so a project path inside the home is replaced whole.
	slices.SortFunc(keys, func(a, b string) int { return len(b) - len(a) })

	for _, key := range keys {
		text = strings.ReplaceAll(text, key, replacements[key])
	}

	text = ansiEsc.ReplaceAllString(text, "")
	text = fileTime.ReplaceAllString(text, "<TIME_ID>")
	text = isoTime.ReplaceAllString(text, "<TIME>")
	text = isoDate.ReplaceAllString(text, "<DATE>$1")
	text = uuid.ReplaceAllString(text, "<UUID>")
	text = gitObject.ReplaceAllString(text, "<SHA>")
	text = askToken.ReplaceAllString(text, `"token":"<TOKEN>"`)
	text = validationKey.ReplaceAllString(text, `"key": "<KEY>"`)

	return epochMs.ReplaceAllString(text, "<EPOCH_MS>")
}

// pathForms returns a directory as given and with symlinks resolved (macOS
// temp dirs live under /private).
func pathForms(dir string) []string {
	forms := []string{dir}
	if resolved, err := filepath.EvalSymlinks(dir); err == nil && resolved != dir {
		forms = append(forms, resolved)
	}

	return forms
}

// snapshot reads every file of the project except .git, normalized.
func snapshot(t *testing.T, project string, replacements map[string]string) map[string]string {
	t.Helper()

	files := map[string]string{}

	err := filepath.WalkDir(project, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		rel, _ := filepath.Rel(project, path)
		if entry.IsDir() && rel == ".git" {
			return filepath.SkipDir
		}

		if entry.IsDir() {
			return nil
		}

		data, err := os.ReadFile(path) //nolint:gosec // G304: a file of the test's own fixture
		if err != nil {
			return err
		}

		files[filepath.ToSlash(normalize(rel, replacements))] = normalize(string(data), replacements)

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	return files
}

// run is how a scenario runs: the command line prefix, the first step to
// run, the files to seed the project with first, and extra environment.
type run struct {
	prefix []string
	from   int
	seed   map[string]string
	env    []string
}

// placeholderValues stand in for the normalized parts of a recording when
// it seeds a project; each normalizes back to its placeholder.
func placeholderValues(project, home string) *strings.Replacer {
	return strings.NewReplacer(
		"<PROJECT>", project,
		"<HOME>", home,
		"<TIME_ID>", "2026-01-01T00-00-00-000Z",
		"<TIME>", "2026-01-01T00:00:00.000Z",
		"<DATE>", "2026-01-01",
		"<UUID>", "00000000-0000-4000-8000-000000000000",
		"<SHA>", strings.Repeat("0", 40),
		"<EPOCH_MS>", "1767225600000",
		`"token":"<TOKEN>"`, `"token":"00000000"`,
		`"key": "<KEY>"`, `"key": "`+strings.Repeat("0", 64)+`"`,
	)
}

func writeProjectFile(t *testing.T, project, rel, content string) {
	t.Helper()

	path := filepath.Join(project, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}

	mode := os.FileMode(0o644)
	if strings.HasPrefix(rel, ".eser/.state/bin/") {
		mode = 0o755
	}

	if err := os.WriteFile(path, []byte(content), mode); err != nil {
		t.Fatal(err)
	}
}

// runScenario runs sc as r says and returns the goldens of the steps run.
func runScenario(t *testing.T, sc *scenario, r run) []recorded { //nolint:funlen // the fixture, then one loop over the steps
	t.Helper()

	base := t.TempDir()
	project := filepath.Join(base, "project")
	home := filepath.Join(base, "home")

	for _, dir := range []string{project, home} {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			t.Fatal(err)
		}
	}

	if err := os.WriteFile(filepath.Join(project, "package.json"), []byte(`{"name":"fixture","version":"1.0.0"}`+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	gitInit := exec.Command("git", "init", "-q", "-b", "main", project) //nolint:noctx
	if out, err := gitInit.CombinedOutput(); err != nil {
		t.Fatalf("git init: %v: %s", err, out)
	}

	if sc.setup != nil {
		sc.setup(t, project)
	}

	fill := placeholderValues(project, home)

	for rel, content := range r.seed {
		writeProjectFile(t, project, rel, fill.Replace(content))
	}

	replacements := map[string]string{}
	for _, form := range pathForms(project) {
		replacements[form] = "<PROJECT>"
	}

	for _, form := range pathForms(home) {
		replacements[form] = "<HOME>"
	}

	// The recordings name /usr/bin/git as the git the wrapper calls, and the
	// wrapper takes the first git on PATH, which a git hook moves to its own
	// exec path, so the standard directories come first.
	env := append([]string{
		"HOME=" + home,
		"PATH=/usr/bin:/bin:" + os.Getenv("PATH"),
		"NO_COLOR=1",
		"TERM=dumb",
		"GIT_AUTHOR_NAME=Golden", "GIT_AUTHOR_EMAIL=golden@example.com",
		"GIT_COMMITTER_NAME=Golden", "GIT_COMMITTER_EMAIL=golden@example.com",
	}, r.env...)

	out := make([]recorded, 0, len(sc.steps))

	for _, st := range sc.steps[r.from:] {
		for rel, content := range st.Write {
			writeProjectFile(t, project, rel, fill.Replace(content))
		}

		if st.Before != nil {
			st.Before(t, project)
		}

		args := make([]string, len(st.Args))
		for i, arg := range st.Args {
			args[i] = fill.Replace(arg)
		}

		stepEnv := slices.Clone(env)
		for key, value := range st.Env {
			stepEnv = append(stepEnv, key+"="+fill.Replace(value))
		}

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)

		cmd := exec.CommandContext(ctx, r.prefix[0], append(slices.Clone(r.prefix[1:]), args...)...) //nolint:gosec // G204: the harness's own command lines
		cmd.Dir = project
		cmd.Env = stepEnv
		cmd.Stdin = strings.NewReader(fill.Replace(st.Stdin))

		var stdout, stderr bytes.Buffer

		cmd.Stdout = &stdout
		cmd.Stderr = &stderr

		err := cmd.Run()

		cancel()

		code := 0

		var exitErr *exec.ExitError

		switch {
		case errors.As(err, &exitErr):
			code = exitErr.ExitCode()
		case err != nil:
			t.Fatalf("%s %v: %v", sc.name, st.Args, err)
		}

		addSessionIDs(t, project, replacements)

		step := recorded{
			Args:     st.Args,
			ExitCode: code,
			Stdout:   normalize(stdout.String(), replacements),
			Stderr:   "",
			Files:    snapshot(t, project, replacements),
		}

		if st.Stderr {
			step.Stderr = normalize(stderr.String(), replacements)
		}

		out = append(out, step)
	}

	return out
}

func goldenPath(name string) string {
	return filepath.Join("testdata", "golden", name+".json")
}

// readGolden reads a scenario's recording, with full snapshots.
func readGolden(t *testing.T, sc *scenario) []recorded {
	t.Helper()

	data, err := readRecording(sc.name)
	if err != nil {
		t.Fatalf("no recording for %s: %v (record with NOSKILLS_GOLDEN_RECORD=1)", sc.name, err)
	}

	var steps []recorded
	if err := json.Unmarshal(data, &steps); err != nil {
		t.Fatalf("%s: %v", goldenPath(sc.name), err)
	}

	if sc.delta {
		return fromDelta(steps)
	}

	return steps
}

// recordedScenarios are the scenarios NOSKILLS_GOLDEN_SCENARIOS names
// (comma-separated), or all of them.
func recordedScenarios() []scenario {
	names := strings.Split(os.Getenv("NOSKILLS_GOLDEN_SCENARIOS"), ",")
	if len(names) == 1 && names[0] == "" {
		return scenarios()
	}

	var picked []scenario

	for _, sc := range scenarios() {
		if slices.Contains(names, sc.name) {
			picked = append(picked, sc)
		}
	}

	return picked
}

// TestRecord records the TypeScript CLI's behavior when
// NOSKILLS_GOLDEN_RECORD=1; NOSKILLS_GOLDEN_SCENARIOS limits it to some
// scenarios.
func TestRecord(t *testing.T) {
	if os.Getenv("NOSKILLS_GOLDEN_RECORD") != "1" {
		t.Skip("set NOSKILLS_GOLDEN_RECORD=1 to record the TypeScript CLI")
	}

	node, err := exec.LookPath("node")
	if err != nil {
		t.Fatal("recording needs node")
	}

	mainTS, err := filepath.Abs(filepath.Join(repoRoot, "pkg/@eserstack/noskills/main.ts"))
	if err != nil {
		t.Fatal(err)
	}

	ts := run{prefix: []string{node, "--disable-warning=ExperimentalWarning", mainTS}, from: 0, seed: nil, env: nil}

	for _, sc := range recordedScenarios() {
		steps := runScenario(t, &sc, ts)

		// A second run must give the same recording, or the scenario holds
		// something the normalization misses.
		if again := runScenario(t, &sc, ts); !equalRecordings(steps, again) {
			if dir := os.Getenv("NOSKILLS_GOLDEN_DEBUG_DIR"); dir != "" {
				first, _ := json.MarshalIndent(steps, "", "  ")
				second, _ := json.MarshalIndent(again, "", "  ")
				_ = os.WriteFile(filepath.Join(dir, sc.name+".1.json"), first, 0o600)  //nolint:gosec // G703: a debug dir the developer names
				_ = os.WriteFile(filepath.Join(dir, sc.name+".2.json"), second, 0o600) //nolint:gosec // G703: a debug dir the developer names
			}

			t.Fatalf("%s: two TypeScript runs differ; extend normalize()", sc.name)
		}

		stored := steps
		if sc.delta {
			stored = toDelta(steps)
		}

		data, err := json.MarshalIndent(stored, "", "  ")
		if err != nil {
			t.Fatal(err)
		}

		if err := os.MkdirAll(filepath.Dir(goldenPath(sc.name)), 0o750); err != nil {
			t.Fatal(err)
		}

		if err := writeRecording(sc.name, append(data, '\n')); err != nil {
			t.Fatal(err)
		}
	}
}

// maxPlainRecording is the size above which a recording is kept gzipped
// (name.json.gz), under the repository's 1 MB limit for one file
// (validate-large-files). The comparison is the same either way.
const maxPlainRecording = 900 << 10

func readRecording(name string) ([]byte, error) {
	path := goldenPath(name)

	data, err := os.ReadFile(path) //nolint:gosec // G304: the test's own fixture
	if !errors.Is(err, os.ErrNotExist) {
		return data, err //nolint:wrapcheck
	}

	compressed, err := os.ReadFile(path + ".gz") //nolint:gosec // G304: the test's own fixture
	if err != nil {
		return nil, err //nolint:wrapcheck
	}

	reader, err := gzip.NewReader(bytes.NewReader(compressed))
	if err != nil {
		return nil, err //nolint:wrapcheck
	}

	return io.ReadAll(reader) //nolint:wrapcheck
}

// writeRecording writes name.json, or name.json.gz when it is larger than
// maxPlainRecording, and removes the other form.
func writeRecording(name string, data []byte) error {
	path := goldenPath(name)

	if len(data) <= maxPlainRecording {
		_ = os.Remove(path + ".gz")

		return os.WriteFile(path, data, 0o600) //nolint:wrapcheck
	}

	var buf bytes.Buffer

	writer, err := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	if err != nil {
		return err //nolint:wrapcheck
	}

	writer.ModTime = time.Time{} // the same recording gives the same bytes

	if _, err := writer.Write(data); err != nil {
		return err //nolint:wrapcheck
	}

	if err := writer.Close(); err != nil {
		return err //nolint:wrapcheck
	}

	_ = os.Remove(path)

	return os.WriteFile(path+".gz", buf.Bytes(), 0o600) //nolint:wrapcheck
}

func equalRecordings(a, b []recorded) bool {
	left, _ := json.Marshal(a)
	right, _ := json.Marshal(b)

	return bytes.Equal(left, right)
}

// TestRecordingsComplete checks that every scenario has a recording with one
// golden per step, so the replay cannot pass vacuously.
func TestRecordingsComplete(t *testing.T) {
	t.Parallel()

	for _, sc := range scenarios() {
		steps := readGolden(t, &sc)
		if len(steps) != len(sc.steps) {
			t.Errorf("%s: %d recorded steps, %d defined; record again", sc.name, len(steps), len(sc.steps))
		}

		for i, st := range steps {
			if i < len(sc.steps) && !slices.Equal(st.Args, sc.steps[i].Args) {
				t.Errorf("%s step %d: recorded %v, defined %v; record again", sc.name, i, st.Args, sc.steps[i].Args)
			}
		}

		if sc.nativeFrom < 0 || sc.nativeFrom > len(sc.steps) {
			t.Errorf("%s: nativeFrom %d is outside 0..%d", sc.name, sc.nativeFrom, len(sc.steps))
		}
	}
}

// TestReplay runs the scenarios against cmd/noskills and compares each step
// it runs with the TypeScript recording. The steps before a scenario's
// nativeFrom are not ported yet: the project starts as the recording of the
// step before nativeFrom left it. NOSKILLS_NO_FORWARD=1 keeps cmd/noskills
// from handing a step to the TypeScript CLI, so every step compared ran in
// Go.
func TestReplay(t *testing.T) {
	t.Parallel()

	binary := filepath.Join(t.TempDir(), "noskills")

	build := exec.Command("go", "build", "-o", binary, "./cmd/noskills") //nolint:noctx
	build.Dir = repoRoot

	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build cmd/noskills: %v: %s", err, out)
	}

	for _, sc := range scenarios() {
		t.Run(sc.name, func(t *testing.T) {
			t.Parallel()

			if sc.nativeFrom >= len(sc.steps) {
				t.Skipf("no step of %s runs in Go yet; %s ports them", sc.name, sc.portedBy)
			}

			want := readGolden(t, &sc)

			var seed map[string]string
			if sc.nativeFrom > 0 {
				seed = want[sc.nativeFrom-1].Files
			}

			env := []string{"NOSKILLS_NO_FORWARD=1"}

			got := runScenario(t, &sc, run{
				prefix: []string{binary},
				from:   sc.nativeFrom,
				seed:   seed,
				env:    env,
			})

			for i := range got {
				compareStep(t, sc.name, sc.nativeFrom+i, &want[sc.nativeFrom+i], &got[i])
			}
		})
	}
}

func compareStep(t *testing.T, name string, i int, want, got *recorded) {
	t.Helper()

	label := fmt.Sprintf("%s step %d %v", name, i, want.Args)

	if got.ExitCode != want.ExitCode {
		t.Errorf("%s: exit code %d, want %d", label, got.ExitCode, want.ExitCode)
	}

	if got.Stdout != want.Stdout {
		t.Errorf("%s: stdout differs:\n--- want\n%s\n--- got\n%s", label, want.Stdout, got.Stdout)
	}

	if got.Stderr != want.Stderr {
		t.Errorf("%s: stderr differs:\n--- want\n%s\n--- got\n%s", label, want.Stderr, got.Stderr)
	}

	for path, content := range want.Files {
		if got.Files[path] != content {
			t.Errorf("%s: %s differs:\n--- want\n%s\n--- got\n%s", label, path, content, got.Files[path])
		}
	}

	for path := range got.Files {
		if _, ok := want.Files[path]; !ok {
			t.Errorf("%s: unexpected file %s", label, path)
		}
	}
}
