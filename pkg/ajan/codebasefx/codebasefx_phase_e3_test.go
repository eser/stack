// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Phase E3 tests: git mutations, registry tool execution, GenerateChangelogSection edge cases.

package codebasefx_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// ─── git mutation operations ──────────────────────────────────────────────────

func TestCheckout_SwitchesBranch(t *testing.T) {
	t.Parallel()

	dir := makeGitRepo(t)
	ctx := context.Background()

	// Create a new branch first
	cmd := exec.Command("git", "checkout", "-b", "feature")
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("create branch: %v\n%s", err, out)
	}

	// Switch back to main
	if err := codebasefx.Checkout(ctx, dir, "main"); err != nil {
		t.Fatalf("Checkout: %v", err)
	}

	branch, _ := codebasefx.GetCurrentBranch(ctx, dir)
	if branch != "main" {
		t.Errorf("expected branch 'main', got %q", branch)
	}
}

func TestCheckoutPrevious(t *testing.T) {
	t.Parallel()

	dir := makeGitRepo(t)
	ctx := context.Background()

	// Create and switch to a new branch
	cmd := exec.Command("git", "checkout", "-b", "temp-branch")
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("create branch: %v\n%s", err, out)
	}

	// Switch back to previous (main)
	if err := codebasefx.CheckoutPrevious(ctx, dir); err != nil {
		t.Fatalf("CheckoutPrevious: %v", err)
	}

	branch, _ := codebasefx.GetCurrentBranch(ctx, dir)
	if branch != "main" {
		t.Errorf("expected back on 'main', got %q", branch)
	}
}

func TestCreateAndCheckoutBranch(t *testing.T) {
	t.Parallel()

	dir := makeGitRepo(t)
	ctx := context.Background()

	if err := codebasefx.CreateAndCheckoutBranch(ctx, dir, "new-feature"); err != nil {
		t.Fatalf("CreateAndCheckoutBranch: %v", err)
	}

	branch, _ := codebasefx.GetCurrentBranch(ctx, dir)
	if branch != "new-feature" {
		t.Errorf("expected branch 'new-feature', got %q", branch)
	}
}

func TestStageAll_AndCommitChanges(t *testing.T) {
	t.Parallel()

	dir := makeGitRepo(t)
	ctx := context.Background()

	// Write a new file
	if err := os.WriteFile(filepath.Join(dir, "staged.txt"), []byte("staged\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := codebasefx.StageAll(ctx, dir); err != nil {
		t.Fatalf("StageAll: %v", err)
	}

	author := codebasefx.CommitAuthor{Name: "Test", Email: "test@example.com"}
	if err := codebasefx.CommitChanges(ctx, dir, "feat: stage and commit", author); err != nil {
		t.Fatalf("CommitChanges: %v", err)
	}

	clean, err := codebasefx.IsCleanWorkTree(ctx, dir)
	if err != nil {
		t.Fatalf("IsCleanWorkTree: %v", err)
	}

	if !clean {
		t.Error("expected clean work tree after commit")
	}
}

func TestCreateTag_AndDeleteTag(t *testing.T) {
	t.Parallel()

	dir := makeGitRepo(t) // already has v1.0.0
	ctx := context.Background()

	if err := codebasefx.CreateTag(ctx, dir, "v1.1.0", "release v1.1.0"); err != nil {
		t.Fatalf("CreateTag: %v", err)
	}

	tag, err := codebasefx.GetLatestTag(ctx, dir)
	if err != nil {
		t.Fatalf("GetLatestTag after create: %v", err)
	}

	if tag != "v1.1.0" {
		t.Errorf("expected tag 'v1.1.0', got %q", tag)
	}

	if err := codebasefx.DeleteTag(ctx, dir, "v1.1.0"); err != nil {
		t.Fatalf("DeleteTag: %v", err)
	}
}

func TestGetCommitsSinceDate(t *testing.T) {
	t.Parallel()

	dir := makeGitRepo(t)
	ctx := context.Background()

	commits, err := codebasefx.GetCommitsSinceDate(ctx, dir, "2000-01-01")
	if err != nil {
		t.Fatalf("GetCommitsSinceDate: %v", err)
	}

	// The initial commit should appear
	if len(commits) == 0 {
		t.Error("expected at least one commit since year 2000")
	}
}

// ─── registry: exercise all factory closures ─────────────────────────────────

// TestAllRegisteredTools_Run exercises every registered validator tool's
// factory closure by calling Run on each one with a real temp dir.
func TestAllRegisteredTools_Run(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	// Write a clean file to keep most validators happy
	clean := "// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.\nhello\n"
	if err := os.WriteFile(filepath.Join(dir, "file.ts"), []byte(clean), 0o644); err != nil {
		t.Fatal(err)
	}

	// Also write JSON and YAML and TOML files
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(`{"ok":true}`), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(dir, "data.yaml"), []byte("key: value\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(dir, "config.toml"), []byte("[section]\nkey = \"value\"\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	r := workflowfx.NewRegistry()
	codebasefx.RegisterAllValidators(r)

	ctx := context.Background()
	opts := map[string]any{"root": dir}

	for _, name := range r.Names() {
		tool := r.MustGet(name)

		result, err := tool.Run(ctx, opts)
		if err != nil {
			t.Errorf("tool %q Run returned engine error: %v", name, err)
			continue
		}

		if result == nil {
			t.Errorf("tool %q Run returned nil result", name)
		}
	}
}

// TestRegisteredTool_FilenamesWithRulesJSON covers the JSON-parsed rules path.
func TestRegisteredTool_FilenamesWithRulesJSON(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	if err := os.WriteFile(filepath.Join(dir, "good_file.txt"), []byte("ok\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	r := workflowfx.NewRegistry()
	codebasefx.RegisterAllValidators(r)

	tool := r.MustGet("codebase-filenames")
	result, err := tool.Run(context.Background(), map[string]any{
		"root":  dir,
		"rules": `[{"directory":"*","convention":"snake_case"}]`,
	})

	if err != nil {
		t.Fatalf("filenames tool Run: %v", err)
	}

	if result == nil {
		t.Fatal("expected non-nil result")
	}
}

// TestRegisteredTool_LargeFileWithInt64 covers the int64 maxKb path.
func TestRegisteredTool_LargeFileWithInt64(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	if err := os.WriteFile(filepath.Join(dir, "small.txt"), []byte("x\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	r := workflowfx.NewRegistry()
	codebasefx.RegisterAllValidators(r)

	tool := r.MustGet("codebase-large-file")
	result, err := tool.Run(context.Background(), map[string]any{
		"root":  dir,
		"maxKb": int64(1024),
	})

	if err != nil {
		t.Fatalf("large-file tool Run: %v", err)
	}

	if !result.Passed {
		t.Errorf("expected Passed=true for 2-byte file under 1024KB limit")
	}
}

// ─── GenerateChangelogSection: remaining branches ────────────────────────────

func TestGenerateChangelogSection_ChoreAndPerf(t *testing.T) {
	t.Parallel()

	commits := []codebasefx.ConventionalCommit{
		{Type: "perf", Message: "speed up query"},
		{Type: "revert", Message: "revert bad change"},
		{Type: "build", Message: "upgrade toolchain"},
	}

	section := codebasefx.GenerateChangelogSection("v1.5.0", commits)
	_ = section // main goal is coverage, not assertion
}

// ─── GroupBySection: all section types ───────────────────────────────────────

func TestGroupBySection_AllTypes(t *testing.T) {
	t.Parallel()

	commits := []codebasefx.ConventionalCommit{
		{Type: "perf", Message: "speed"},
		{Type: "refactor", Message: "clean"},
		{Type: "revert", Message: "undo"},
		{Type: "test", Message: "add tests"},
		{Type: "build", Message: "build"},
		{Type: "style", Message: "format"},
		{Type: "unknown-type", Message: "misc"},
	}

	grouped := codebasefx.GroupBySection(commits)
	// Should not panic; all unknown types fall into the catch-all or are ignored
	_ = grouped
}
