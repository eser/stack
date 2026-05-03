// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// ── RunSingleValidator ────────────────────────────────────────────────────────

func tempFileEntry(t *testing.T, name string, content []byte) codebasefx.FileEntry {
	t.Helper()

	tmp := t.TempDir()
	path := filepath.Join(tmp, name)

	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write temp file: %v", err)
	}

	return codebasefx.FileEntry{Path: path, Name: name, Size: int64(len(content))}
}

func TestRunSingleValidator_ShortName_Resolves(t *testing.T) {
	t.Parallel()

	files := []codebasefx.FileEntry{tempFileEntry(t, "ok.ts", []byte("export const x = 1;\n"))}

	// "eof" is the short name; full name is "codebase-eof".
	res, err := codebasefx.RunSingleValidator(context.Background(), "eof", files, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if res.Name != "codebase-eof" {
		t.Errorf("expected name 'codebase-eof', got %q", res.Name)
	}
}

func TestRunSingleValidator_FullName_Resolves(t *testing.T) {
	t.Parallel()

	files := []codebasefx.FileEntry{tempFileEntry(t, "ok.ts", []byte("export const x = 1;\n"))}

	res, err := codebasefx.RunSingleValidator(context.Background(), "codebase-eof", files, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if res.Name != "codebase-eof" {
		t.Errorf("expected name 'codebase-eof', got %q", res.Name)
	}
}

func TestRunSingleValidator_UnknownName_Error(t *testing.T) {
	t.Parallel()

	files := []codebasefx.FileEntry{tempFileEntry(t, "ok.ts", []byte("hello\n"))}

	_, err := codebasefx.RunSingleValidator(context.Background(), "nonexistent-validator", files, nil)
	if err == nil {
		t.Fatal("expected error for unknown validator, got nil")
	}
}

func TestRunSingleValidator_SuccessfulValidation_Passes(t *testing.T) {
	t.Parallel()

	// File ends with exactly one newline — passes eof validator.
	files := []codebasefx.FileEntry{tempFileEntry(t, "good.ts", []byte("const x = 1;\n"))}

	res, err := codebasefx.RunSingleValidator(context.Background(), "eof", files, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !res.Passed {
		t.Errorf("expected Passed=true, issues: %v", res.Issues)
	}

	if len(res.Issues) != 0 {
		t.Errorf("expected 0 issues, got %d: %v", len(res.Issues), res.Issues)
	}
}

func TestRunSingleValidator_FailedValidation_HasIssues(t *testing.T) {
	t.Parallel()

	// File missing trailing newline — fails eof validator.
	files := []codebasefx.FileEntry{tempFileEntry(t, "bad.ts", []byte("const x = 1;"))}

	res, err := codebasefx.RunSingleValidator(context.Background(), "eof", files, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if res.Passed {
		t.Error("expected Passed=false for file missing trailing newline")
	}

	if len(res.Issues) == 0 {
		t.Error("expected at least one issue, got none")
	}
}

func TestRunSingleValidator_EmptyFileList_Passes(t *testing.T) {
	t.Parallel()

	files := []codebasefx.FileEntry{}

	res, err := codebasefx.RunSingleValidator(context.Background(), "eof", files, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !res.Passed {
		t.Errorf("expected Passed=true for empty file list, got false; issues: %v", res.Issues)
	}

	if len(res.Issues) != 0 {
		t.Errorf("expected 0 issues for empty list, got %d", len(res.Issues))
	}
}
