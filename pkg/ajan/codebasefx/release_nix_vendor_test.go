// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package codebasefx_test

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// The expected hashes are `nix hash path` (Nix 2.28.3) of the same trees.
func TestNarHashMatchesNix(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("the tree has a symlink and an executable bit")
	}

	dir := t.TempDir()
	tree := filepath.Join(dir, "v")

	for path, file := range map[string]struct {
		body string
		mode os.FileMode
	}{
		"a":   {"hello\n", 0o644},
		"b":   {"#!/bin/sh\n", 0o755},
		"c/d": {"", 0o644},
		"Z":   {"x", 0o644},
	} {
		full := filepath.Join(tree, path)
		if err := os.MkdirAll(filepath.Dir(full), 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(full, []byte(file.body), file.mode); err != nil {
			t.Fatal(err)
		}

		if err := os.Chmod(full, file.mode); err != nil {
			t.Fatal(err)
		}
	}

	if err := os.Symlink("a", filepath.Join(tree, "e")); err != nil {
		t.Fatal(err)
	}

	single := filepath.Join(dir, "f")
	if err := os.WriteFile(single, []byte("single"), 0o600); err != nil {
		t.Fatal(err)
	}

	for path, want := range map[string]string{
		tree:   "sha256-0nf79O0+I1yzcNocKD6eAm8pUEAdxldn3B7q/ftKHAA=",
		single: "sha256-RvOsj3X9LfAorX6lh48kdx1ZX9jgWMgKMvsvrnyyhr4=",
	} {
		got, err := codebasefx.NarHash(path)
		if err != nil || got != want {
			t.Errorf("NarHash(%s) = %q %v, want %q", filepath.Base(path), got, err, want)
		}
	}
}

func TestFlakeVendorHash(t *testing.T) {
	t.Parallel()

	flake := readRepoFile(t, "flake.nix")

	hash, err := codebasefx.FlakeVendorHash(flake)
	if err != nil {
		t.Fatal(err)
	}

	updated, err := codebasefx.SetFlakeVendorHash(flake, "sha256-new+/=")
	if err != nil {
		t.Fatal(err)
	}

	if got, _ := codebasefx.FlakeVendorHash(updated); got != "sha256-new+/=" || len(updated) != len(flake)-len(hash)+len("sha256-new+/=") {
		t.Errorf("SetFlakeVendorHash wrote %q", got)
	}

	if _, err := codebasefx.SetFlakeVendorHash("{ }", "sha256-x"); !errors.Is(err, codebasefx.ErrNoVendorHash) {
		t.Errorf("a flake without vendorHash: %v", err)
	}
}
