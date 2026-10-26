// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package collectorfx_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/collectorfx"
)

func TestWalkCollectableFiles_Empty(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	files, err := collectorfx.WalkCollectableFiles(context.Background(), collectorfx.WalkOptions{
		BaseDir: dir,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(files) != 0 {
		t.Errorf("expected 0 files, got %d", len(files))
	}
}

func TestWalkCollectableFiles_FindsTSFiles(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeFile := func(name string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name), []byte(""), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	writeFile("a.ts")
	writeFile("b.tsx")
	writeFile("c.js")
	writeFile("d.txt") // not collectable

	files, err := collectorfx.WalkCollectableFiles(context.Background(), collectorfx.WalkOptions{
		BaseDir: dir,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(files) != 3 {
		t.Errorf("expected 3 collectable files, got %d", len(files))
	}
}

func TestWalkCollectableFiles_SkipsTestFiles(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "mod.ts"), []byte(""), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "mod.test.ts"), []byte(""), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := collectorfx.WalkCollectableFiles(context.Background(), collectorfx.WalkOptions{
		BaseDir: dir,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(files) != 1 {
		t.Errorf("expected 1 file (test file skipped), got %d", len(files))
	}
}

func TestWalkCollectableFiles_CustomIgnorePattern(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "keep.ts"), []byte(""), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "skip_me.ts"), []byte(""), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := collectorfx.WalkCollectableFiles(context.Background(), collectorfx.WalkOptions{
		BaseDir:           dir,
		IgnoreFilePattern: `skip_`,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(files) != 1 {
		t.Errorf("expected 1 file after custom ignore, got %d", len(files))
	}
}

func TestWalkCollectableFiles_InvalidIgnorePattern(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	_, err := collectorfx.WalkCollectableFiles(context.Background(), collectorfx.WalkOptions{
		BaseDir:           dir,
		IgnoreFilePattern: `[invalid`,
	})
	if err == nil {
		t.Fatal("expected error for invalid regex pattern")
	}
}

func TestWalkCollectableFiles_SkipsNodeModules(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	nodeModDir := filepath.Join(dir, "node_modules")
	if err := os.MkdirAll(nodeModDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nodeModDir, "lib.ts"), []byte(""), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "main.ts"), []byte(""), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := collectorfx.WalkCollectableFiles(context.Background(), collectorfx.WalkOptions{
		BaseDir: dir,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, f := range files {
		if f.RelPath == "node_modules/lib.ts" {
			t.Error("node_modules should be skipped")
		}
	}
	if len(files) != 1 {
		t.Errorf("expected 1 file (main.ts), got %d", len(files))
	}
}

func TestWalkCollectableFiles_DefaultBaseDir(t *testing.T) {
	t.Parallel()

	_, err := collectorfx.WalkCollectableFiles(context.Background(), collectorfx.WalkOptions{})
	if err != nil {
		t.Fatalf("empty BaseDir should default to '.': %v", err)
	}
}

func TestWalkCollectableFiles_MissingRoot(t *testing.T) {
	t.Parallel()

	missing := filepath.Join(t.TempDir(), "does-not-exist")

	_, err := collectorfx.WalkCollectableFiles(context.Background(), collectorfx.WalkOptions{
		BaseDir: missing,
	})
	if !errors.Is(err, collectorfx.ErrUnreadableWalkRoot) {
		t.Fatalf("expected ErrUnreadableWalkRoot, got %v", err)
	}

	if !strings.Contains(err.Error(), missing) {
		t.Errorf("expected the error to name %q, got %q", missing, err.Error())
	}
}

func TestWalkCollectableFiles_SkipsUnreadableSubdirectory(t *testing.T) {
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

	files, err := collectorfx.WalkCollectableFiles(context.Background(), collectorfx.WalkOptions{
		BaseDir: dir,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(files) != 1 || files[0].RelPath != "a.ts" {
		t.Errorf("expected only a.ts, got %+v", files)
	}
}
