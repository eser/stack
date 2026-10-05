// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx_test

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

func TestParseFilenameRules(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		raw       any
		wantRules []codebasefx.FilenameRule
		wantErr   string
	}{
		{name: "absent option", raw: nil},
		{
			name:      "JSON string",
			raw:       `[{"directory":"pkg/","convention":"snake_case","exclude":["README.md"]}]`,
			wantRules: []codebasefx.FilenameRule{{Directory: "pkg/", Convention: "snake_case", Exclude: []string{"README.md"}}},
		},
		{
			name: "list decoded from a workflow file",
			raw: []any{
				map[string]any{"directory": "*", "convention": "kebab-case"},
			},
			wantRules: []codebasefx.FilenameRule{{Directory: "*", Convention: "kebab-case"}},
		},
		{name: "malformed JSON", raw: `[{"directory":`, wantErr: "parse rules option"},
		{name: "object instead of a list", raw: map[string]any{"directory": "*"}, wantErr: "parse rules option"},
		{
			name:    "rule without a directory",
			raw:     `[{"convention":"kebab-case"}]`,
			wantErr: "rule 0 has no directory",
		},
		{
			name:    "unknown convention",
			raw:     `[{"directory":"src/","convention":"camelCase"}]`,
			wantErr: `convention "camelCase"`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			rules, err := codebasefx.ParseFilenameRules(tt.raw)

			if tt.wantErr != "" {
				if !errors.Is(err, codebasefx.ErrInvalidFilenameRule) {
					t.Fatalf("expected ErrInvalidFilenameRule, got %v", err)
				}

				if !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("error %q does not contain %q", err, tt.wantErr)
				}

				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if len(rules) != len(tt.wantRules) {
				t.Fatalf("got %d rules, want %d", len(rules), len(tt.wantRules))
			}

			for i := range rules {
				got, want := rules[i], tt.wantRules[i]
				if got.Directory != want.Directory || got.Convention != want.Convention ||
					strings.Join(got.Exclude, ",") != strings.Join(want.Exclude, ",") {
					t.Fatalf("rule %d = %+v, want %+v", i, got, want)
				}
			}
		})
	}
}

func TestValidatorTool_MalformedOptionsFailBeforeWalk(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		tool    string
		opts    map[string]any
		wantErr string
	}{
		{
			name:    "malformed filename rules",
			tool:    "codebase-filenames",
			opts:    map[string]any{"rules": `not json`},
			wantErr: "parse rules option",
		},
		{
			name:    "maxKb of the wrong type",
			tool:    "codebase-large-file",
			opts:    map[string]any{"maxKb": "1024"},
			wantErr: "maxKb option has type string",
		},
		{
			name:    "negative maxKb",
			tool:    "codebase-large-file",
			opts:    map[string]any{"maxKb": -1},
			wantErr: "maxKb option -1 is negative",
		},
		{
			name:    "fractional maxKb",
			tool:    "codebase-large-file",
			opts:    map[string]any{"maxKb": 1.5},
			wantErr: "not a whole number",
		},
	}

	r := workflowfx.NewRegistry()
	codebasefx.RegisterAllValidators(r)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			// A root that does not exist: the options must fail before the walk.
			tt.opts["root"] = filepath.Join(t.TempDir(), "missing")

			_, err := r.MustGet(tt.tool).Run(t.Context(), tt.opts)
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("expected an error containing %q, got %v", tt.wantErr, err)
			}
		})
	}
}

func TestValidatorTool_LargeFileAcceptsIntMaxKb(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "big.bin"), make([]byte, 2048), 0o644); err != nil {
		t.Fatal(err)
	}

	r := workflowfx.NewRegistry()
	codebasefx.RegisterAllValidators(r)

	// YAML decodes whole numbers as int; before, that type fell back to 1024 KB.
	result, err := r.MustGet("codebase-large-file").Run(t.Context(), map[string]any{
		"root":  dir,
		"maxKb": 1,
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if result.Passed {
		t.Fatal("expected a 2 KB file to fail a 1 KB limit")
	}
}

func TestRunSingleValidator_MalformedOptions(t *testing.T) {
	t.Parallel()

	files := []codebasefx.FileEntry{{Path: "unused.txt", Name: "unused.txt"}}

	_, err := codebasefx.RunSingleValidator(t.Context(), "large-file", files, map[string]any{"maxKb": "big"})
	if err == nil || !strings.Contains(err.Error(), "maxKb option has type string") {
		t.Fatalf("expected a maxKb option error, got %v", err)
	}
}

func TestRunValidators_UnreadableFileIsReported(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("file mode 000 does not block reads on Windows")
	}

	if os.Geteuid() == 0 {
		t.Skip("root reads files regardless of their mode")
	}

	dir := t.TempDir()
	path := filepath.Join(dir, "locked.txt")

	if err := os.WriteFile(path, []byte("content\n"), 0o000); err != nil {
		t.Fatal(err)
	}

	results := codebasefx.RunValidators(
		[]codebasefx.FileEntry{{Path: path, Name: "locked.txt"}},
		[]codebasefx.ValidatorFunc{codebasefx.ValidateEOF, codebasefx.ValidateBOM},
	)

	for i, r := range results {
		if r.Passed {
			t.Errorf("result %d: expected Passed=false for an unreadable file", i)
		}

		if r.FilesChecked != 0 {
			t.Errorf("result %d: expected FilesChecked=0, got %d", i, r.FilesChecked)
		}

		if len(r.Issues) != 1 || !strings.Contains(r.Issues[0].Message, "the file was not validated") {
			t.Errorf("result %d: expected one read issue, got %+v", i, r.Issues)
		}
	}
}

func TestRunValidators_EntriesWithoutContent(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("creating symlinks needs extra privileges on Windows")
	}

	dir := t.TempDir()

	dirLink := filepath.Join(dir, "linked-dir")
	if err := os.Symlink(t.TempDir(), dirLink); err != nil {
		t.Fatal(err)
	}

	brokenLink := filepath.Join(dir, "broken-link")
	if err := os.Symlink(filepath.Join(dir, "missing-target"), brokenLink); err != nil {
		t.Fatal(err)
	}

	results := codebasefx.RunValidators(
		[]codebasefx.FileEntry{
			{Path: dirLink, Name: "linked-dir", IsSymlink: true},
			{Path: brokenLink, Name: "broken-link", IsSymlink: true},
		},
		[]codebasefx.ValidatorFunc{codebasefx.ValidateSymlinks()},
	)

	if results[0].FilesChecked != 2 {
		t.Fatalf("expected both entries to reach the validator, got FilesChecked=%d", results[0].FilesChecked)
	}

	if len(results[0].Issues) != 1 || results[0].Issues[0].File != brokenLink {
		t.Fatalf("expected one broken-symlink issue for %s, got %+v", brokenLink, results[0].Issues)
	}
}
