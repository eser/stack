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

// makeDenoWorkspace creates a root deno.json that lists the given member paths.
func makeDenoWorkspace(t *testing.T, members []string) string {
	t.Helper()

	root := t.TempDir()
	writeJSON(t, filepath.Join(root, "deno.json"), map[string]any{
		"workspace": members,
	})

	return root
}

func TestCheckCircularDeps_DenoJsonOnly(t *testing.T) {
	t.Parallel()

	root := makeDenoWorkspace(t, []string{"./pkg-a", "./pkg-b"})

	if err := os.MkdirAll(filepath.Join(root, "pkg-a"), 0o755); err != nil { //nolint:gosec
		t.Fatal(err)
	}

	writeJSON(t, filepath.Join(root, "pkg-a", "deno.json"), map[string]any{
		"name": "@scope/pkg-a",
		"imports": map[string]any{
			"@scope/pkg-b": "jsr:@scope/pkg-b@^1.0.0",
		},
	})

	if err := os.MkdirAll(filepath.Join(root, "pkg-b"), 0o755); err != nil { //nolint:gosec
		t.Fatal(err)
	}

	writeJSON(t, filepath.Join(root, "pkg-b", "deno.json"), map[string]any{
		"name": "@scope/pkg-b",
		"imports": map[string]any{
			"@scope/pkg-a": "jsr:@scope/pkg-a@^1.0.0",
		},
	})

	result, err := codebasefx.CheckCircularDeps(root)
	if err != nil {
		t.Fatalf("CheckCircularDeps: %v", err)
	}

	if !result.HasCycles {
		t.Error("expected cycle detected via deno.json imports keys")
	}
}

func TestCheckCircularDeps_PackageJsonOnly(t *testing.T) {
	t.Parallel()

	root := makeDenoWorkspace(t, []string{"./pkg-a", "./pkg-b"})

	if err := os.MkdirAll(filepath.Join(root, "pkg-a"), 0o755); err != nil { //nolint:gosec
		t.Fatal(err)
	}

	writeJSON(t, filepath.Join(root, "pkg-a", "deno.json"), map[string]any{"name": "@scope/pkg-a"})
	writeJSON(t, filepath.Join(root, "pkg-a", "package.json"), map[string]any{
		"name": "@scope/pkg-a",
		"dependencies": map[string]any{
			"@scope/pkg-b": "workspace:*",
		},
	})

	if err := os.MkdirAll(filepath.Join(root, "pkg-b"), 0o755); err != nil { //nolint:gosec
		t.Fatal(err)
	}

	writeJSON(t, filepath.Join(root, "pkg-b", "deno.json"), map[string]any{"name": "@scope/pkg-b"})
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

func TestCheckCircularDeps_HybridDedup(t *testing.T) {
	t.Parallel()

	// Both deno.json imports AND package.json deps express the same cycle.
	// The per-package seen map deduplicates so each edge appears once.
	root := makeDenoWorkspace(t, []string{"./pkg-a", "./pkg-b"})

	if err := os.MkdirAll(filepath.Join(root, "pkg-a"), 0o755); err != nil { //nolint:gosec
		t.Fatal(err)
	}

	writeJSON(t, filepath.Join(root, "pkg-a", "deno.json"), map[string]any{
		"name":    "@scope/pkg-a",
		"version": "1.0.0",
		"imports": map[string]any{
			"@scope/pkg-b": "jsr:@scope/pkg-b@^1.0.0",
		},
	})
	writeJSON(t, filepath.Join(root, "pkg-a", "package.json"), map[string]any{
		"name":    "@scope/pkg-a",
		"version": "1.0.0",
		"dependencies": map[string]any{
			"@scope/pkg-b": "workspace:*",
		},
	})

	if err := os.MkdirAll(filepath.Join(root, "pkg-b"), 0o755); err != nil { //nolint:gosec
		t.Fatal(err)
	}

	writeJSON(t, filepath.Join(root, "pkg-b", "deno.json"), map[string]any{
		"name":    "@scope/pkg-b",
		"version": "1.0.0",
		"imports": map[string]any{
			"@scope/pkg-a": "jsr:@scope/pkg-a@^1.0.0",
		},
	})
	writeJSON(t, filepath.Join(root, "pkg-b", "package.json"), map[string]any{
		"name":    "@scope/pkg-b",
		"version": "1.0.0",
		"dependencies": map[string]any{
			"@scope/pkg-a": "workspace:*",
		},
	})

	result, err := codebasefx.CheckCircularDeps(root)
	if err != nil {
		t.Fatalf("CheckCircularDeps: %v", err)
	}

	if !result.HasCycles {
		t.Error("expected cycle detected in hybrid workspace")
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
		t.Skip("workspace has no deno.json workspace array — skipping edge count probe")
	}

	t.Logf("actual workspace: %d packages checked, hasCycles=%v, cycles=%d",
		result.PackagesChecked, result.HasCycles, len(result.Cycles))
}
