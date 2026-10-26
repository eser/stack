// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

func TestWalkSourceFiles_MissingRoot(t *testing.T) {
	t.Parallel()

	for _, gitAware := range []bool{false, true} {
		missing := filepath.Join(t.TempDir(), "does-not-exist")

		_, err := codebasefx.WalkSourceFiles(context.Background(), codebasefx.WalkOptions{
			Root:     missing,
			GitAware: gitAware,
		})
		if !errors.Is(err, codebasefx.ErrUnreadableWalkRoot) {
			t.Fatalf("gitAware=%v: expected ErrUnreadableWalkRoot, got %v", gitAware, err)
		}

		if !strings.Contains(err.Error(), missing) {
			t.Errorf("gitAware=%v: expected the error to name %q, got %q", gitAware, missing, err.Error())
		}
	}
}

func TestWalkSourceFiles_SkipsUnreadableSubdirectory(t *testing.T) {
	t.Parallel()

	if os.Geteuid() == 0 {
		t.Skip("root reads directories regardless of their mode")
	}

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.ts"), []byte(""), 0o600); err != nil {
		t.Fatal(err)
	}

	locked := filepath.Join(dir, "locked")
	if err := os.Mkdir(locked, 0o700); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(locked, "b.ts"), []byte(""), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := os.Chmod(locked, 0o000); err != nil {
		t.Fatal(err)
	}

	// G302: a directory needs its execute bit back for TempDir cleanup to remove it.
	t.Cleanup(func() { _ = os.Chmod(locked, 0o700) }) //nolint:gosec // see above

	entries, err := codebasefx.WalkSourceFiles(context.Background(), codebasefx.WalkOptions{
		Root: dir,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(entries) != 1 || entries[0].Name != "a.ts" {
		t.Errorf("expected only a.ts, got %+v", entries)
	}
}

// A caller that listed the files with git itself walks its listing: the WASM
// build cannot start git, so its host lists the files for it (TASK-366).
func TestWalkSourceFiles_UsesTheCallersGitListing(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	for _, rel := range []string{"src/a.ts", "bin/output.js", "src/b.go"} {
		path := filepath.Join(dir, rel)
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(path, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	entries, err := codebasefx.WalkListedFiles(codebasefx.WalkOptions{ //nolint:exhaustruct
		Root:       dir,
		Extensions: []string{".ts", ".js"},
		GitAware:   true,
	}, []string{"src/a.ts", "src/b.go", "src/gone.ts"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// bin/output.js is not in the listing, src/b.go has another extension and
	// src/gone.ts is listed but no longer on disk.
	if len(entries) != 1 || entries[0].Path != filepath.ToSlash(filepath.Join(dir, "src/a.ts")) {
		t.Errorf("expected only src/a.ts, got %+v", entries)
	}
}

// When git cannot run, a git-aware walk fails and says why instead of walking
// the filesystem, which would list gitignored files (TASK-366).
func TestWalkSourceFiles_FailsWhenGitCannotRun(t *testing.T) { //nolint:paralleltest // t.Setenv
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.ts"), []byte(""), 0o600); err != nil {
		t.Fatal(err)
	}

	// No git on PATH: an empty directory stands in for it.
	t.Setenv("PATH", t.TempDir())

	_, err := codebasefx.WalkSourceFiles(context.Background(), codebasefx.WalkOptions{ //nolint:exhaustruct
		Root:     dir,
		GitAware: true,
	})
	if !errors.Is(err, codebasefx.ErrGitUnavailable) {
		t.Fatalf("expected ErrGitUnavailable, got %v", err)
	}

	if !strings.Contains(err.Error(), "WalkListedFiles") {
		t.Errorf("expected the error to name the fix, got %q", err.Error())
	}
}
