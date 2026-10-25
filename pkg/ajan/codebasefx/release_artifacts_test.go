// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package codebasefx_test

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// fakeBuild writes a small file in place of a compiled binary, naming what
// it was built for.
func fakeBuild(_ context.Context, _ string, binary codebasefx.ReleaseBinary, target codebasefx.ReleaseTarget, version, out string) error {
	if binary.Name == "broken" {
		return errors.New("compile error") //nolint:err113
	}

	return os.WriteFile(out, []byte(binary.Name+" "+version+" "+target.GOOS+"/"+target.GOARCH), 0o755) //nolint:gosec // G306: a test binary
}

func TestCompileReleaseWritesTheV452Names(t *testing.T) {
	t.Parallel()

	out := filepath.Join(t.TempDir(), "binaries")
	binaries := append([]codebasefx.ReleaseBinary{}, codebasefx.ReleaseBinaries...)
	binaries = append(binaries, codebasefx.ReleaseBinary{Name: "broken", Main: "./x", VersionVar: "main.v"})

	result, err := codebasefx.CompileRelease(context.Background(), &codebasefx.CompileOptions{ //nolint:exhaustruct
		OutDir:   out,
		Version:  "4.5.2",
		Targets:  codebasefx.ReleaseTargets,
		Binaries: binaries,
		Build:    fakeBuild,
		ModTime:  time.Unix(1_700_000_000, 0),
	})
	if err != nil {
		t.Fatal(err)
	}

	// The names of the v4.5.2 release assets (decision-38).
	want := []string{
		"eser-v4.5.2-aarch64-apple-darwin.tar.gz",
		"eser-v4.5.2-x86_64-apple-darwin.tar.gz",
		"eser-v4.5.2-aarch64-unknown-linux-gnu.tar.gz",
		"eser-v4.5.2-x86_64-unknown-linux-gnu.tar.gz",
		"eser-v4.5.2-x86_64-pc-windows-msvc.zip",
		"noskills-server-v4.5.2-aarch64-apple-darwin.tar.gz",
		"noskills-server-v4.5.2-x86_64-apple-darwin.tar.gz",
		"noskills-server-v4.5.2-aarch64-unknown-linux-gnu.tar.gz",
		"noskills-server-v4.5.2-x86_64-unknown-linux-gnu.tar.gz",
		"noskills-server-v4.5.2-x86_64-pc-windows-msvc.zip",
		"laroux-v4.5.2-aarch64-apple-darwin.tar.gz",
		"laroux-v4.5.2-x86_64-apple-darwin.tar.gz",
		"laroux-v4.5.2-aarch64-unknown-linux-gnu.tar.gz",
		"laroux-v4.5.2-x86_64-unknown-linux-gnu.tar.gz",
		"laroux-v4.5.2-x86_64-pc-windows-msvc.zip",
		"noskills-v4.5.2-aarch64-apple-darwin.tar.gz",
		"noskills-v4.5.2-x86_64-apple-darwin.tar.gz",
		"noskills-v4.5.2-aarch64-unknown-linux-gnu.tar.gz",
		"noskills-v4.5.2-x86_64-unknown-linux-gnu.tar.gz",
		"noskills-v4.5.2-x86_64-pc-windows-msvc.zip",
	}

	sums, err := os.ReadFile(result.SumsPath)
	if err != nil {
		t.Fatal(err)
	}

	lines := strings.Split(strings.TrimSuffix(string(sums), "\n"), "\n")
	if len(lines) != len(want) {
		t.Fatalf("SHA256SUMS.txt:\n%s", sums)
	}

	for i, name := range want {
		data, err := os.ReadFile(filepath.Join(out, name)) //nolint:gosec // the test's own archive
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}

		sum := sha256.Sum256(data)
		if lines[i] != hex.EncodeToString(sum[:])+"  "+name {
			t.Errorf("line %d: %q", i, lines[i])
		}
	}

	if len(result.Failed) != 5 || result.Failed[0] != "broken/aarch64-apple-darwin" {
		t.Errorf("failed %v", result.Failed)
	}

	if entries, _ := os.ReadDir(out); len(entries) != len(want)+1 {
		t.Errorf("staging directories left behind: %d entries", len(entries))
	}

	// The binary sits at the archive root, executable, in both formats.
	if name, mode, body := readTarGz(t, filepath.Join(out, want[2])); name != "eser" || mode != 0o755 || body != "eser 4.5.2 linux/arm64" {
		t.Errorf("tar entry %q %o %q", name, mode, body)
	}

	if name, body := readZip(t, filepath.Join(out, want[4])); name != "eser.exe" || body != "eser 4.5.2 windows/amd64" {
		t.Errorf("zip entry %q %q", name, body)
	}

	// The same inputs and time give the same bytes.
	again := filepath.Join(t.TempDir(), "again")
	if _, err := codebasefx.CompileRelease(context.Background(), &codebasefx.CompileOptions{ //nolint:exhaustruct
		OutDir: again, Version: "4.5.2", Targets: codebasefx.ReleaseTargets[:1],
		Binaries: codebasefx.ReleaseBinaries[:1], Build: fakeBuild, ModTime: time.Unix(1_700_000_000, 0),
	}); err != nil {
		t.Fatal(err)
	}

	first, _ := os.ReadFile(filepath.Join(out, want[0]))    //nolint:gosec // the test's own archive
	second, _ := os.ReadFile(filepath.Join(again, want[0])) //nolint:gosec // the test's own archive

	if !bytes.Equal(first, second) {
		t.Error("the archive is not reproducible")
	}
}

func readTarGz(t *testing.T, path string) (string, int64, string) {
	t.Helper()

	f, err := os.Open(path) //nolint:gosec // the test's own archive
	if err != nil {
		t.Fatal(err)
	}

	defer func() { _ = f.Close() }()

	gz, err := gzip.NewReader(f)
	if err != nil {
		t.Fatal(err)
	}

	tr := tar.NewReader(gz)

	header, err := tr.Next()
	if err != nil {
		t.Fatal(err)
	}

	body, _ := io.ReadAll(tr)

	if _, err := tr.Next(); !errors.Is(err, io.EOF) {
		t.Errorf("more than one entry: %v", err)
	}

	return header.Name, header.Mode, string(body)
}

func readZip(t *testing.T, path string) (string, string) {
	t.Helper()

	r, err := zip.OpenReader(path)
	if err != nil {
		t.Fatal(err)
	}

	defer func() { _ = r.Close() }()

	if len(r.File) != 1 {
		t.Fatalf("%d entries", len(r.File))
	}

	rc, err := r.File[0].Open()
	if err != nil {
		t.Fatal(err)
	}

	defer func() { _ = rc.Close() }()

	body, _ := io.ReadAll(rc)

	return r.File[0].Name, string(body)
}

// TestCompileReleaseBuildsWorkingHostBinaries runs the real go build for the
// host and runs the extracted binaries.
func TestCompileReleaseBuildsWorkingHostBinaries(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("builds the release binaries")
	}

	host, err := codebasefx.HostReleaseTarget(runtime.GOOS, runtime.GOARCH)
	if err != nil {
		t.Skip(err)
	}

	root, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}

	out := filepath.Join(t.TempDir(), "binaries")

	result, err := codebasefx.CompileRelease(context.Background(), &codebasefx.CompileOptions{ //nolint:exhaustruct
		Root: root, OutDir: out, Version: "9.8.7", Targets: []codebasefx.ReleaseTarget{host}, Binaries: codebasefx.ReleaseBinaries,
	})
	if err != nil || len(result.Failed) > 0 {
		t.Fatalf("%v %v", err, result.Failed)
	}

	for _, archive := range result.Archives {
		if host.GOOS == "windows" {
			continue
		}

		dir := t.TempDir()

		cmd := exec.Command("tar", "-xzf", archive.Path, "-C", dir) //nolint:noctx
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("extract %s: %v: %s", archive.Name, err, output)
		}

		version, err := exec.Command(filepath.Join(dir, archive.Binary), "--version").CombinedOutput() //nolint:gosec,noctx
		if err != nil || !strings.Contains(string(version), "9.8.7") {
			t.Errorf("%s --version: %v: %s", archive.Binary, err, version)
		}
	}
}

func TestParseSHA256Sums(t *testing.T) {
	t.Parallel()

	hash := strings.Repeat("ab", 32)
	sums := codebasefx.ParseSHA256Sums(hash + "  a.tar.gz\r\n" + hash + " b.zip\n" +
		strings.ToUpper(hash) + "  upper\nnot a line\n" + hash[:63] + "   short\n" + hash + "  \n")

	if len(sums) != 2 || sums["a.tar.gz"] != hash || sums["b.zip"] != hash {
		t.Errorf("%v", sums)
	}
}

func TestPlanHomebrewSkipsBinariesWithoutArchives(t *testing.T) {
	t.Parallel()

	sums := codebasefx.PlaceholderSHA256Sums("4.6.0", []string{"eser", "noskills-server"})

	plan, err := codebasefx.PlanHomebrew("4.6.0", sums)
	if err != nil {
		t.Fatal(err)
	}

	if len(plan.Formulas) != 2 || strings.Join(plan.Skipped, ",") != "noskills,laroux" {
		t.Errorf("formulas %d, skipped %v", len(plan.Formulas), plan.Skipped)
	}

	eser := plan.Formulas["eser.rb"]
	for _, want := range []string{
		"class Eser < Formula\n",
		`url "https://github.com/eser/stack/releases/download/v4.6.0/eser-v4.6.0-aarch64-apple-darwin.tar.gz"` + "\n      sha256 \"" + strings.Repeat("0", 61) + "003\"",
		`shell_output("#{bin}/eser --version")`,
		`assert_match(/\d+\.\d+/,`,
	} {
		if !strings.Contains(eser, want) {
			t.Errorf("eser.rb should contain %q:\n%s", want, eser)
		}
	}

	delete(sums, "noskills-server-v4.6.0-x86_64-apple-darwin.tar.gz")

	if _, err := codebasefx.PlanHomebrew("4.6.0", sums); !errors.Is(err, codebasefx.ErrPartialRelease) {
		t.Errorf("a partial release: %v", err)
	}

	if _, err := codebasefx.PlanHomebrew("4.6.0", map[string]string{}); !errors.Is(err, codebasefx.ErrNoArchives) {
		t.Errorf("no archives: %v", err)
	}

	if _, err := codebasefx.PlanHomebrew("v4.6", sums); err == nil {
		t.Error("an invalid version should fail")
	}
}

func TestPushHomebrewFormulas(t *testing.T) { //nolint:paralleltest // sets the git identity variables
	// Git exports these to its hooks, and they override git config.
	t.Setenv("GIT_AUTHOR_NAME", "Someone Else")
	t.Setenv("GIT_AUTHOR_EMAIL", "someone@example.com")
	t.Setenv("GIT_COMMITTER_NAME", "Someone Else")
	t.Setenv("GIT_COMMITTER_EMAIL", "someone@example.com")

	tap := filepath.Join(t.TempDir(), "homebrew-tap.git")
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

	plan, err := codebasefx.PlanHomebrew("4.6.0", codebasefx.PlaceholderSHA256Sums("4.6.0", []string{"eser"}))
	if err != nil {
		t.Fatal(err)
	}

	env := &codebasefx.DistributionEnv{TapURL: tap} //nolint:exhaustruct

	pushed, err := codebasefx.PushHomebrewFormulas(context.Background(), env, "4.6.0", plan)
	if err != nil || !pushed {
		t.Fatalf("push: %v %v", pushed, err)
	}

	log, _ := exec.Command("git", "-C", tap, "log", "-1", "--format=%s %an %cn", "--name-only").CombinedOutput() //nolint:noctx
	if !strings.Contains(string(log), "chore: update eser formula to v4.6.0 github-actions[bot] github-actions[bot]") || !strings.Contains(string(log), "Formula/eser.rb") {
		t.Errorf("tap log:\n%s", log)
	}

	if pushed, err := codebasefx.PushHomebrewFormulas(context.Background(), env, "4.6.0", plan); err != nil || pushed {
		t.Errorf("an unchanged formula pushes nothing: %v %v", pushed, err)
	}

	if _, err := codebasefx.PushHomebrewFormulas(context.Background(), &codebasefx.DistributionEnv{}, "4.6.0", plan); !errors.Is(err, codebasefx.ErrNoToken) { //nolint:exhaustruct
		t.Errorf("no token: %v", err)
	}

	_, err = codebasefx.PushHomebrewFormulas(context.Background(),
		&codebasefx.DistributionEnv{TapURL: "file://user:secret@/nonexistent/tap.git"}, "4.6.0", plan) //nolint:exhaustruct
	if err == nil || strings.Contains(err.Error(), "secret") {
		t.Errorf("a failed clone must not print the credentials: %v", err)
	}
}

func TestDownloadSHA256SumsAndNixHashes(t *testing.T) {
	t.Parallel()

	var body bytes.Buffer

	for name, hash := range codebasefx.PlaceholderSHA256Sums("4.6.0", []string{"eser", "laroux"}) {
		body.WriteString(hash + "  " + name + "\n")
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v4.6.0/SHA256SUMS.txt" {
			http.NotFound(w, r)

			return
		}

		_, _ = w.Write(body.Bytes())
	}))
	t.Cleanup(server.Close)

	env := &codebasefx.DistributionEnv{DownloadBase: server.URL, HTTPClient: server.Client()} //nolint:exhaustruct

	sums, err := codebasefx.DownloadSHA256Sums(context.Background(), env, "4.6.0")
	if err != nil || len(sums) != 8 {
		t.Fatalf("%d sums: %v", len(sums), err)
	}

	if _, err := codebasefx.DownloadSHA256Sums(context.Background(), env, "9.9.9"); err == nil || !strings.Contains(err.Error(), "404") {
		t.Errorf("a missing release: %v", err)
	}

	data, skipped, err := codebasefx.NixHashes("4.6.0", sums)
	if err != nil {
		t.Fatal(err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}

	eser, _ := decoded["eser"].(map[string]any)
	if decoded["version"] != "4.6.0" || len(decoded) != 2 || len(eser) != 4 || strings.Join(skipped, ",") != "noskills-server" {
		t.Errorf("hashes.json:\n%s\nskipped %v", data, skipped)
	}

	// SRI of the placeholder 0x00..00 hash for x86_64 linux (index 0).
	if eser["x86_64-unknown-linux-gnu"] != "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" {
		t.Errorf("SRI %v", eser["x86_64-unknown-linux-gnu"])
	}

	if !strings.HasPrefix(string(data), "{\n  \"version\": \"4.6.0\",\n  \"eser\": {\n    \"x86_64-unknown-linux-gnu\": ") {
		t.Errorf("layout:\n%s", data)
	}
}

func TestHexToSRI(t *testing.T) {
	t.Parallel()

	// nix/hashes.json held this pair for the v4.5.2 aarch64-apple-darwin
	// archive: sha256-RM5axhTDypumSEXZXw5FNN3x0AMwRkKpkkB2EqJyjYk=.
	sri, err := codebasefx.HexToSRI("44ce5ac614c3ca9ba64845d95f0e4534ddf1d003304642a992407612a2728d89")
	if err != nil || sri != "sha256-RM5axhTDypumSEXZXw5FNN3x0AMwRkKpkkB2EqJyjYk=" {
		t.Errorf("%q %v", sri, err)
	}

	if _, err := codebasefx.HexToSRI("abc"); err == nil {
		t.Error("a short hash should fail")
	}
}
