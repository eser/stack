// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package codebasefx_test

import (
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// The release asset name is a contract between `eser dev compile`, which
// writes the archives, and etc/scripts/install.sh and install.ps1, which
// download them; nothing type-checks across it, and a drift is a 404 at
// install time. (Ported from pkg/@eserstack/cli/scripts/release-naming.test.ts
// with compile.ts.)

func readRepoFile(t *testing.T, rel string) string {
	t.Helper()

	data, err := os.ReadFile(filepath.Join("../../..", rel)) //nolint:gosec // a repository file
	if err != nil {
		t.Fatal(err)
	}

	return string(data)
}

func TestInstallersUseTheCompiledArchiveNames(t *testing.T) {
	t.Parallel()

	sh, ps1 := readRepoFile(t, "etc/scripts/install.sh"), readRepoFile(t, "etc/scripts/install.ps1")

	target := codebasefx.ReleaseTargets[2]
	if got := codebasefx.ArchiveFileName("eser", "4.5.2", target); got != "eser-v4.5.2-aarch64-unknown-linux-gnu.tar.gz" {
		t.Errorf("archive name %q", got)
	}

	// TAG carries its own "v"; PowerShell strips it and adds it back.
	for _, want := range []string{`ARCHIVE="${BINARY}-${TAG}-${TARGET}.tar.gz"`, "SHA256SUMS.txt"} {
		if !strings.Contains(sh, want) {
			t.Errorf("install.sh should contain %s", want)
		}
	}

	for _, want := range []string{`"$Product-v$Version-`, "SHA256SUMS.txt"} {
		if !strings.Contains(ps1, want) {
			t.Errorf("install.ps1 should contain %s", want)
		}
	}

	if strings.Contains(sh, "checksums.txt") || strings.Contains(ps1, "checksums.txt") {
		t.Error("checksums.txt was the GoReleaser name; the release has SHA256SUMS.txt")
	}
}

// Every product the release builds must be installable, and every installable
// product built (laroux and noskills as forwarding stubs, decision-9).
func TestEveryBuiltBinaryIsInstallable(t *testing.T) {
	t.Parallel()

	sh, ps1 := readRepoFile(t, "etc/scripts/install.sh"), readRepoFile(t, "etc/scripts/install.ps1")

	shList := regexp.MustCompile(`(?m)^\s*(eser\|[a-z|-]+)\)\s*;;`).FindStringSubmatch(sh)
	psList := regexp.MustCompile(`ValidateSet\(([^)]*)\)`).FindStringSubmatch(ps1)

	if shList == nil || psList == nil {
		t.Fatal("parsed no accept-list; the installers changed shape, fix this test")
	}

	shAccepts := strings.Split(shList[1], "|")

	quoted := regexp.MustCompile(`'([a-z-]+)'`).FindAllStringSubmatch(psList[1], -1)

	psAccepts := make([]string, 0, len(quoted))
	for _, m := range quoted {
		psAccepts = append(psAccepts, m[1])
	}

	expected := make([]string, 0, len(codebasefx.ReleaseBinaries))
	for _, binary := range codebasefx.ReleaseBinaries {
		expected = append(expected, binary.Name)
	}

	slices.Sort(expected)
	slices.Sort(shAccepts)
	slices.Sort(psAccepts)

	if !slices.Equal(shAccepts, expected) {
		t.Errorf("install.sh accepts %v; the release builds %v", shAccepts, expected)
	}

	if !slices.Equal(psAccepts, expected) {
		t.Errorf("install.ps1 accepts %v; the release builds %v", psAccepts, expected)
	}
}

// The Homebrew formulas and Nix packages download Unix archives; each triple
// they name must be one the release builds, or the job 404s after publish.
func TestDistributionTriplesAreBuilt(t *testing.T) {
	t.Parallel()

	built := make([]string, 0, len(codebasefx.ReleaseTargets))
	for _, target := range codebasefx.ReleaseTargets {
		built = append(built, target.Triple)
	}

	sums := codebasefx.PlaceholderSHA256Sums("1.0.0", []string{"eser"})
	if len(sums) == 0 {
		t.Fatal("no placeholder archives")
	}

	for name := range sums {
		triple := strings.TrimSuffix(strings.TrimPrefix(name, "eser-v1.0.0-"), ".tar.gz")
		if !slices.Contains(built, triple) {
			t.Errorf("%s is downloaded by a distribution job but never built", triple)
		}
	}

	flake := readRepoFile(t, "flake.nix")
	// The values of targetMap (system = "triple";), not the system names.
	triples := regexp.MustCompile(`= "((?:aarch64|x86_64)-[a-z0-9-]+)";`).FindAllStringSubmatch(flake, -1)
	if len(triples) != 4 { //nolint:mnd // the four Unix targets
		t.Fatalf("parsed %d triples from flake.nix; it changed shape, fix this test", len(triples))
	}

	for _, triple := range triples {
		if !slices.Contains(built, triple[1]) {
			t.Errorf("flake.nix downloads %s, which the release never builds", triple[1])
		}
	}
}
