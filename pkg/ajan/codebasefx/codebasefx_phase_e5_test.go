// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Phase E5 tests: ValidateSecrets skip patterns, CheckCircularDeps dual-source edges.

package codebasefx_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// ─── ValidateSecrets skip patterns ───────────────────────────────────────────

func TestValidateSecrets_SkipPatterns(t *testing.T) {
	t.Parallel()

	// Content that would trigger the AWS key pattern on a normal file.
	awsKey := []byte("AKIAIOSFODNN7EXAMPLE12345678\n")

	cases := []struct {
		name string
		path string
	}{
		{"lock suffix", "yarn.lock"},
		{"package-lock suffix", "package-lock.json"},
		{"test dot", "auth.test.ts"},
		{"testdata dir", "testdata/fixtures.ts"},
		{"snap suffix", "component.snap"},
		{"min dot", "vendor.min.js"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			issues := codebasefx.ValidateSecrets(tc.path, awsKey)
			if len(issues) != 0 {
				t.Errorf("expected 0 issues for skip-pattern path %q, got %d", tc.path, len(issues))
			}
		})
	}
}

func TestValidateSecrets_NoSkip_StillDetects(t *testing.T) {
	t.Parallel()

	issues := codebasefx.ValidateSecrets("config.ts", []byte("AKIAIOSFODNN7EXAMPLE12345678\n"))
	if len(issues) == 0 {
		t.Error("expected at least one secret issue for non-skip path")
	}
}

// ─── CheckCircularDeps dual-source edges ─────────────────────────────────────

// makePackageWorkspace creates a root package.json whose workspaces field
// lists the given member paths.
func makePackageWorkspace(t *testing.T, members []string) string {
	t.Helper()

	root := t.TempDir()
	writeJSON(t, filepath.Join(root, "package.json"), map[string]any{
		"workspaces": members,
	})

	return root
}

func TestCheckCircularDeps_PackageJsonOnly(t *testing.T) {
	t.Parallel()

	root := makePackageWorkspace(t, []string{"pkg-a", "pkg-b"})

	if err := os.MkdirAll(filepath.Join(root, "pkg-a"), 0o755); err != nil { //nolint:gosec
		t.Fatal(err)
	}

	writeJSON(t, filepath.Join(root, "pkg-a", "package.json"), map[string]any{
		"name": "@scope/pkg-a",
		"dependencies": map[string]any{
			"@scope/pkg-b": "workspace:*",
		},
	})

	if err := os.MkdirAll(filepath.Join(root, "pkg-b"), 0o755); err != nil { //nolint:gosec
		t.Fatal(err)
	}

	writeJSON(t, filepath.Join(root, "pkg-b", "package.json"), map[string]any{
		"name": "@scope/pkg-b",
		"dependencies": map[string]any{
			"@scope/pkg-a": "workspace:*",
		},
	})

	result, err := codebasefx.CheckCircularDeps(root)
	if err != nil {
		t.Fatalf("CheckCircularDeps: %v", err)
	}

	if !result.HasCycles {
		t.Error("expected cycle detected via package.json dependencies keys")
	}
}

func TestCheckCircularDeps_DependencyKindsDedup(t *testing.T) {
	t.Parallel()

	// dependencies AND devDependencies express the same cycle. The
	// per-package seen map deduplicates so each edge appears once.
	root := makePackageWorkspace(t, []string{"pkg-a", "pkg-b"})

	for _, pkg := range [][2]string{{"pkg-a", "@scope/pkg-b"}, {"pkg-b", "@scope/pkg-a"}} {
		if err := os.MkdirAll(filepath.Join(root, pkg[0]), 0o755); err != nil { //nolint:gosec
			t.Fatal(err)
		}

		writeJSON(t, filepath.Join(root, pkg[0], "package.json"), map[string]any{
			"name":            "@scope/" + pkg[0],
			"version":         "1.0.0",
			"dependencies":    map[string]any{pkg[1]: "workspace:*"},
			"devDependencies": map[string]any{pkg[1]: "workspace:*"},
		})
	}

	result, err := codebasefx.CheckCircularDeps(root)
	if err != nil {
		t.Fatalf("CheckCircularDeps: %v", err)
	}

	if !result.HasCycles {
		t.Error("expected cycle detected")
	}

	if len(result.Cycles) != 1 {
		t.Errorf("dedup: expected 1 cycle, got %d: %v", len(result.Cycles), result.Cycles)
	}
}

func TestCheckCircularDeps_ActualWorkspace(t *testing.T) {
	t.Parallel()

	wsRoot := filepath.Join("..", "..", "..")

	result, err := codebasefx.CheckCircularDeps(wsRoot)
	if err != nil {
		t.Skipf("actual workspace not accessible: %v", err)
	}

	if result.PackagesChecked == 0 {
		t.Skip("workspace has no package.json workspaces — skipping edge count probe")
	}

	t.Logf("actual workspace: %d packages checked, hasCycles=%v, cycles=%d",
		result.PackagesChecked, result.HasCycles, len(result.Cycles))
}
