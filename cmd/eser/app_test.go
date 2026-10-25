// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/workflowfx"
)

var errNotFound = errors.New("not found")

// testEnv is an env with buffers, no PATH and no ESER_PLUGIN_PATH.
func testEnv(t *testing.T) *env {
	t.Helper()

	e := newSystemEnv()
	e.stdin = strings.NewReader("")
	e.stdout = &bytes.Buffer{}
	e.stderr = &bytes.Buffer{}
	e.cwd = t.TempDir()
	e.version = "4.5.2"
	e.getenv = func(string) string { return "" }
	e.environ = func() []string { return nil }
	e.lookPath = lookPathIn(nil)

	return e
}

// lookPathIn looks a program up in dirs only.
func lookPathIn(dirs []string) func(string) (string, error) {
	return func(file string) (string, error) {
		for _, dir := range dirs {
			candidate := filepath.Join(dir, file)
			if isExecutable(candidate) {
				return candidate, nil
			}
		}

		return "", errNotFound
	}
}

// fakeBin writes a shell script that prints its name and arguments.
func fakeBin(t *testing.T, dir, name string) {
	t.Helper()

	if err := os.MkdirAll(dir, 0o750); err != nil {
		t.Fatal(err)
	}

	path := filepath.Join(dir, name)
	script := "#!/bin/sh\necho \"" + name + " $*\"\n"

	if err := os.WriteFile(path, []byte(script), 0o755); err != nil { //nolint:gosec // G306: a fake executable
		t.Fatal(err)
	}
}

func TestResolvePlugin(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("the fake bins are shell scripts")
	}

	pathDir := filepath.Join(t.TempDir(), "path")
	pluginDir := filepath.Join(t.TempDir(), "plugins")
	npxDir := filepath.Join(t.TempDir(), "npx")
	larouxDir := filepath.Join(t.TempDir(), "laroux")

	fakeBin(t, pathDir, "eser-foo")
	fakeBin(t, pathDir, "eser-laroux") // eser-<name> wins over the known bin
	fakeBin(t, pathDir, "laroux")
	fakeBin(t, pluginDir, "noskills")
	fakeBin(t, npxDir, "npx")
	fakeBin(t, larouxDir, "laroux")

	cases := []struct {
		name    string
		command string
		path    []string
		plugins string
		version string
		program string
		args    []string
		message string
	}{
		{name: "eser-<name> on PATH", command: "foo", path: []string{pathDir}, program: filepath.Join(pathDir, "eser-foo")},
		{name: "eser-<name> before the known bin", command: "laroux", path: []string{pathDir}, program: filepath.Join(pathDir, "eser-laroux")},
		{name: "a known bin on PATH", command: "laroux", path: []string{larouxDir}, program: filepath.Join(larouxDir, "laroux")},
		{name: "a known bin in a later ESER_PLUGIN_PATH entry", command: "laroux", plugins: pluginDir + string(os.PathListSeparator) + larouxDir, program: filepath.Join(larouxDir, "laroux")},
		{name: "a known bin in ESER_PLUGIN_PATH", command: "noskills", plugins: pluginDir, program: filepath.Join(pluginDir, "noskills")},
		{name: "the npx fallback pins the eser version", command: "noskills", path: []string{npxDir}, program: filepath.Join(npxDir, "npx"), args: []string{"--yes", "noskills@4.5.2"}},
		{name: "a dev build asks npx for the package without a version", command: "laroux", path: []string{npxDir}, version: "dev", program: filepath.Join(npxDir, "npx"), args: []string{"--yes", "laroux"}},
		{name: "no npx: the npm install command", command: "noskills", message: "Install it with: npm install -g noskills@4.5.2"},
		{name: "posts has no npm package", command: "posts", path: []string{npxDir}, message: `"eser-posts" on PATH or in ESER_PLUGIN_PATH`},
		{name: "an unknown command", command: "nope", path: []string{npxDir}, message: `"eser-nope" executable on PATH`},
		{name: "a path-like name", command: "../x", message: "is not a command name"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			e := testEnv(t)
			e.lookPath = lookPathIn(tc.path)
			e.getenv = func(key string) string {
				if key == "ESER_PLUGIN_PATH" {
					return tc.plugins
				}

				return ""
			}

			if tc.version != "" {
				e.version = tc.version
			}

			got := resolvePlugin(e, tc.command)

			if got.program != tc.program || strings.Join(got.args, " ") != strings.Join(tc.args, " ") {
				t.Errorf("resolved %q %v, want %q %v (message %q)", got.program, got.args, tc.program, tc.args, got.message)
			}

			if !strings.Contains(got.message, tc.message) {
				t.Errorf("message %q should contain %q", got.message, tc.message)
			}
		})
	}
}

func TestForwardRunsThePlugin(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("the fake bins are shell scripts")
	}

	dir := t.TempDir()
	fakeBin(t, dir, "eser-foo")

	e := testEnv(t)
	e.lookPath = lookPathIn([]string{dir})

	if code := run(context.Background(), e, []string{"foo", "a b", "--flag"}); code != 0 {
		t.Fatalf("exit code %d: %s", code, e.stderr)
	}

	if got := e.stdout.(*bytes.Buffer).String(); got != "eser-foo a b --flag\n" { //nolint:forcetypeassert
		t.Errorf("plugin output %q", got)
	}
}

func writeManifest(t *testing.T, dir, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Join(dir, ".eser"), 0o750); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(dir, ".eser", "manifest.yml"), []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestScriptRunOrder(t *testing.T) {
	t.Parallel()

	scripts := map[string]workflowfx.ScriptConfig{
		"a": {Command: "a", Depends: []string{"b", "c"}},
		"b": {Command: "b", Depends: []string{"c"}},
		"c": {Command: "c"},
		"x": {Command: "x", Depends: []string{"y"}},
		"y": {Command: "y", Depends: []string{"x"}},
		"m": {Command: "m", Depends: []string{"missing"}},
	}

	if order, err := scriptRunOrder(scripts, "a"); err != nil || strings.Join(order, ",") != "c,b,a" {
		t.Errorf("order %v, %v", order, err)
	}

	if _, err := scriptRunOrder(scripts, "x"); !errors.Is(err, errScriptOrder) || !strings.Contains(err.Error(), "x -> y -> x") {
		t.Errorf("a cycle: %v", err)
	}

	if _, err := scriptRunOrder(scripts, "m"); !errors.Is(err, errScriptOrder) || !strings.Contains(err.Error(), `depends on "missing"`) {
		t.Errorf("a missing dependency: %v", err)
	}
}

func TestShellArgsAndResolveCommand(t *testing.T) {
	t.Parallel()

	if got := shellArgs("deno test", []string{"--filter", "my test"}); strings.Join(got, "|") != `-c|deno test "$@"|sh|--filter|my test` {
		t.Errorf("shellArgs %q", got)
	}

	if got := shellArgs("deno test", nil); strings.Join(got, "|") != "-c|deno test" {
		t.Errorf("shellArgs %q", got)
	}

	if got := resolveCommand("eser workflows run", "/opt/my eser/eser"); got != "'/opt/my eser/eser' workflows run" {
		t.Errorf("resolveCommand %q", got)
	}

	if got := resolveCommand("esery x", "/e"); got != "esery x" {
		t.Errorf("only a leading eser word is replaced: %q", got)
	}
}

func TestRunScript(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("no sh")
	}

	e := testEnv(t)
	writeManifest(t, e.cwd, `scripts:
  greet: echo hello
  build:
    command: echo "built in $(basename "$PWD")"
    workingDirectory: sub
  all:
    command: echo all
    depends: [greet, build]
  fail: exit 3
`)

	if err := os.MkdirAll(filepath.Join(e.cwd, "sub"), 0o750); err != nil {
		t.Fatal(err)
	}

	if code := run(context.Background(), e, []string{"greet", "a b", "c"}); code != 0 {
		t.Fatalf("greet: exit %d: %s", code, e.stderr)
	}

	if code := run(context.Background(), e, []string{"all"}); code != 0 {
		t.Fatalf("all: exit %d: %s", code, e.stderr)
	}

	if code := run(context.Background(), e, []string{"fail"}); code != 3 {
		t.Errorf("fail: exit %d, want 3", code)
	}

	want := "hello a b c\n$ greet\nhello\n$ build\nbuilt in sub\nall\n"
	if got := e.stdout.(*bytes.Buffer).String(); got != want { //nolint:forcetypeassert
		t.Errorf("output:\n%s\nwant:\n%s", got, want)
	}
}

func TestBuiltinsAndHelp(t *testing.T) {
	t.Parallel()

	e := testEnv(t)
	writeManifest(t, e.cwd, "scripts:\n  ok: eser workflows run -e precommit\n")

	if code := run(context.Background(), e, []string{"--help"}); code != 0 {
		t.Fatalf("--help: exit %d", code)
	}

	help := e.stdout.(*bytes.Buffer).String() //nolint:forcetypeassert
	for _, want := range []string{"update ", "doctor ", "ok ", "Runs: eser workflows run -e precommit"} {
		if !strings.Contains(help, want) {
			t.Errorf("help should list %q:\n%s", want, help)
		}
	}

	e.stdout = &bytes.Buffer{}
	if code := run(context.Background(), e, []string{"version"}); code != 0 || e.stdout.(*bytes.Buffer).String() != "eser 4.5.2\n" { //nolint:forcetypeassert
		t.Errorf("version: exit %d, %q", code, e.stdout)
	}

	broken := testEnv(t)
	writeManifest(t, broken.cwd, "scripts: [\n")

	if code := run(context.Background(), broken, []string{"ok"}); code != 1 || !strings.Contains(broken.stderr.(*bytes.Buffer).String(), "manifest.yml") { //nolint:forcetypeassert
		t.Errorf("a broken manifest: exit %d, %s", code, broken.stderr)
	}
}

// TestForwardReachesTheWorkspaceCLIs runs `eser laroux --help` and
// `eser noskills --help` against the Node CLIs in this repository, through
// ESER_PLUGIN_PATH shims like the ones the npm launcher provides.
func TestForwardReachesTheWorkspaceCLIs(t *testing.T) {
	t.Parallel()

	node, err := exec.LookPath("node")
	if err != nil || runtime.GOOS == "windows" {
		t.Skip("needs node and sh")
	}

	repo, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(filepath.Join(repo, "node_modules")); err != nil {
		t.Skip("the workspace is not installed (pnpm install)")
	}

	plugins := t.TempDir()
	shims := map[string]string{
		"laroux":   "pkg/@eserstack/laroux-server/cli.ts",
		"noskills": "pkg/@eserstack/noskills/main.ts",
	}

	for bin, entry := range shims {
		script := "#!/bin/sh\nexec " + shellQuote(node) + " --disable-warning=ExperimentalWarning " +
			shellQuote(filepath.Join(repo, entry)) + " \"$@\"\n"
		if err := os.WriteFile(filepath.Join(plugins, bin), []byte(script), 0o755); err != nil { //nolint:gosec // G306: a shim
			t.Fatal(err)
		}
	}

	for bin, want := range map[string]string{"laroux": "laroux.js framework commands", "noskills": "state-machine orchestrator"} {
		e := testEnv(t)
		e.cwd = repo
		e.getenv = func(key string) string {
			if key == "ESER_PLUGIN_PATH" {
				return plugins
			}

			return ""
		}

		if code := run(context.Background(), e, []string{bin, "--help"}); code != 0 {
			t.Errorf("eser %s --help: exit %d: %s", bin, code, e.stderr)
		}

		if out := e.stdout.(*bytes.Buffer).String(); !strings.Contains(out, want) { //nolint:forcetypeassert
			t.Errorf("eser %s --help printed:\n%s", bin, out)
		}
	}
}
