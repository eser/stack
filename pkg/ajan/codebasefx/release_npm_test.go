// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package codebasefx_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

func TestNpmPlatformNamesTheNodePlatform(t *testing.T) {
	t.Parallel()

	want := []string{"darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"}

	got := make([]string, 0, len(codebasefx.ReleaseTargets))
	for _, target := range codebasefx.ReleaseTargets {
		got = append(got, codebasefx.NpmPlatform(target))
	}

	if !slices.Equal(got, want) {
		t.Errorf("npm platforms %v, want %v", got, want)
	}

	if name := codebasefx.NpmPlatformPackage("noskills", codebasefx.ReleaseTargets[4]); name != "@eserstack/noskills-win32-x64" {
		t.Errorf("package %q", name)
	}
}

// Each npm binary has a committed platform package per release target, with
// the shared version and the os and cpu npm selects it by; the launcher's
// source manifest lists every one as an optional dependency.
func TestNpmPlatformPackagesAreCommitted(t *testing.T) {
	t.Parallel()

	version := strings.TrimSpace(readRepoFile(t, "VERSION"))

	for _, binary := range codebasefx.NpmBinaries {
		var launcher struct {
			OptionalDependencies map[string]string `json:"optionalDependencies"`
		}

		if err := json.Unmarshal([]byte(readRepoFile(t, "pkg/@eserstack/"+binary+"/package.json")), &launcher); err != nil {
			t.Fatal(err)
		}

		for _, target := range codebasefx.ReleaseTargets {
			name := codebasefx.NpmPlatformPackage(binary, target)

			var pkg struct {
				Name    string   `json:"name"`
				Version string   `json:"version"`
				OS      []string `json:"os"`
				CPU     []string `json:"cpu"`
				Files   []string `json:"files"`
			}

			if err := json.Unmarshal([]byte(readRepoFile(t, "pkg/"+name+"/package.json")), &pkg); err != nil {
				t.Fatalf("%s: %v", name, err)
			}

			platform := strings.SplitN(codebasefx.NpmPlatform(target), "-", 2) //nolint:mnd // os-cpu

			file := binary
			if target.GOOS == "windows" {
				file += ".exe"
			}

			if pkg.Name != name || pkg.Version != version || !slices.Equal(pkg.OS, platform[:1]) ||
				!slices.Equal(pkg.CPU, platform[1:]) || !slices.Equal(pkg.Files, []string{file}) {
				t.Errorf("%s: %+v", name, pkg)
			}

			if launcher.OptionalDependencies[name] != "workspace:*" {
				t.Errorf("pkg/@eserstack/%s/package.json does not list %s as workspace:*", binary, name)
			}
		}
	}
}

// stagingRepo is a repository root with the platform packages of noskills at
// a version.
func stagingRepo(t *testing.T, version string) string {
	t.Helper()

	root := t.TempDir()

	for _, target := range codebasefx.ReleaseTargets {
		dir := filepath.Join(root, "pkg", "@eserstack", "noskills-"+codebasefx.NpmPlatform(target))
		if err := os.MkdirAll(dir, 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"version":"`+version+`"}`), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	return root
}

func TestStageNpmBinariesCopiesTheArchivedBinaries(t *testing.T) {
	t.Parallel()

	bin := filepath.Join(t.TempDir(), "binaries")

	if _, err := codebasefx.CompileRelease(context.Background(), &codebasefx.CompileOptions{ //nolint:exhaustruct
		OutDir:   bin,
		Version:  "4.6.0",
		Targets:  []codebasefx.ReleaseTarget{codebasefx.ReleaseTargets[0], codebasefx.ReleaseTargets[4]},
		Binaries: []codebasefx.ReleaseBinary{{Name: "noskills", Main: "./cmd/noskills", VersionVar: "main.version"}}, //nolint:exhaustruct
		Build:    fakeBuild,
		ModTime:  time.Unix(1_700_000_000, 0),
	}); err != nil {
		t.Fatal(err)
	}

	root := stagingRepo(t, "4.6.0")

	result, err := codebasefx.StageNpmBinaries(&codebasefx.StageOptions{Root: root, BinDir: bin, Version: "4.6.0", Log: nil})
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Staged) != 2 || len(result.Missing) != 3 {
		t.Fatalf("staged %v, missing %v", result.Staged, result.Missing)
	}

	for path, want := range map[string]string{
		filepath.Join(root, "pkg", "@eserstack", "noskills-darwin-arm64", "noskills"):  "noskills 4.6.0 darwin/arm64",
		filepath.Join(root, "pkg", "@eserstack", "noskills-win32-x64", "noskills.exe"): "noskills 4.6.0 windows/amd64",
	} {
		data, err := os.ReadFile(path) //nolint:gosec // the test's own file
		if err != nil || string(data) != want {
			t.Errorf("%s: %q %v", path, data, err)
		}

		if info, err := os.Stat(path); runtime.GOOS != "windows" && (err != nil || info.Mode().Perm() != 0o755) {
			t.Errorf("%s is not executable: %v", path, info.Mode())
		}
	}
}

func TestStageNpmBinariesRefusesAMismatchOrNothing(t *testing.T) {
	t.Parallel()

	bin := filepath.Join(t.TempDir(), "binaries")

	if _, err := codebasefx.CompileRelease(context.Background(), &codebasefx.CompileOptions{ //nolint:exhaustruct
		OutDir:   bin,
		Version:  "4.6.0",
		Targets:  codebasefx.ReleaseTargets[:1],
		Binaries: []codebasefx.ReleaseBinary{{Name: "noskills", Main: "./cmd/noskills", VersionVar: "main.version"}}, //nolint:exhaustruct
		Build:    fakeBuild,
	}); err != nil {
		t.Fatal(err)
	}

	_, err := codebasefx.StageNpmBinaries(&codebasefx.StageOptions{Root: stagingRepo(t, "4.5.2"), BinDir: bin, Version: "4.6.0", Log: nil})
	if !errors.Is(err, codebasefx.ErrPackageVersion) {
		t.Errorf("a 4.5.2 package took a 4.6.0 binary: %v", err)
	}

	_, err = codebasefx.StageNpmBinaries(&codebasefx.StageOptions{Root: stagingRepo(t, "4.6.0"), BinDir: t.TempDir(), Version: "4.6.0", Log: nil})
	if !errors.Is(err, codebasefx.ErrNothingStaged) {
		t.Errorf("an empty binaries directory staged something: %v", err)
	}
}
