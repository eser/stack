// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"bytes"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
)

// The fake npx is this test binary under the name npx: TestMain acts as npx
// when fakeNpxRecord is set, before the testing framework parses flags.
const (
	fakeNpxRecord = "FAKE_NPX_RECORD" // the file it writes its arguments to
	fakeNpxExit   = "FAKE_NPX_EXIT"   // the exit code it returns
)

func TestMain(m *testing.M) {
	if record := os.Getenv(fakeNpxRecord); record != "" {
		os.Exit(fakeNpx(record))
	}

	os.Exit(m.Run())
}

// fakeNpx records its arguments and the loop guard, echoes stdin to stdout
// and exits with FAKE_NPX_EXIT.
func fakeNpx(record string) int {
	lines := append([]string{"guard=" + os.Getenv(guardVar)}, os.Args[1:]...)
	if err := os.WriteFile(record, []byte(strings.Join(lines, "\n")), 0o600); err != nil { //nolint:gosec // G703: the path the test gave the fake
		return 99 //nolint:mnd // the test reads it as a broken fake
	}

	_, _ = io.Copy(os.Stdout, os.Stdin)
	_, _ = os.Stderr.WriteString("fake npx stderr\n")

	code, _ := strconv.Atoi(os.Getenv(fakeNpxExit))

	return code
}

// installFakeNpx copies the test binary to dir as npx (npx.exe on Windows),
// so exec.LookPath finds it on a PATH of dir alone.
func installFakeNpx(t *testing.T, dir string) string {
	t.Helper()

	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(self) //nolint:gosec // the test binary itself
	if err != nil {
		t.Fatal(err)
	}

	path := filepath.Join(dir, "npx")
	if runtime.GOOS == "windows" {
		path += ".exe"
	}

	if err := os.WriteFile(path, data, 0o755); err != nil { //nolint:gosec // G306: an executable
		t.Fatal(err)
	}

	return path
}

type stubRun struct {
	code   int
	stdout string
	stderr string
	record []string // the fake npx's lines; nil when it did not run
}

// runStub runs a forwarder in process; with npx set, a fake npx is on its
// PATH and exits with npxExit.
func runStub(t *testing.T, f *forwarder, npx bool, npxExit int, stdin string, args ...string) stubRun {
	t.Helper()

	dir := t.TempDir()
	record := filepath.Join(dir, "record")

	f.lookPath = func(string) (string, error) { return "", exec.ErrNotFound }
	if npx {
		path := installFakeNpx(t, dir)
		f.lookPath = func(file string) (string, error) {
			if file != "npx" {
				return "", exec.ErrNotFound
			}

			return path, nil
		}
	}

	f.environ = append(f.environ, fakeNpxRecord+"="+record, fakeNpxExit+"="+strconv.Itoa(npxExit))

	var stdout, stderr bytes.Buffer

	f.stdin, f.stdout, f.stderr = strings.NewReader(stdin), &stdout, &stderr
	if f.executable == "" {
		f.executable = filepath.Join(dir, f.name)
	}

	code := f.run(t.Context(), args)

	result := stubRun{code: code, stdout: stdout.String(), stderr: stderr.String(), record: nil}
	if data, err := os.ReadFile(record); err == nil { //nolint:gosec // the test's own file
		result.record = strings.Split(string(data), "\n")
	}

	return result
}

func TestForwardsToTheNpmPackageThroughNpx(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		stub     string
		version  string
		args     []string
		npxExit  int
		wantArgs []string
	}{
		{"laroux with arguments", "laroux", "5.0.0", []string{"dev", "--port", "3000"}, 0,
			[]string{"--yes", "laroux@5.0.0", "dev", "--port", "3000"}},
		{"noskills passes the exit code on", "noskills", "5.0.0", []string{"next"}, 7,
			[]string{"--yes", "noskills@5.0.0", "next"}},
		{"no arguments", "laroux", "5.1.0-rc.1", nil, 0, []string{"--yes", "laroux@5.1.0-rc.1"}},
		{"a dev build runs the latest release", "laroux", "dev", []string{"build"}, 0,
			[]string{"--yes", "laroux", "build"}},
		{"a later version argument is forwarded", "laroux", "5.0.0", []string{"build", "version"}, 0,
			[]string{"--yes", "laroux@5.0.0", "build", "version"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			f := &forwarder{name: tc.stub, version: tc.version, environ: []string{"KEEP=1"}} //nolint:exhaustruct // runStub fills the rest

			got := runStub(t, f, true, tc.npxExit, "from stdin", tc.args...)
			if got.code != tc.npxExit {
				t.Errorf("exit %d, want %d; stderr %q", got.code, tc.npxExit, got.stderr)
			}

			want := append([]string{"guard=" + tc.stub}, tc.wantArgs...)
			if strings.Join(got.record, "|") != strings.Join(want, "|") {
				t.Errorf("npx ran with %q, want %q", got.record, want)
			}

			if got.stdout != "from stdin" || got.stderr != "fake npx stderr\n" {
				t.Errorf("stdio not passed through: stdout %q stderr %q", got.stdout, got.stderr)
			}
		})
	}
}

func TestPrintsTheNpmInstallCommandWithoutNpx(t *testing.T) {
	t.Parallel()

	for _, stub := range []string{"laroux", "noskills"} {
		t.Run(stub, func(t *testing.T) {
			t.Parallel()

			f := &forwarder{name: stub, version: "5.0.0"} //nolint:exhaustruct // runStub fills the rest

			got := runStub(t, f, false, 0, "", "dev")
			if got.code == 0 {
				t.Error("exit 0 without npx; want non-zero")
			}

			if !strings.Contains(got.stderr, "npm i -g "+stub+"\n") || !strings.Contains(got.stderr, "not on PATH") {
				t.Errorf("stderr %q", got.stderr)
			}

			if got.stdout != "" || got.record != nil {
				t.Errorf("stdout %q, npx record %q", got.stdout, got.record)
			}
		})
	}
}

func TestAnswersVersionAndUpdateItself(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		args []string
		want []string
	}{
		{"version", []string{"version"}, []string{"laroux 5.0.0\n", "npx --yes laroux@5.0.0"}},
		{"system version", []string{"system", "version"}, []string{"laroux 5.0.0\n"}},
		{"--version, which the Homebrew formula test runs", []string{"--version"}, []string{"laroux 5.0.0\n"}},
		{"update", []string{"update"}, []string{"npm i -g laroux\n", "delete this binary: /opt/bin/laroux\n"}},
		{"system update", []string{"system", "update", "--force"}, []string{"npm i -g laroux\n"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			f := &forwarder{name: "laroux", version: "5.0.0", executable: "/opt/bin/laroux"} //nolint:exhaustruct // runStub fills the rest

			got := runStub(t, f, true, 0, "", tc.args...)
			if got.code != 0 || got.record != nil {
				t.Fatalf("exit %d, npx record %q; stderr %q", got.code, got.record, got.stderr)
			}

			for _, want := range tc.want {
				if !strings.Contains(got.stdout, want) {
					t.Errorf("stdout should contain %q:\n%s", want, got.stdout)
				}
			}
		})
	}
}

func TestRefusesToForwardToItself(t *testing.T) {
	t.Parallel()

	f := &forwarder{name: "noskills", version: "5.0.0", environ: []string{guardVar + "=noskills"}} //nolint:exhaustruct // runStub fills the rest

	got := runStub(t, f, true, 0, "", "next")
	if got.code == 0 || got.record != nil || !strings.Contains(got.stderr, "npm i -g noskills") {
		t.Errorf("exit %d, npx record %q, stderr %q", got.code, got.record, got.stderr)
	}
}

func TestRefusesToRunWithoutAName(t *testing.T) {
	t.Parallel()

	f := &forwarder{version: "5.0.0"} //nolint:exhaustruct // runStub fills the rest

	got := runStub(t, f, true, 0, "", "dev")
	if got.code == 0 || got.record != nil || !strings.Contains(got.stderr, "-X main.name=") {
		t.Errorf("exit %d, npx record %q, stderr %q", got.code, got.record, got.stderr)
	}
}

// The name comes from the linker, not from the file name: a renamed file
// still forwards to its package.
func TestBuiltBinaryTakesItsNameFromTheLinker(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("builds the stub")
	}

	dir := t.TempDir()

	binary := filepath.Join(dir, "renamed")
	if runtime.GOOS == "windows" {
		binary += ".exe"
	}

	build := exec.Command("go", "build", "-ldflags", "-X main.name=noskills -X main.version=5.0.0", "-o", binary, ".") //nolint:noctx
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("go build: %v\n%s", err, output)
	}

	out, err := exec.Command(binary, "version").CombinedOutput() //nolint:gosec,noctx // the binary just built
	if err != nil || !strings.HasPrefix(string(out), "noskills 5.0.0\n") {
		t.Errorf("version: %v\n%s", err, out)
	}

	npxDir := t.TempDir()
	installFakeNpx(t, npxDir)

	record := filepath.Join(dir, "record")
	run := exec.Command(binary, "init") //nolint:gosec,noctx // the binary just built
	run.Env = []string{"PATH=" + npxDir, fakeNpxRecord + "=" + record, fakeNpxExit + "=3"}

	if err := run.Run(); run.ProcessState.ExitCode() != 3 {
		t.Errorf("forwarded exit %d: %v", run.ProcessState.ExitCode(), err)
	}

	data, _ := os.ReadFile(record) //nolint:gosec // the test's own file
	if string(data) != "guard=noskills\n--yes\nnoskills@5.0.0\ninit" {
		t.Errorf("npx ran with %q", data)
	}
}
