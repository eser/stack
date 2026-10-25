// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx_test

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

func TestValidateSelfImports(t *testing.T) {
	t.Parallel()

	source := strings.Join([]string{
		`import * as a from "@eserstack/foo";`,
		`export { b } from "@eserstack/foo/b";`,
		`import "@eserstack/foo/side";`,
		`const c = await import("@eserstack/foo/c");`,
		`// import * as d from "@eserstack/foo";`,
		`import * as e from "@eserstack/foobar";`,
		`} from "@eserstack/foo/multi";`,
	}, "\n")

	issues := codebasefx.ValidateSelfImports("/r/pkg/@eserstack/foo/mod.ts", []byte(source))

	lines := make([]int, 0, len(issues))
	for _, issue := range issues {
		lines = append(lines, issue.Line)
	}

	if fmt.Sprint(lines) != "[1 2 3 4 7]" {
		t.Errorf("lines %v, want [1 2 3 4 7]", lines)
	}

	if !strings.Contains(issues[0].Message, `package imports itself as "@eserstack/foo" — use a relative path`) {
		t.Errorf("message: %s", issues[0].Message)
	}

	if got := codebasefx.ValidateSelfImports("/r/pkg/@eserstack/bar/mod.ts", []byte(source)); len(got) != 0 {
		t.Errorf("another package's imports are fine: %+v", got)
	}

	if got := codebasefx.ValidateSelfImports("/r/pkg/@eserstack/foo/README.md", []byte(source)); len(got) != 0 {
		t.Errorf("non-JS files are skipped: %+v", got)
	}
}

func TestCheckErrorCoverage(t *testing.T) {
	t.Parallel()

	content := []byte(`var catalog = map[string]any{
	ErrA: &NSError{
		Code:  "A",
		Cause: "a",
		Fix:   "f",
	},
	ErrB: &NSError{
		Code:  "B",
		Cause: " ",
	},
	ErrC: &OtherError{
		Code: "",
	},
}`)

	result := codebasefx.CheckErrorCoverage(content, nil, nil)
	if result.Checked != 2 || len(result.Violations) != 1 || result.Violations[0].Name != "ErrB" ||
		strings.Join(result.Violations[0].Missing, ",") != "Cause,Fix" {
		t.Errorf("default objects: %+v", result)
	}

	both := codebasefx.CheckErrorCoverage(content, []string{"NSError", "OtherError"}, []string{"Code"})
	if both.Checked != 3 || len(both.Violations) != 1 || both.Violations[0].Name != "ErrC" {
		t.Errorf("both objects, Code only: %+v", both)
	}

	issues := codebasefx.ValidateErrorCoverage("pkg/errors.go", nil, nil)("/root/pkg/errors.go", content)
	if len(issues) != 1 || issues[0].Message != "ErrB: missing [Cause, Fix]" || issues[0].File != "pkg/errors.go" {
		t.Errorf("validator issues: %+v", issues)
	}

	if other := codebasefx.ValidateErrorCoverage("pkg/errors.go", nil, nil)("/root/pkg/other.go", content); len(other) != 0 {
		t.Errorf("another file is skipped: %+v", other)
	}

	if _, err := codebasefx.ParseErrorCoverageOptions(map[string]any{}); !errors.Is(err, codebasefx.ErrMissingOption) {
		t.Errorf("a missing file option: %v", err)
	}
}

func TestCheckServerLoc(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	files := map[string]string{
		"srv/short.go":      "package srv\n",
		"srv/long.go":       strings.Repeat("x\n", 5),
		"srv/long_test.go":  strings.Repeat("x\n", 9),
		"srv/notes.md":      strings.Repeat("x\n", 9),
		"srv/nested/big.go": strings.Repeat("x\n", 7),
		"other/long.go":     strings.Repeat("x\n", 9),
	}

	for path, content := range files {
		full := filepath.Join(root, path)
		if err := os.MkdirAll(filepath.Dir(full), 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(full, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	violations, checked, err := codebasefx.CheckServerLoc(root, codebasefx.ServerLocOptions{Directory: "srv", MaxLines: 4}) //nolint:exhaustruct
	if err != nil {
		t.Fatal(err)
	}

	// "x\n" five times is six lines, as content.split("\n").length counts.
	if checked != 3 || len(violations) != 2 || violations[0].Lines != 6 {
		t.Errorf("checked %d, violations %+v", checked, violations)
	}

	vf, err := codebasefx.ParseServerLocOptions(map[string]any{"directory": "srv", "maxLines": float64(4)})
	if err != nil {
		t.Fatal(err)
	}

	if issues := vf(filepath.Join(root, "srv/long.go"), []byte(files["srv/long.go"])); len(issues) != 1 || issues[0].Message != "6 lines (limit 4)" {
		t.Errorf("validator issues: %+v", issues)
	}

	if issues := vf(filepath.Join(root, "other/long.go"), []byte(files["other/long.go"])); len(issues) != 0 {
		t.Errorf("a file outside the directory is skipped: %+v", issues)
	}

	if _, err := codebasefx.ParseServerLocOptions(map[string]any{}); !errors.Is(err, codebasefx.ErrMissingOption) {
		t.Errorf("a missing directory option: %v", err)
	}
}
