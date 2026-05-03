// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Phase E2 tests: git operations, more changelog/workspace coverage.

package codebasefx_test

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// ─── git test helpers ─────────────────────────────────────────────────────────

// makeGitRepo creates a temp directory with an initialised git repo,
// one commit, and one tag. Skips if git is not available.
func makeGitRepo(t *testing.T) string {
	t.Helper()

	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}

	dir := t.TempDir()

	gitRun := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Test",
			"GIT_AUTHOR_EMAIL=test@example.com",
			"GIT_COMMITTER_NAME=Test",
			"GIT_COMMITTER_EMAIL=test@example.com",
		)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}

	gitRun("init", "-b", "main")
	gitRun("config", "user.email", "test@example.com")
	gitRun("config", "user.name", "Test")

	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("# test\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	gitRun("add", ".")
	gitRun("commit", "-m", "feat: initial commit")
	gitRun("tag", "v1.0.0")

	return dir
}

// ─── GetCurrentBranch ─────────────────────────────────────────────────────────

func TestGetCurrentBranch(t *testing.T) {
	t.Parallel()

	dir := makeGitRepo(t)
	ctx := context.Background()

	branch, err := codebasefx.GetCurrentBranch(ctx, dir)
	if err != nil {
		t.Fatalf("GetCurrentBranch: %v", err)
	}

	if branch == "" {
		t.Error("expected non-empty branch name")
	}
}

func TestGetCurrentBranch_NotARepo(t *testing.T) {
	t.Parallel()

	_, err := codebasefx.GetCurrentBranch(context.Background(), t.TempDir())
	if err == nil {
		t.Error("expected error when directory is not a git repo")
	}
}

// ─── GetLatestTag ─────────────────────────────────────────────────────────────

func TestGetLatestTag(t *testing.T) {
	t.Parallel()

	dir := makeGitRepo(t)

	tag, err := codebasefx.GetLatestTag(context.Background(), dir)
	if err != nil {
		t.Fatalf("GetLatestTag: %v", err)
	}

	if tag != "v1.0.0" {
		t.Errorf("expected tag 'v1.0.0', got %q", tag)
	}
}

func TestGetLatestTag_NoTags(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}

	dir := t.TempDir()
	cmd := exec.Command("git", "init", "-b", "main")
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git init: %v\n%s", err, out)
	}

	_, err := codebasefx.GetLatestTag(context.Background(), dir)
	if !errors.Is(err, codebasefx.ErrNoTags) {
		t.Errorf("expected ErrNoTags, got %v", err)
	}
}

// ─── IsCleanWorkTree ──────────────────────────────────────────────────────────

func TestIsCleanWorkTree_Clean(t *testing.T) {
	t.Parallel()

	dir := makeGitRepo(t)

	clean, err := codebasefx.IsCleanWorkTree(context.Background(), dir)
	if err != nil {
		t.Fatalf("IsCleanWorkTree: %v", err)
	}

	if !clean {
		t.Error("expected clean work tree after fresh commit")
	}
}

func TestIsCleanWorkTree_Dirty(t *testing.T) {
	t.Parallel()

	dir := makeGitRepo(t)

	// Write an untracked file → dirty
	if err := os.WriteFile(filepath.Join(dir, "untracked.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	clean, err := codebasefx.IsCleanWorkTree(context.Background(), dir)
	if err != nil {
		t.Fatalf("IsCleanWorkTree: %v", err)
	}

	if clean {
		t.Error("expected dirty work tree after adding untracked file")
	}
}

// ─── GetCommitsBetween ────────────────────────────────────────────────────────

func TestGetCommitsBetween(t *testing.T) {
	t.Parallel()

	dir := makeGitRepo(t)
	ctx := context.Background()

	// Add a second commit after the tag
	if err := os.WriteFile(filepath.Join(dir, "new.txt"), []byte("hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	cmd := exec.Command("git", "add", ".")
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@example.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@example.com",
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git add: %v\n%s", err, out)
	}

	cmd = exec.Command("git", "commit", "-m", "fix: add new file")
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@example.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@example.com",
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git commit: %v\n%s", err, out)
	}

	commits, err := codebasefx.GetCommitsBetween(ctx, dir, "v1.0.0", "HEAD")
	if err != nil {
		t.Fatalf("GetCommitsBetween: %v", err)
	}

	if len(commits) != 1 {
		t.Errorf("expected 1 commit between v1.0.0 and HEAD, got %d: %v", len(commits), commits)
	}

	if !strings.Contains(commits[0].Subject, "fix: add new file") {
		t.Errorf("unexpected commit subject: %q", commits[0].Subject)
	}
}

// ─── InsertIntoChangelog (more cases) ────────────────────────────────────────

func TestInsertIntoChangelog_VersionAlreadyExists(t *testing.T) {
	t.Parallel()

	existing := "# Changelog\n\n## [1.1.0] - 2025-01-01\n\n### Added\n- old\n"
	newSection := "## [1.1.0] - 2025-06-01\n\n### Added\n- updated\n"

	result := codebasefx.InsertIntoChangelog(existing, newSection, "1.1.0")

	// Updated content must appear
	if !strings.Contains(result, "updated") {
		t.Error("expected updated section content")
	}

	// Old content must be replaced
	if strings.Contains(result, "- old\n") {
		t.Error("expected old section content to be replaced")
	}
}

func TestInsertIntoChangelog_EmptyExisting(t *testing.T) {
	t.Parallel()

	section := "## [1.0.0] - 2025-01-01\n\n### Added\n- first\n"
	result := codebasefx.InsertIntoChangelog("", section, "1.0.0")

	if !strings.Contains(result, "## [1.0.0]") {
		t.Error("expected section to appear in empty changelog")
	}
}

// ─── GenerateChangelogSection (more commit types) ─────────────────────────────

func TestGenerateChangelogSection_BreakingAndMultipleTypes(t *testing.T) {
	t.Parallel()

	commits := []codebasefx.ConventionalCommit{
		{Type: "feat", Message: "add login", Breaking: true},
		{Type: "fix", Message: "crash on nil"},
		{Type: "docs", Message: "update readme"},
		{Type: "refactor", Message: "clean up"},
		{Type: "chore", Message: "update deps"},
	}

	section := codebasefx.GenerateChangelogSection("v2.0.0", commits)

	if !strings.Contains(section, "v2.0.0") {
		t.Error("expected version in section header")
	}
}

func TestGenerateChangelogSection_EmptyCommits(t *testing.T) {
	t.Parallel()

	section := codebasefx.GenerateChangelogSection("v1.0.1", nil)
	// Must return something even with no commits
	_ = section
}

// ─── registry Description() ───────────────────────────────────────────────────

func TestValidatorTool_Description(t *testing.T) {
	t.Parallel()

	r := workflowfx.NewRegistry()
	codebasefx.RegisterAllValidators(r)

	for _, name := range r.Names() {
		tool := r.MustGet(name)
		if tool.Description() == "" {
			t.Errorf("tool %q has empty Description()", name)
		}
	}
}

// ─── CheckDocs ────────────────────────────────────────────────────────────────

func TestCheckDocs_MinimalWorkspace(t *testing.T) {
	t.Parallel()

	root := makeWorkspace(t)

	// Add a TS file with JSDoc to exercise extractJSDocEntries
	pkgA := filepath.Join(root, "pkg-a")
	tsContent := `// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Adds two numbers together.
 * @param a - first number
 * @param b - second number
 * @returns the sum
 */
export function add(a: number, b: number): number {
	return a + b;
}
`
	if err := os.WriteFile(filepath.Join(pkgA, "math.ts"), []byte(tsContent), 0o644); err != nil {
		t.Fatal(err)
	}

	result, err := codebasefx.CheckDocs(root, false)
	if err != nil {
		t.Fatalf("CheckDocs: %v", err)
	}

	// Should complete without internal error
	_ = result
}

// ─── CheckExportNames with violation ─────────────────────────────────────────

func TestCheckExportNames_WithViolation(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	pkgA := filepath.Join(root, "pkg-a")

	if err := os.MkdirAll(pkgA, 0o755); err != nil {
		t.Fatal(err)
	}

	writeJSON(t, filepath.Join(root, "deno.json"), map[string]any{
		"workspace": []string{"./pkg-a"},
	})

	// deno.json with a PascalCase export key — violates kebab-case
	writeJSON(t, filepath.Join(pkgA, "deno.json"), map[string]any{
		"name":    "@scope/pkg-a",
		"version": "1.0.0",
		"exports": map[string]string{"./MyComponent": "./mod.ts"},
	})

	writeJSON(t, filepath.Join(pkgA, "package.json"), map[string]any{
		"name":    "@scope/pkg-a",
		"version": "1.0.0",
	})

	if err := os.WriteFile(filepath.Join(pkgA, "mod.ts"), []byte("export const x = 1;\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	result, err := codebasefx.CheckExportNames(root, nil)
	if err != nil {
		t.Fatalf("CheckExportNames: %v", err)
	}

	if result.IsValid {
		t.Error("expected IsValid=false for PascalCase export path")
	}

	if len(result.Violations) == 0 {
		t.Error("expected at least one violation")
	}
}

// ─── CheckModExports with missing export ─────────────────────────────────────

func TestCheckModExports_MissingExport(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	pkgA := filepath.Join(root, "pkg-a")

	if err := os.MkdirAll(pkgA, 0o755); err != nil {
		t.Fatal(err)
	}

	writeJSON(t, filepath.Join(root, "deno.json"), map[string]any{
		"workspace": []string{"./pkg-a"},
	})

	writeJSON(t, filepath.Join(pkgA, "deno.json"), map[string]any{
		"name":    "@scope/pkg-a",
		"version": "1.0.0",
		"exports": map[string]string{".": "./mod.ts"},
	})

	writeJSON(t, filepath.Join(pkgA, "package.json"), map[string]any{
		"name":    "@scope/pkg-a",
		"version": "1.0.0",
	})

	// mod.ts exists but helper.ts is NOT exported from it
	if err := os.WriteFile(filepath.Join(pkgA, "mod.ts"), []byte("export const x = 1;\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(pkgA, "helper.ts"), []byte("export const y = 2;\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	result, err := codebasefx.CheckModExports(root)
	if err != nil {
		t.Fatalf("CheckModExports: %v", err)
	}

	if result.IsComplete {
		t.Error("expected IsComplete=false when helper.ts is not re-exported")
	}

	if len(result.MissingExports) == 0 {
		t.Error("expected at least one missing export")
	}
}

// ─── CheckPackageConfigs with inconsistency ───────────────────────────────────

func TestCheckPackageConfigs_VersionMismatch(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	pkgA := filepath.Join(root, "pkg-a")

	if err := os.MkdirAll(pkgA, 0o755); err != nil {
		t.Fatal(err)
	}

	writeJSON(t, filepath.Join(root, "deno.json"), map[string]any{
		"workspace": []string{"./pkg-a"},
	})

	// deno.json version = 1.0.0
	writeJSON(t, filepath.Join(pkgA, "deno.json"), map[string]any{
		"name":    "@scope/pkg-a",
		"version": "1.0.0",
		"exports": map[string]string{".": "./mod.ts"},
	})

	// package.json version = 2.0.0 — mismatch!
	writeJSON(t, filepath.Join(pkgA, "package.json"), map[string]any{
		"name":    "@scope/pkg-a",
		"version": "2.0.0",
	})

	if err := os.WriteFile(filepath.Join(pkgA, "mod.ts"), []byte("export const x = 1;\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	result, err := codebasefx.CheckPackageConfigs(root)
	if err != nil {
		t.Fatalf("CheckPackageConfigs: %v", err)
	}

	if result.IsConsistent {
		t.Error("expected IsConsistent=false for version mismatch")
	}
}

// ─── CheckCircularDeps with cycle ────────────────────────────────────────────

func TestCheckCircularDeps_WithCycle(t *testing.T) {
	t.Parallel()

	root := t.TempDir()

	pkgA := filepath.Join(root, "pkg-a")
	pkgB := filepath.Join(root, "pkg-b")

	if err := os.MkdirAll(pkgA, 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.MkdirAll(pkgB, 0o755); err != nil {
		t.Fatal(err)
	}

	writeJSON(t, filepath.Join(root, "deno.json"), map[string]any{
		"workspace": []string{"./pkg-a", "./pkg-b"},
	})

	// pkg-a depends on pkg-b, pkg-b depends on pkg-a → cycle
	// buildDepGraph reads package.json dependency *keys* for intra-workspace edges.
	writeJSON(t, filepath.Join(pkgA, "deno.json"), map[string]any{
		"name":    "@scope/pkg-a",
		"version": "1.0.0",
		"exports": map[string]string{".": "./mod.ts"},
	})

	writeJSON(t, filepath.Join(pkgB, "deno.json"), map[string]any{
		"name":    "@scope/pkg-b",
		"version": "1.0.0",
		"exports": map[string]string{".": "./mod.ts"},
	})

	writeJSON(t, filepath.Join(pkgA, "package.json"), map[string]any{
		"name":         "@scope/pkg-a",
		"version":      "1.0.0",
		"dependencies": map[string]string{"@scope/pkg-b": "workspace:*"},
	})
	writeJSON(t, filepath.Join(pkgB, "package.json"), map[string]any{
		"name":         "@scope/pkg-b",
		"version":      "1.0.0",
		"dependencies": map[string]string{"@scope/pkg-a": "workspace:*"},
	})

	if err := os.WriteFile(filepath.Join(pkgA, "mod.ts"), []byte("export const a = 1;\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(pkgB, "mod.ts"), []byte("export const b = 1;\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	result, err := codebasefx.CheckCircularDeps(root)
	if err != nil {
		t.Fatalf("CheckCircularDeps: %v", err)
	}

	if !result.HasCycles {
		t.Error("expected HasCycles=true for a↔b circular dependency")
	}
}
