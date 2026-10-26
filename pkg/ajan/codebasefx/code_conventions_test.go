// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package codebasefx_test

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

func TestFindCodeConventionViolations(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		source string
		want   []string // "rule:line"
	}{
		{name: "a namespace import", source: `import * as path from "@std/path";`},
		{name: "a named import", source: `import { join } from "@std/path";`, want: []string{"namespace-import:1"}},
		{name: "a default import", source: "\nimport React from \"react\";", want: []string{"namespace-import:2"}},
		{name: "a type import", source: `import type { Foo } from "./foo.ts";`},
		{name: "named type imports only", source: `import { type A, type B } from "./x.ts";`},
		{name: "a mixed named import", source: `import { type A, b } from "./x.ts";`, want: []string{"namespace-import:1"}},
		{name: "the cross-runtime import", source: `import { runtime } from "@eserstack/standards/cross-runtime";`},
		{name: "a JSON default import", source: `import data from "./a.json" with { type: "json" };`},
		{name: "a CSS module default import", source: `import styles from "./x.module.css";`},
		{name: "a multi-line named import", source: "import {\n  a,\n  b,\n} from \"./x.ts\";", want: []string{"namespace-import:1"}},
		{name: "an import inside a comment", source: "// import { a } from \"./x.ts\";\n/* import { b } from \"./y.ts\"; */"},
		{name: "an import inside a template", source: "const s = `\nimport { a } from \"./x.ts\";\n`;"},
		{name: "a string default", source: `const a = value || "";`, want: []string{"or-default:1"}},
		{name: "array, object, number, null and new defaults", source: "a || []\nb || {}\nc || -1\nd || null\ne || new Map()", want: []string{"or-default:1", "or-default:2", "or-default:3", "or-default:4", "or-default:5"}},
		{name: "a boolean condition", source: `if (a || b) {}`},
		{name: "|| inside a string", source: `const s = "a || ''";`},
		{name: "|| after a regex with quotes", source: "const r = /[\"'`]/g;\nconst x = a || \"\";", want: []string{"or-default:2"}},
		{name: "export star", source: `export * from "./a.ts";`, want: []string{"export-star:1"}},
		{name: "export type star", source: `export type * from "./a.ts";`, want: []string{"export-star:1"}},
		{name: "a namespace re-export", source: `export * as a from "./a.ts";`},
		{name: "sorted by line", source: "export * from \"./a.ts\";\nimport { b } from \"./b.ts\";", want: []string{"export-star:1", "namespace-import:2"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			var got []string
			for _, v := range codebasefx.FindCodeConventionViolations([]byte(tc.source)) {
				got = append(got, v.Rule+":"+strconv.Itoa(v.Line))
			}

			if strings.Join(got, ",") != strings.Join(tc.want, ",") {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestFindCodeConventionViolations_Messages(t *testing.T) {
	t.Parallel()

	got := codebasefx.FindCodeConventionViolations([]byte("import { a } from \"./x.ts\";\nexport * from \"./y.ts\";\nz || 0;"))
	want := []string{
		"import from \"./x.ts\" is not a namespace import; use `import * as name from \"./x.ts\"` (javascript-practices: Imports)",
		"`export * from \"./y.ts\"` re-exports the whole module; export the names explicitly (`export { name } from \"./y.ts\"`) or as a namespace (`export * as name from \"./y.ts\"`) (javascript-practices: Avoid Re-exports)",
		"default value after `||` also replaces 0 and \"\"; use `??`, or an explicit check when an empty value must fall back too (javascript-practices: Explicit Checks)",
	}

	if len(got) != len(want) {
		t.Fatalf("got %d violations: %+v", len(got), got)
	}

	for i := range want {
		if got[i].Message != want[i] {
			t.Errorf("message %d:\n got %s\nwant %s", i, got[i].Message, want[i])
		}
	}
}

func TestValidateCodeConventions_Baseline(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	file := filepath.Join(root, "pkg/a.ts")
	content := []byte("import { a } from \"./x.ts\";\nimport { b } from \"./y.ts\";\n")

	cases := []struct {
		name     string
		baseline codebasefx.CodeConventionsBaseline
		want     []string
	}{
		{name: "no baseline", baseline: nil, want: []string{
			`import from "./x.ts" is not a namespace import`,
			`import from "./y.ts" is not a namespace import`,
		}},
		{name: "the baseline allows both", baseline: codebasefx.CodeConventionsBaseline{"namespace-import": {"pkg/a.ts": 2}}},
		{name: "the baseline allows one", baseline: codebasefx.CodeConventionsBaseline{"namespace-import": {"pkg/a.ts": 1}}, want: []string{
			"[2 in this file, baseline allows 1]",
			"[2 in this file, baseline allows 1]",
		}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			issues := codebasefx.ValidateCodeConventions(root, tc.baseline)(file, content)
			if len(issues) != len(tc.want) {
				t.Fatalf("got %d issues: %+v", len(issues), issues)
			}

			for i, want := range tc.want {
				if !strings.Contains(issues[i].Message, want) {
					t.Errorf("issue %d %q should contain %q", i, issues[i].Message, want)
				}
			}
		})
	}

	ignored := codebasefx.ValidateCodeConventions(root, nil)
	for _, path := range []string{".eser/recipes/app/main.ts", "etc/temp/x.ts", "pkg/b/node_modules/c.ts", "pkg/b/README.md"} {
		if issues := ignored(filepath.Join(root, path), content); len(issues) != 0 {
			t.Errorf("%s should be skipped, got %+v", path, issues)
		}
	}
}

func TestWriteCodeConventionsBaseline_Format(t *testing.T) {
	t.Parallel()

	root := t.TempDir()

	files := map[string]string{
		"pkg/b.ts":       "import { a } from \"./x.ts\";\nimport { b } from \"./y.ts\";\n",
		"pkg/a-b.ts":     "x || \"\";\n",
		"pkg/a_b.ts":     "export * from \"./z.ts\";\n",
		"pkg/A.ts":       "import { a } from \"./x.ts\";\n",
		"pkg/clean.ts":   "import * as a from \"./x.ts\";\n",
		"etc/temp/x.ts":  "import { a } from \"./x.ts\";\n",
		"pkg/notes.md":   "import { a } from \"./x.ts\";\n",
		"pkg/a/index.ts": "import { a } from \"./x.ts\";\n",
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

	total, err := codebasefx.WriteCodeConventionsBaseline(context.Background(), root, ".eser/baselines/code-conventions.json")
	if err != nil {
		t.Fatal(err)
	}

	if total != 6 {
		t.Errorf("total %d, want 6", total)
	}

	got, err := os.ReadFile(filepath.Join(root, ".eser/baselines/code-conventions.json")) //nolint:gosec // G304: a test temp dir
	if err != nil {
		t.Fatal(err)
	}

	// The rules in their fixed order, paths in localeCompare order (case and
	// punctuation are secondary), empty rules as {}, a final newline.
	want := `{
  "namespace-import": {
    "pkg/A.ts": 1,
    "pkg/a/index.ts": 1,
    "pkg/b.ts": 2
  },
  "or-default": {
    "pkg/a-b.ts": 1
  },
  "export-star": {
    "pkg/a_b.ts": 1
  }
}
`
	if string(got) != want {
		t.Errorf("baseline:\n%s\nwant:\n%s", got, want)
	}

	read, err := codebasefx.ReadCodeConventionsBaseline(filepath.Join(root, ".eser/baselines/code-conventions.json"))
	if err != nil || read["namespace-import"]["pkg/b.ts"] != 2 {
		t.Errorf("read back: %+v, %v", read, err)
	}

	empty, err := codebasefx.ReadCodeConventionsBaseline(filepath.Join(root, "missing.json"))
	if err != nil || len(empty["or-default"]) != 0 {
		t.Errorf("a missing baseline should read as empty: %+v, %v", empty, err)
	}

	if err := os.WriteFile(filepath.Join(root, "bad.json"), []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}

	if _, err := codebasefx.ReadCodeConventionsBaseline(filepath.Join(root, "bad.json")); err == nil || !strings.Contains(err.Error(), "regenerate it with --write-baseline") {
		t.Errorf("a broken baseline: %v", err)
	}
}

// TestWriteCodeConventionsBaseline_RepoMatchesCommitted writes the baseline
// for this repository and compares it with the committed file, which the
// TypeScript --write-baseline produced.
func TestWriteCodeConventionsBaseline_RepoMatchesCommitted(t *testing.T) {
	t.Parallel()

	repo := "../../.."
	out := filepath.Join(t.TempDir(), "baseline.json")

	if _, err := codebasefx.WriteCodeConventionsBaseline(context.Background(), repo, out); err != nil {
		t.Fatal(err)
	}

	got, err := os.ReadFile(out) //nolint:gosec // G304: a test temp file
	if err != nil {
		t.Fatal(err)
	}

	committed, err := os.ReadFile(filepath.Join(repo, codebasefx.DefaultCodeConventionsBaseline))
	if err != nil {
		t.Fatal(err)
	}

	if string(got) != string(committed) {
		t.Errorf("the Go baseline differs from the committed one:\n%s\ncommitted:\n%s", got, committed)
	}
}
