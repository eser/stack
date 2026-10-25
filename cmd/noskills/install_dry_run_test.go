// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// The install dry runs (TASK-261): etc/scripts/install.sh, install.ps1 and
// the Homebrew formula install the noskills that `eser dev compile` builds,
// from a local copy of a release, and the installed binary must be the Go
// noskills. The Nix package is built by `nix build .#noskills`, which this
// test cannot run without Nix.

// dryRunRelease is the version of the local release.
const dryRunRelease = "5.0.0"

// compileNoskills builds the release archive of noskills for target into
// dir/v<dryRunRelease>/ and returns that directory and the archive.
func compileNoskills(t *testing.T, target codebasefx.ReleaseTarget) (string, codebasefx.CompiledArchive) {
	t.Helper()

	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}

	var noskills codebasefx.ReleaseBinary

	for _, binary := range codebasefx.ReleaseBinaries {
		if binary.Name == "noskills" {
			noskills = binary
		}
	}

	if noskills.Main != "./cmd/noskills" {
		t.Fatalf("ReleaseBinaries builds noskills from %q, want ./cmd/noskills", noskills.Main)
	}

	release := filepath.Join(t.TempDir(), "v"+dryRunRelease)

	result, err := codebasefx.CompileRelease(t.Context(), &codebasefx.CompileOptions{ //nolint:exhaustruct // the real go build
		Root:     root,
		OutDir:   release,
		Version:  dryRunRelease,
		Targets:  []codebasefx.ReleaseTarget{target},
		Binaries: []codebasefx.ReleaseBinary{noskills},
	})
	if err != nil || len(result.Failed) > 0 || len(result.Archives) != 1 {
		t.Fatalf("compile noskills: %v %+v", err, result)
	}

	return release, result.Archives[0]
}

// assertInstalledGoNoskills runs the installed binary's `version --json`.
func assertInstalledGoNoskills(t *testing.T, binary string) {
	t.Helper()

	out, err := exec.Command(binary, "version", "--json").CombinedOutput() //nolint:gosec,noctx // the installed binary
	if err != nil || !strings.Contains(string(out), `"runtime": "go"`) || !strings.Contains(string(out), `"version": "`+dryRunRelease+`"`) {
		t.Fatalf("%s version --json: %v\n%s", binary, err, out)
	}
}

// fakeCurl answers install.sh's three requests from a local release: the
// latest-release JSON and the two downloads. Any other URL fails as
// `curl -f` does on an HTTP error.
const fakeCurl = `#!/bin/sh
out=""
url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift ;;
    -*) ;;
    *) url="$1" ;;
  esac
  shift
done
case "$url" in
  https://api.github.com/repos/eser/stack/releases/latest)
    printf '{\n  "tag_name": "v%s",\n  "name": "v%s"\n}\n' "$FAKE_RELEASE_VERSION" "$FAKE_RELEASE_VERSION" ;;
  https://github.com/eser/stack/releases/download/*)
    file="$FAKE_RELEASE_DIR/${url#https://github.com/eser/stack/releases/download/}"
    [ -f "$file" ] || exit 22
    if [ -n "$out" ]; then cp "$file" "$out"; else cat "$file"; fi ;;
  *) echo "fake curl: unexpected URL $url" >&2; exit 7 ;;
esac
`

func runInstallSh(t *testing.T, releases, installDir string) (string, error) {
	t.Helper()

	bin := t.TempDir()
	if err := os.WriteFile(filepath.Join(bin, "curl"), []byte(fakeCurl), 0o755); err != nil { //nolint:gosec // G306: a fake curl
		t.Fatal(err)
	}

	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}

	cmd := exec.CommandContext(t.Context(), "sh", filepath.Join(root, "etc", "scripts", "install.sh"), "noskills")
	cmd.Env = append(os.Environ(),
		"PATH="+bin+string(os.PathListSeparator)+os.Getenv("PATH"),
		"HOME="+t.TempDir(),
		"ESER_INSTALL_DIR="+installDir,
		"FAKE_RELEASE_DIR="+releases,
		"FAKE_RELEASE_VERSION="+dryRunRelease,
	)

	out, err := cmd.CombinedOutput()

	return string(out), err
}

func TestInstallShInstallsTheGoNoskills(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("install.sh is POSIX sh; install.ps1 serves Windows")
	}

	if testing.Short() {
		t.Skip("builds the release binary")
	}

	host, err := codebasefx.HostReleaseTarget(runtime.GOOS, runtime.GOARCH)
	if err != nil {
		t.Skip(err)
	}

	release, archive := compileNoskills(t, host)
	releases := filepath.Dir(release)

	t.Run("installs", func(t *testing.T) {
		t.Parallel()

		installDir := t.TempDir()

		out, err := runInstallSh(t, releases, installDir)
		if err != nil {
			t.Fatalf("install.sh noskills: %v\n%s", err, out)
		}

		for _, want := range []string{"Downloading noskills v" + dryRunRelease + " for " + host.Triple, "noskills v" + dryRunRelease + " installed to " + installDir + "/noskills"} {
			if !strings.Contains(out, want) {
				t.Errorf("the install output should contain %q:\n%s", want, out)
			}
		}

		assertInstalledGoNoskills(t, filepath.Join(installDir, "noskills"))
	})

	t.Run("refuses a checksum mismatch", func(t *testing.T) {
		t.Parallel()

		tampered := filepath.Join(t.TempDir(), "v"+dryRunRelease)
		if err := os.MkdirAll(tampered, 0o750); err != nil {
			t.Fatal(err)
		}

		data, err := os.ReadFile(archive.Path)
		if err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(filepath.Join(tampered, archive.Name), data, 0o600); err != nil { //nolint:gosec // G703: the archive name CompileRelease gave
			t.Fatal(err)
		}

		sums := strings.Repeat("0", 64) + "  " + archive.Name + "\n"
		if err := os.WriteFile(filepath.Join(tampered, "SHA256SUMS.txt"), []byte(sums), 0o600); err != nil {
			t.Fatal(err)
		}

		installDir := t.TempDir()

		out, err := runInstallSh(t, filepath.Dir(tampered), installDir)
		if err == nil || !strings.Contains(out, "SHA256 checksum verification failed") {
			t.Fatalf("install.sh accepted a wrong checksum: %v\n%s", err, out)
		}

		if _, err := os.Stat(filepath.Join(installDir, "noskills")); err == nil {
			t.Error("install.sh installed the binary after the checksum failed")
		}
	})
}

// TestInstallPs1InstallsTheGoNoskills runs install.ps1 on Windows with
// Invoke-RestMethod and Invoke-WebRequest answered from a local release
// (testdata/install_dry_run.ps1). install.ps1 adds the install directory to
// the user's PATH in the registry, so the test runs only when
// ESER_INSTALL_PS1_DRY_RUN=1 is set, as the Windows CI job does.
func TestInstallPs1InstallsTheGoNoskills(t *testing.T) {
	t.Parallel()

	if runtime.GOOS != "windows" || os.Getenv("ESER_INSTALL_PS1_DRY_RUN") != "1" {
		t.Skip("runs on Windows with ESER_INSTALL_PS1_DRY_RUN=1: install.ps1 changes the user's PATH")
	}

	pwsh, err := exec.LookPath("pwsh")
	if err != nil {
		t.Fatal("pwsh is not on PATH")
	}

	host, err := codebasefx.HostReleaseTarget(runtime.GOOS, runtime.GOARCH)
	if err != nil {
		t.Fatal(err)
	}

	release, _ := compileNoskills(t, host)

	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}

	installDir := t.TempDir()

	cmd := exec.CommandContext(t.Context(), pwsh, "-NoProfile", "-NonInteractive", "-File", //nolint:gosec // G204: pwsh from PATH with the test's own files
		filepath.Join("testdata", "install_dry_run.ps1"),
		"-Installer", filepath.Join(root, "etc", "scripts", "install.ps1"),
		"-Releases", filepath.Dir(release),
		"-Version", dryRunRelease,
		"-InstallDir", installDir,
	)

	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("install.ps1 -Product noskills: %v\n%s", err, out)
	}

	for _, want := range []string{"Installing noskills v" + dryRunRelease, "Checksum verified.", "Installed to " + installDir + ": noskills"} {
		if !strings.Contains(string(out), want) {
			t.Errorf("the install output should contain %q:\n%s", want, out)
		}
	}

	assertInstalledGoNoskills(t, filepath.Join(installDir, "noskills.exe"))
}

// TestHomebrewFormulaInstallsTheGoNoskills renders the noskills formula the
// release job pushes, points its URL for this host at a local archive, and
// installs and tests it with brew from a temporary tap. It changes the brew
// installation while it runs (it removes the tap and the keg afterwards), so
// it runs only when ESER_HOMEBREW_DRY_RUN=1 is set.
func TestHomebrewFormulaInstallsTheGoNoskills(t *testing.T) {
	t.Parallel()

	if os.Getenv("ESER_HOMEBREW_DRY_RUN") != "1" {
		t.Skip("runs with ESER_HOMEBREW_DRY_RUN=1: it installs a formula with brew")
	}

	brew, err := exec.LookPath("brew")
	if err != nil {
		t.Fatal("brew is not on PATH")
	}

	host, err := codebasefx.HostReleaseTarget(runtime.GOOS, runtime.GOARCH)
	if err != nil || host.GOOS == "windows" {
		t.Fatalf("Homebrew has no formula for this host: %v", err)
	}

	release, archive := compileNoskills(t, host)

	// The other triples get placeholder sums; brew downloads this host's only.
	sums := codebasefx.PlaceholderSHA256Sums(dryRunRelease, []string{"noskills"})
	sums[archive.Name] = archive.SHA256

	plan, err := codebasefx.PlanHomebrew(dryRunRelease, sums)
	if err != nil {
		t.Fatal(err)
	}

	formula := strings.ReplaceAll(plan.Formulas["noskills.rb"],
		"https://github.com/eser/stack/releases/download/v"+dryRunRelease+"/", "file://"+release+"/")

	var suffix [4]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		t.Fatal(err)
	}

	tap := "eser-dry-run/t" + hex.EncodeToString(suffix[:])
	brewRun := func(args ...string) string {
		t.Helper()

		cmd := exec.CommandContext(t.Context(), brew, args...) //nolint:gosec // G204: brew from PATH with the test's own tap
		cmd.Env = append(os.Environ(), "HOMEBREW_NO_AUTO_UPDATE=1", "HOMEBREW_NO_INSTALL_CLEANUP=1",
			"HOMEBREW_NO_ANALYTICS=1", "HOMEBREW_NO_ENV_HINTS=1")

		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("brew %s: %v\n%s", strings.Join(args, " "), err, out)
		}

		return strings.TrimSpace(string(out))
	}

	brewRun("tap-new", "--no-git", tap)
	t.Cleanup(func() { _ = exec.Command(brew, "untap", "--force", tap).Run() }) //nolint:gosec,noctx // cleanup

	tapDir := brewRun("--repository", tap)
	if err := os.MkdirAll(filepath.Join(tapDir, "Formula"), 0o750); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(tapDir, "Formula", "noskills.rb"), []byte(formula), 0o644); err != nil { //nolint:gosec // G306: a tap file
		t.Fatal(err)
	}

	brewRun("install", "--formula", tap+"/noskills")
	t.Cleanup(func() { _ = exec.Command(brew, "uninstall", "--formula", tap+"/noskills").Run() }) //nolint:gosec,noctx // cleanup

	brewRun("test", tap+"/noskills")

	assertInstalledGoNoskills(t, filepath.Join(brewRun("--prefix", tap+"/noskills"), "bin", "noskills"))
}
