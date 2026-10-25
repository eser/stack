// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

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

var errNotFound = errors.New("executable file not found in $PATH")

// processCall is one program the CLI started.
type processCall struct {
	name    string
	args    []string
	environ []string
}

// testEnv is an env on buffers, a map environment and recorded processes.
type testEnv struct {
	*env

	stdout, stderr *bytes.Buffer
	vars           map[string]string
	paths          map[string]string

	mu    sync.Mutex
	calls []processCall
	exit  int
}

func newTestEnv(t *testing.T, cwd string) *testEnv {
	t.Helper()

	self := filepath.Join(t.TempDir(), "noskills")
	if err := os.WriteFile(self, []byte("binary"), 0o755); err != nil { //nolint:gosec // G306: stands in for the binary
		t.Fatal(err)
	}

	te := &testEnv{
		stdout: &bytes.Buffer{}, stderr: &bytes.Buffer{},
		vars: map[string]string{}, paths: map[string]string{},
		mu: sync.Mutex{}, calls: nil, exit: 0,
		env: nil,
	}

	te.env = &env{
		stdin:  strings.NewReader(""),
		stdout: te.stdout,
		stderr: te.stderr,
		getenv: func(key string) string { return te.vars[key] },
		lookupEnv: func(key string) (string, bool) {
			v, ok := te.vars[key]

			return v, ok
		},
		environ: func() []string { return []string{"KEEP=1"} },
		lookPath: func(file string) (string, error) {
			if p, ok := te.paths[file]; ok {
				return p, nil
			}

			return "", errNotFound
		},
		executable:  func() (string, error) { return self, nil },
		cwd:         cwd,
		goos:        "darwin",
		version:     "4.5.2",
		now:         func() time.Time { return time.Date(2026, 10, 25, 12, 0, 0, 0, time.UTC) },
		randomToken: func() (string, error) { return "0123abcd", nil },
		isAlive:     func(int) bool { return false },
		runGit: func(_ context.Context, _ string, args []string, dir string) (string, bool, error) {
			if slices.Contains(args, "rev-parse") {
				return filepath.Join(dir, ".git") + "\n", true, nil
			}

			return "", true, nil
		},
		runProcess: func(_ context.Context, _ *env, name string, args, environ []string, _ string) (int, error) {
			te.mu.Lock()
			defer te.mu.Unlock()

			te.calls = append(te.calls, processCall{name: name, args: args, environ: environ})

			return te.exit, nil
		},
	}

	return te
}

func (te *testEnv) self(t *testing.T) string {
	t.Helper()

	path, err := te.executable()
	if err != nil {
		t.Fatal(err)
	}

	return path
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

// initializedProject is a project with a noskills manifest and a state.
func initializedProject(t *testing.T, phase string) string {
	t.Helper()

	root := t.TempDir()
	writeFile(t, filepath.Join(root, ".eser", "manifest.yml"),
		"noskills:\n  concerns: []\n  tools:\n    - claude-code\n  allowGit: false\n  command: noskills\n")
	writeFile(t, filepath.Join(root, ".eser", ".state", "progresses", "state.json"),
		`{"phase":"`+phase+`","spec":null,"branch":null,"execution":{"iteration":0,"lastProgress":null},"lastCalledAt":null}`)

	return root
}

func TestVersionAndHelp(t *testing.T) {
	t.Parallel()

	te := newTestEnv(t, t.TempDir())

	if code := run(context.Background(), te.env, []string{"version"}); code != 0 || te.stdout.String() != "noskills 4.5.2\n" {
		t.Errorf("version: %d %q", code, te.stdout)
	}

	te.stdout.Reset()

	if code := run(context.Background(), te.env, []string{"version", "--json"}); code != 0 || !strings.Contains(te.stdout.String(), `"runtime": "go"`) {
		t.Errorf("version --json: %d %q", code, te.stdout)
	}

	te.stdout.Reset()

	if code := run(context.Background(), te.env, []string{"--help"}); code != 0 ||
		!strings.Contains(te.stdout.String(), "invoke-hook") || !strings.Contains(te.stdout.String(), "Initialize noskills in project") {
		t.Errorf("--help: %d %q", code, te.stdout)
	}

	if len(te.calls) != 0 {
		t.Errorf("help ran %v", te.calls)
	}
}

func TestForwardFindsTheTypeScriptCLI(t *testing.T) {
	t.Parallel()

	pluginDir := t.TempDir()
	writeFile(t, filepath.Join(pluginDir, "noskills"), "#!/bin/sh\n")

	if err := os.Chmod(filepath.Join(pluginDir, "noskills"), 0o755); err != nil { //nolint:gosec // G302: a fake bin must be executable
		t.Fatal(err)
	}

	cases := []struct {
		name    string
		vars    map[string]string
		paths   map[string]string
		version string
		program string
		args    []string
		code    int
		stderr  string
	}{
		{
			name: "NOSKILLS_TS_CLI first", vars: map[string]string{envTSCLI: " node  /repo/main.ts ", envPlugin: pluginDir},
			paths: map[string]string{"npx": "/bin/npx"}, program: "node", args: []string{"/repo/main.ts", "manager", "list"},
		},
		{name: "the eser plugin path", vars: map[string]string{envPlugin: ":" + pluginDir}, program: filepath.Join(pluginDir, "noskills"), args: []string{"manager", "list"}},
		{name: "npx with the version", paths: map[string]string{"npx": "/bin/npx"}, version: "4.5.2", program: "/bin/npx", args: []string{"--yes", "noskills@4.5.2", "manager", "list"}},
		{name: "npx for a dev build", paths: map[string]string{"npx": "/bin/npx"}, version: "dev", program: "/bin/npx", args: []string{"--yes", "noskills", "manager", "list"}},
		{name: "nothing found", code: 1, stderr: "set NOSKILLS_TS_CLI"},
		{name: "forwarding off", vars: map[string]string{envNoForward: "1", envTSCLI: "node x"}, code: 1, stderr: "NOSKILLS_NO_FORWARD is set"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			te := newTestEnv(t, t.TempDir())
			te.vars = tc.vars
			te.paths = tc.paths

			if te.vars == nil {
				te.vars = map[string]string{}
			}

			if te.paths == nil {
				te.paths = map[string]string{}
			}

			if tc.version != "" {
				te.version = tc.version
			}

			code := run(context.Background(), te.env, []string{"manager", "list"})
			if code != tc.code || !strings.Contains(te.stderr.String(), tc.stderr) {
				t.Fatalf("exit %d, stderr %q", code, te.stderr)
			}

			if tc.program == "" {
				if len(te.calls) != 0 {
					t.Errorf("ran %v", te.calls)
				}

				return
			}

			if len(te.calls) != 1 || te.calls[0].name != tc.program || !slices.Equal(te.calls[0].args, tc.args) {
				t.Errorf("ran %+v, want %s %v", te.calls, tc.program, tc.args)
			}
		})
	}
}

func TestForwardSkipsThisBinaryOnThePluginPath(t *testing.T) {
	t.Parallel()

	te := newTestEnv(t, t.TempDir())
	te.vars[envPlugin] = filepath.Dir(te.self(t))
	te.paths["npx"] = "/bin/npx"

	run(context.Background(), te.env, []string{"manager"})

	if len(te.calls) != 1 || te.calls[0].name != "/bin/npx" {
		t.Errorf("ran %+v", te.calls)
	}
}

func TestForwardNamesThisBinary(t *testing.T) {
	t.Parallel()

	spaced := filepath.Join(t.TempDir(), "my bin", "noskills")
	writeFile(t, spaced, "binary")

	cases := []struct {
		name string
		self string
		path bool
		set  string
		want string
	}{
		{name: "on PATH", path: true, want: envCLIPrefix + "=noskills"},
		{name: "off PATH", want: envCLIPrefix + "="},
		{name: "a path that needs quotes", self: spaced, want: envCLIPrefix + "='"},
		{name: "the user's own value", set: "pnpm cli noskills", want: "KEEP=1"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			te := newTestEnv(t, t.TempDir())
			te.vars[envTSCLI] = "node main.ts"

			self := te.self(t)
			if tc.self != "" {
				self = tc.self
				te.executable = func() (string, error) { return self, nil }
			}

			if tc.path {
				te.paths["noskills"] = self
			}

			if tc.set != "" {
				te.vars[envCLIPrefix] = tc.set
			}

			run(context.Background(), te.env, []string{"manager"})

			environ := te.calls[0].environ
			if !slices.ContainsFunc(environ, func(v string) bool { return strings.HasPrefix(v, tc.want) }) {
				t.Errorf("environment %v has no %q", environ, tc.want)
			}

			if tc.set != "" && slices.ContainsFunc(environ, func(v string) bool { return strings.HasPrefix(v, envCLIPrefix) }) {
				t.Errorf("overrode the user's %s: %v", envCLIPrefix, environ)
			}

			resolved, err := filepath.EvalSymlinks(self)
			if err != nil {
				t.Fatal(err)
			}

			if !tc.path && tc.self == "" && tc.set == "" && !slices.Contains(environ, envCLIPrefix+"="+resolved) {
				t.Errorf("environment %v does not name %s", environ, resolved)
			}
		})
	}
}

func TestRunForwardsWhatGoDoesNotAnswer(t *testing.T) {
	t.Parallel()

	for _, args := range [][]string{
		{"nonsense", "x"}, {"--spec=a", "next"}, {"-o", "json", "status"},
		{"watch"}, {"manager"}, {"mgr", "--spec=a"}, {"web", "--port=8080"},
	} {
		te := newTestEnv(t, t.TempDir())
		te.vars[envTSCLI] = "node main.ts"
		te.exit = 7

		if code := run(context.Background(), te.env, args); code != 7 {
			t.Errorf("%v: exit %d", args, code)
		}

		if len(te.calls) != 1 || !slices.Equal(te.calls[0].args[1:], args) {
			t.Errorf("%v: ran %+v", args, te.calls)
		}
	}
}

func runHook(t *testing.T, te *testEnv, stdin string, args ...string) int {
	t.Helper()

	te.stdin = strings.NewReader(stdin)

	return run(context.Background(), te.env, append([]string{"invoke-hook"}, args...))
}

func TestPreToolUse(t *testing.T) {
	t.Parallel()

	root := initializedProject(t, "IDLE")
	te := newTestEnv(t, root)

	code := runHook(t, te, `{"tool_name":"Bash","tool_input":{"command":"git push"}}`, "pre-tool-use")
	if code != 2 || !strings.Contains(te.stdout.String(), `"permissionDecision":"deny"`) ||
		!strings.HasPrefix(te.stderr.String(), "noskills: Git write operations are not allowed.") {
		t.Errorf("deny: %d %q %q", code, te.stdout, te.stderr)
	}

	te.stdout.Reset()
	te.stderr.Reset()

	if code := runHook(t, te, `{"tool_name":"Write","tool_input":{"file_path":"a.ts","content":"x"}}`, "pre-tool-use"); code != 0 || te.stdout.Len() != 0 {
		t.Errorf("allow: %d %q", code, te.stdout)
	}

	if code := runHook(t, te, "", "unknown-event"); code != 0 || te.stdout.Len() != 0 {
		t.Errorf("unknown event: %d %q", code, te.stdout)
	}

	if code := runHook(t, te, ""); code != 0 {
		t.Errorf("no event: %d", code)
	}
}

func TestSessionStart(t *testing.T) {
	t.Parallel()

	root := initializedProject(t, "IDLE")
	envFile := filepath.Join(t.TempDir(), "claude-env")
	gitDir := t.TempDir()
	writeFile(t, filepath.Join(gitDir, "git"), "#!/bin/sh\n")

	if err := os.Chmod(filepath.Join(gitDir, "git"), 0o755); err != nil { //nolint:gosec // G302: a fake git must be executable
		t.Fatal(err)
	}

	te := newTestEnv(t, root)
	te.vars["PATH"] = gitDir
	te.vars["CLAUDE_ENV_FILE"] = envFile

	if code := runHook(t, te, "", "session-start", "--tool=copilot-cli"); code != 0 {
		t.Fatalf("exit %d: %s", code, te.stderr)
	}

	if out := te.stdout.String(); !strings.HasPrefix(out, `{"additionalContext":"[noskills] The current noskills state`) ||
		!strings.Contains(out, `noskills spec new`) {
		t.Errorf("stdout %q", out)
	}

	script, err := os.ReadFile(filepath.Join(root, ".eser", ".state", "bin", "git")) //nolint:gosec // G304: the test's project
	if err != nil || !strings.Contains(string(script), " noskills invoke-hook git-exec ") {
		t.Errorf("wrapper: %v", err)
	}

	if exported, _ := os.ReadFile(envFile); !strings.Contains(string(exported), ".eser/.state/bin") { //nolint:gosec // G304: the test's env file
		t.Errorf("env file %q", exported)
	}

	if len(te.calls) != 0 {
		t.Errorf("an IDLE project was forwarded: %v", te.calls)
	}
}

func TestSessionStartCompilesEveryPhase(t *testing.T) {
	t.Parallel()

	root := initializedProject(t, "EXECUTING")
	gitDir := t.TempDir()
	writeFile(t, filepath.Join(gitDir, "git"), "#!/bin/sh\n")

	if err := os.Chmod(filepath.Join(gitDir, "git"), 0o755); err != nil { //nolint:gosec // G302: a fake git must be executable
		t.Fatal(err)
	}

	te := newTestEnv(t, root)
	te.vars[envNoForward] = "1"
	te.vars["PATH"] = gitDir

	if code := runHook(t, te, "", "session-start", "--tool=copilot-cli"); code != 0 {
		t.Fatalf("exit %d: %s", code, te.stderr)
	}

	if out := te.stdout.String(); !strings.HasPrefix(out, `{"additionalContext":"[noskills] The current noskills state`) ||
		!strings.Contains(out, `\"phase\":\"EXECUTING\"`) {
		t.Errorf("stdout %q", out)
	}

	if len(te.calls) != 0 {
		t.Errorf("the hook was forwarded: %v", te.calls)
	}

	if _, err := os.Stat(filepath.Join(root, ".eser", ".state", "bin", "git")); err != nil {
		t.Errorf("no wrapper: %v", err)
	}

	uninitialized := newTestEnv(t, t.TempDir())
	if code := runHook(t, uninitialized, "", "session-start"); code != 0 || uninitialized.stdout.Len() != 0 || len(uninitialized.calls) != 0 {
		t.Errorf("an uninitialized project: %d %q %v", code, uninitialized.stdout, uninitialized.calls)
	}
}

func TestGitExec(t *testing.T) {
	t.Parallel()

	root := initializedProject(t, "IDLE")

	cases := []struct {
		name string
		args []string
		vars map[string]string
		git  func(context.Context, string, []string, string) (string, bool, error)
		code int
	}{
		{name: "a read", args: []string{"status"}, code: 0},
		{name: "a push", args: []string{"push"}, code: 3},
		{name: "a write here", args: []string{"commit", "-m", "x"}, code: 3},
		{
			name: "a write in another repository", args: []string{"commit"}, vars: map[string]string{"NOSKILLS_GIT_CWD": "/other"},
			code: 0,
		},
		{
			name: "git cannot run", args: []string{"commit"}, code: 1,
			git: func(context.Context, string, []string, string) (string, bool, error) { return "", false, errNotFound },
		},
		{name: "no git on PATH", args: []string{"commit"}, vars: map[string]string{"NOSKILLS_REAL_GIT": "", "PATH": "/nonexistent"}, code: 1},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			te := newTestEnv(t, root)
			te.vars["NOSKILLS_REAL_GIT"] = "/usr/bin/git"

			for key, value := range tc.vars {
				te.vars[key] = value
			}

			if tc.git != nil {
				te.runGit = tc.git
			}

			if code := runHook(t, te, "", append([]string{"git-exec"}, tc.args...)...); code != tc.code {
				t.Errorf("exit %d, want %d; stderr %q", code, tc.code, te.stderr)
			}
		})
	}
}

func TestStopAndPostToolUse(t *testing.T) {
	t.Parallel()

	root := initializedProject(t, "EXECUTING")
	te := newTestEnv(t, root)

	runHook(t, te, `{"tool_name":"Write","tool_input":{"file_path":"src/a.ts","content":"x"}}`, "post-file-write")
	runHook(t, te, `{"tool_name":"Bash","tool_input":{"command":"noskills next"}}`, "post-bash")
	runHook(t, te, `{"tool_name":"AskUserQuestion","tool_input":{"question":"Anything else?"}}`, "post-ask-user-question")

	if code := runHook(t, te, `{}`, "stop"); code != 0 {
		t.Fatalf("stop exit %d", code)
	}

	state, err := os.ReadFile(filepath.Join(root, ".eser", ".state", "progresses", "state.json")) //nolint:gosec // G304: the test's project
	if err != nil || !strings.Contains(string(state), `"iteration": 1`) || !strings.Contains(string(state), `"src/a.ts"`) {
		t.Errorf("state %s, %v", state, err)
	}

	for _, name := range []string{"noskills-calls.jsonl", "ask-token.json", "iterations/iteration-1.json"} {
		if _, err := os.Stat(filepath.Join(root, ".eser", ".state", "progresses", name)); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}
