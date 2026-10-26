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
