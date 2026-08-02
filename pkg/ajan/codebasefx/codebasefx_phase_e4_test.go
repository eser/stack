// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Phase E4 tests: WalkSourceFiles git-aware mode, push operations via bare remote.

package codebasefx_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// ─── WalkSourceFiles git-aware mode ──────────────────────────────────────────

func TestWalkSourceFiles_GitAware(t *testing.T) {
	t.Parallel()

	dir := makeGitRepo(t) // has README.md committed

	// Add a tracked .ts file
	tsPath := filepath.Join(dir, "hello.ts")
	if err := os.WriteFile(tsPath, []byte("export const x = 1;\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	cmd := exec.Command("git", "add", tsPath)
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git add: %v\n%s", err, out)
	}

	cmd = exec.Command("git", "commit", "-m", "feat: add hello.ts")
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@example.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@example.com",
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git commit: %v\n%s", err, out)
	}

	entries, err := codebasefx.WalkSourceFiles(context.Background(), codebasefx.WalkOptions{
		Root:     dir,
		GitAware: true,
	})

	if err != nil {
		t.Fatalf("WalkSourceFiles git-aware: %v", err)
	}

	// Must return at least the README and hello.ts
	if len(entries) < 2 {
		t.Errorf("expected at least 2 entries, got %d", len(entries))
	}
}

// ─── Push / PushTag / DeleteRemoteTag via bare local remote ──────────────────

func makeBareRemote(t *testing.T) (localRepo string) {
	t.Helper()

	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}

	bareDir := t.TempDir()
	cmd := exec.Command("git", "init", "--bare", "-b", "main")
	cmd.Dir = bareDir

	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git init --bare: %v\n%s", err, out)
	}

	// Clone the bare repo so we have a working copy with remote configured
	workDir := t.TempDir()
	cmd = exec.Command("git", "clone", bareDir, workDir)
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@example.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@example.com",
	)

	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git clone: %v\n%s", err, out)
	}

	// Configure user in clone
	for _, args := range [][]string{
		{"config", "user.email", "test@example.com"},
		{"config", "user.name", "Test"},
	} {
		cmd = exec.Command("git", args...)
		cmd.Dir = workDir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}

	// Create an initial commit
	if err := os.WriteFile(filepath.Join(workDir, "README.md"), []byte("# test\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	for _, args := range [][]string{
		{"add", "."},
		{"commit", "-m", "feat: initial"},
	} {
		cmd = exec.Command("git", args...)
		cmd.Dir = workDir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@example.com",
			"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@example.com",
		)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}

	return workDir
}

func TestPush(t *testing.T) {
	t.Parallel()

	workDir := makeBareRemote(t)
	ctx := context.Background()

	if err := codebasefx.Push(ctx, workDir, "origin", "main"); err != nil {
		t.Fatalf("Push: %v", err)
	}
}

func TestPushTag(t *testing.T) {
	t.Parallel()

	workDir := makeBareRemote(t)
	ctx := context.Background()

	// Push the branch first
	if err := codebasefx.Push(ctx, workDir, "origin", "main"); err != nil {
		t.Fatalf("Push: %v", err)
	}

	// Create and push a tag
	if err := codebasefx.CreateTag(ctx, workDir, "v0.1.0", "release"); err != nil {
		t.Fatalf("CreateTag: %v", err)
	}

	if err := codebasefx.PushTag(ctx, workDir, "origin", "v0.1.0"); err != nil {
		t.Fatalf("PushTag: %v", err)
	}
}

func TestDeleteRemoteTag(t *testing.T) {
	t.Parallel()

	workDir := makeBareRemote(t)
	ctx := context.Background()

	// Push branch, create and push tag, then delete remote tag
	if err := codebasefx.Push(ctx, workDir, "origin", "main"); err != nil {
		t.Fatalf("Push: %v", err)
	}

	if err := codebasefx.CreateTag(ctx, workDir, "v0.1.0", "release"); err != nil {
		t.Fatalf("CreateTag: %v", err)
	}

	if err := codebasefx.PushTag(ctx, workDir, "origin", "v0.1.0"); err != nil {
		t.Fatalf("PushTag: %v", err)
	}

	if err := codebasefx.DeleteRemoteTag(ctx, workDir, "origin", "v0.1.0"); err != nil {
		t.Fatalf("DeleteRemoteTag: %v", err)
	}
}
