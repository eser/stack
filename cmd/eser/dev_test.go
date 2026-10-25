// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

func devTestEnv(t *testing.T) *env {
	t.Helper()

	e := testEnv(t)
	e.goos, e.goarch = "linux", "arm64"

	if err := os.WriteFile(filepath.Join(e.cwd, "VERSION"), []byte("4.6.0\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	e.releaseBuild = func(_ context.Context, _ string, binary codebasefx.ReleaseBinary,
		target codebasefx.ReleaseTarget, version, out string,
	) error {
		return os.WriteFile(out, []byte(binary.Name+" "+version+" "+target.Triple), 0o755) //nolint:gosec // G306: a test binary
	}

	return e
}

func TestDevCompileCurrentOnly(t *testing.T) {
	t.Parallel()

	e := devTestEnv(t)

	out, stderr, code := runCLI(t, e, "dev", "compile", "--current-only")
	if code != 0 {
		t.Fatalf("exit %d: %s", code, stderr)
	}

	for _, want := range []string{
		"eser-v4.6.0-aarch64-unknown-linux-gnu.tar.gz",
		"noskills-server-v4.6.0-aarch64-unknown-linux-gnu.tar.gz",
		"✓ 2/2 builds compiled successfully",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("output should contain %q:\n%s", want, out)
		}
	}

	sums, err := os.ReadFile(filepath.Join(e.cwd, "etc/temp/binaries/SHA256SUMS.txt"))
	if err != nil || len(codebasefx.ParseSHA256Sums(string(sums))) != 2 {
		t.Errorf("SHA256SUMS.txt: %v\n%s", err, sums)
	}

	e.goos = "plan9"
	if _, _, code := runCLI(t, e, "dev", "compile", "--current-only"); code != 1 {
		t.Errorf("an unknown host: exit %d", code)
	}
}

// The extracted host archive holds a binary `eser update` accepts.
func TestDevCompileArchiveIsWhatUpdateReads(t *testing.T) {
	t.Parallel()

	e := devTestEnv(t)
	if _, stderr, code := runCLI(t, e, "dev", "compile", "--current-only", "--out", "out"); code != 0 {
		t.Fatalf("exit %d: %s", code, stderr)
	}

	name, err := archiveName("4.6.0", "linux", "arm64")
	if err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(filepath.Join(e.cwd, "out", name)) //nolint:gosec // the test's own archive
	if err != nil {
		t.Fatal(err)
	}

	binary, err := extractBinary(data, name, "linux")
	if err != nil || string(binary) != "eser 4.6.0 aarch64-unknown-linux-gnu" {
		t.Errorf("%q %v", binary, err)
	}
}

func TestDevHomebrewAndNixDryRun(t *testing.T) {
	t.Parallel()

	e := devTestEnv(t)

	out, stderr, code := runCLI(t, e, "dev", "homebrew", "--dry-run")
	if code != 0 {
		t.Fatalf("exit %d: %s", code, stderr)
	}

	if !strings.Contains(out, "Formulas: eser.rb, noskills-server.rb") || !strings.Contains(out, "Left as they are (no archives in this release): noskills, laroux") {
		t.Errorf("homebrew dry run:\n%s", out)
	}

	out, _, code = runCLI(t, e, "dev", "nix-hashes", "--dry-run")
	if code != 0 || !strings.Contains(out, `"version": "4.6.0"`) || !strings.Contains(out, `"noskills-server": {`) {
		t.Errorf("nix dry run: exit %d\n%s", code, out)
	}

	if _, err := os.Stat(filepath.Join(e.cwd, "nix", "hashes.json")); !os.IsNotExist(err) {
		t.Errorf("a dry run wrote nix/hashes.json: %v", err)
	}
}

func TestDevNixHashesFromSums(t *testing.T) {
	t.Parallel()

	e := devTestEnv(t)
	if err := os.MkdirAll(filepath.Join(e.cwd, "nix"), 0o750); err != nil {
		t.Fatal(err)
	}

	var sums strings.Builder
	for name, hash := range codebasefx.PlaceholderSHA256Sums("4.6.0", []string{"eser"}) {
		sums.WriteString(hash + "  " + name + "\n")
	}

	if err := os.WriteFile(filepath.Join(e.cwd, "SHA256SUMS.txt"), []byte(sums.String()), 0o600); err != nil {
		t.Fatal(err)
	}

	out, stderr, code := runCLI(t, e, "dev", "nix-hashes", "--sums", "SHA256SUMS.txt")
	if code != 0 {
		t.Fatalf("exit %d: %s", code, stderr)
	}

	if !strings.Contains(out, "Not packaged (no archives in this release): noskills-server") {
		t.Errorf("output:\n%s", out)
	}

	data, err := os.ReadFile(filepath.Join(e.cwd, "nix", "hashes.json"))
	if err != nil {
		t.Fatal(err)
	}

	var decoded map[string]map[string]string
	_ = json.Unmarshal(data, &decoded) // "version" is a string; only the packages matter here

	if len(decoded["eser"]) != 4 {
		t.Errorf("hashes.json:\n%s", data)
	}
}

func TestDevHomebrewPushesToTheTap(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("uses a local bare repository path as the tap URL")
	}

	e := devTestEnv(t)
	tap := filepath.Join(t.TempDir(), "tap.git")
	seed := t.TempDir()

	for _, args := range [][]string{
		{"init", "-q", "--bare", tap},
		{"-C", seed, "init", "-q", "-b", "main"},
		{"-C", seed, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "start"},
		{"-C", seed, "push", "-q", tap, "main"},
	} {
		if output, err := exec.Command("git", args...).CombinedOutput(); err != nil { //nolint:noctx
			t.Fatalf("git %v: %v: %s", args, err, output)
		}
	}

	e.tapURL = tap

	var sums strings.Builder
	for name, hash := range codebasefx.PlaceholderSHA256Sums("4.6.0", []string{"eser", "noskills-server"}) {
		sums.WriteString(hash + "  " + name + "\n")
	}

	if err := os.WriteFile(filepath.Join(e.cwd, "sums.txt"), []byte(sums.String()), 0o600); err != nil {
		t.Fatal(err)
	}

	out, stderr, code := runCLI(t, e, "dev", "homebrew", "--sums", "sums.txt")
	if code != 0 || !strings.Contains(out, "Done: Homebrew formulas updated.") {
		t.Fatalf("exit %d: %s\n%s", code, stderr, out)
	}

	files, _ := exec.Command("git", "-C", tap, "ls-tree", "--name-only", "-r", "HEAD").CombinedOutput() //nolint:noctx
	if strings.TrimSpace(string(files)) != "Formula/eser.rb\nFormula/noskills-server.rb" {
		t.Errorf("tap files:\n%s", files)
	}
}
