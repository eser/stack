// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

func TestResolveValidatorEntries_MalformedOptions(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		opts    map[string]any
		wantErr string
	}{
		{
			name: "filename rule with an unknown convention",
			opts: map[string]any{"filenames": map[string]any{
				"rules": []any{map[string]any{"directory": "*", "convention": "camelCase"}},
			}},
			wantErr: `convention "camelCase"`,
		},
		{
			name: "filename rules that are not a list",
			opts: map[string]any{"filenames": map[string]any{
				"rules": "kebab-case everywhere",
			}},
			wantErr: "parse rules option",
		},
		{
			name:    "validator entry that is not an object",
			opts:    map[string]any{"large-file": 2048.0},
			wantErr: `validatorOptions["large-file"] has type float64`,
		},
		{
			name:    "maxKb of the wrong type",
			opts:    map[string]any{"large-file": map[string]any{"maxKb": "2048"}},
			wantErr: "maxKb option has type string",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := resolveValidatorEntries([]string{"filenames", "large-file"}, tt.opts)
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("expected an error containing %q, got %v", tt.wantErr, err)
			}
		})
	}
}

func TestResolveValidatorEntries_MalformedFilenameRuleIsTyped(t *testing.T) {
	t.Parallel()

	_, err := resolveValidatorEntries([]string{"filenames"}, map[string]any{
		"filenames": map[string]any{"rules": []any{map[string]any{"convention": "kebab-case"}}},
	})
	if !errors.Is(err, codebasefx.ErrInvalidFilenameRule) {
		t.Fatalf("expected codebasefx.ErrInvalidFilenameRule, got %v", err)
	}
}

func TestResolveValidatorEntries_LargeFileHonoursMaxKb(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := filepath.Join(dir, "two-kb.bin")

	if err := os.WriteFile(path, make([]byte, 2048), 0o644); err != nil {
		t.Fatal(err)
	}

	files := []codebasefx.FileEntry{{Path: path, Name: "two-kb.bin", Size: 2048}}

	tests := []struct {
		name       string
		maxKb      float64
		wantPassed bool
	}{
		{name: "limit below the file size", maxKb: 1, wantPassed: false},
		{name: "limit above the file size", maxKb: 4, wantPassed: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			entries, err := resolveValidatorEntries([]string{"large-file"}, map[string]any{
				"large-file": map[string]any{"root": dir, "maxKb": tt.maxKb},
			})
			if err != nil {
				t.Fatalf("resolveValidatorEntries: %v", err)
			}

			results := runValidatorEntries(files, entries)
			if results[0].Passed != tt.wantPassed {
				t.Fatalf("Passed = %v, want %v (issues: %+v)", results[0].Passed, tt.wantPassed, results[0].Issues)
			}
		})
	}
}

func TestBridgeCodebaseValidateFiles_MissingRoot(t *testing.T) {
	t.Parallel()

	missing := filepath.Join(t.TempDir(), "does-not-exist")

	request, err := json.Marshal(map[string]any{"dir": missing})
	if err != nil {
		t.Fatal(err)
	}

	var resp codebaseValidateResponse
	if err := json.Unmarshal([]byte(bridgeCodebaseValidateFiles(string(request))), &resp); err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(resp.Error, codebasefx.ErrUnreadableWalkRoot.Error()) || !strings.Contains(resp.Error, missing) {
		t.Fatalf("expected an error naming %q, got %+v", missing, resp)
	}

	if len(resp.Results) != 0 {
		t.Errorf("expected no validator results, got %d", len(resp.Results))
	}
}
