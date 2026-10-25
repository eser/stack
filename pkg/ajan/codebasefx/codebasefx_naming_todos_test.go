// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx_test

import (
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

func TestValidateNamingAndTodos(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		path      string
		source    string
		wantLines []int // lines of the expected issues, in order
		wantText  string
	}{
		// --- TODO and FIXME ---
		{
			name:      "untagged TODO in a line comment",
			path:      "a.ts",
			source:    "const x = 1;\n// TODO: remove this\n",
			wantLines: []int{2},
			wantText:  "TODO without a task tag",
		},
		{
			name:      "untagged FIXME in a block comment",
			path:      "a.ts",
			source:    "/*\n * first line\n * FIXME later\n */\nconst x = 1;\n",
			wantLines: []int{3},
			wantText:  "FIXME without a task tag",
		},
		{
			name:   "tagged TODO and FIXME pass",
			path:   "a.ts",
			source: "// TODO(TASK-12): wire the cache\n/* FIXME(TASK-7) */\n",
		},
		{
			name:   "TODO inside a string passes",
			path:   "a.ts",
			source: "const prompt = \"TODO: list the steps // and more\";\n",
		},
		{
			name:   "TODO inside a template literal passes",
			path:   "a.ts",
			source: "const prompt = `Write a TODO list ${count} // TODO here too`;\n",
		},
		{
			name:      "TODO in a comment inside a template substitution fails",
			path:      "a.ts",
			source:    "const s = `a ${value /* TODO */} b`;\n",
			wantLines: []int{1},
			wantText:  "TODO without a task tag",
		},
		{
			name:   "TODO inside a nested template passes",
			path:   "a.ts",
			source: "const s = `outer ${`inner TODO ${x}`} end`;\n",
		},
		{
			name:   "regex with slashes is not a comment",
			path:   "a.ts",
			source: "const re = /\\/\\/ TODO [/]x/g;\nconst ok = 1;\n",
		},
		{
			name:      "division is not a regex",
			path:      "a.ts",
			source:    "const half = total / 2; // TODO check\n",
			wantLines: []int{1},
			wantText:  "TODO without a task tag",
		},
		{
			name:   "TODOs is not a TODO marker",
			path:   "a.ts",
			source: "// see TODOs.md for the list\n",
		},
		{
			name:      "unterminated quote in JSX text ends at the line",
			path:      "a.tsx",
			source:    "const el = <p>Don't stop</p>;\n// TODO wire it\n",
			wantLines: []int{2},
			wantText:  "TODO without a task tag",
		},
		{
			name:   "files that are not JavaScript or TypeScript are skipped",
			path:   "notes.md",
			source: "TODO everything\n",
		},
		// --- naming ---
		{
			name:   "camelCase, PascalCase and SCREAMING_SNAKE_CASE pass",
			path:   "a.ts",
			source: "const userId = 1;\nlet MAX_SIZE = 2;\nfunction loadUser() {}\nclass UserStore {}\ninterface UserRow {}\ntype UserMap = Map<string, User>;\nenum Mode { A }\nconst _private = 3;\nconst $el = 4;\n",
		},
		{
			name:      "snake_case declarations fail",
			path:      "a.ts",
			source:    "const user_id = 1;\nfunction load_user() {}\nclass User_Store {}\n",
			wantLines: []int{1, 2, 3},
			wantText:  "is not camelCase",
		},
		{
			name:      "a generator function name is checked",
			path:      "a.js",
			source:    "function* walk_tree() {}\n",
			wantLines: []int{1},
			wantText:  `"walk_tree"`,
		},
		{
			name:   "snake_case outside declarations passes",
			path:   "a.ts",
			source: "const body = { max_tokens: 10 };\nbody.max_tokens = 20;\nsend(res.files_checked);\nobj.type = \"x\";\nimport type { Foo } from \"./foo.ts\";\n",
		},
		{
			name:   "snake_case in strings and comments passes",
			path:   "a.ts",
			source: "const sql = \"select user_id\";\n// const user_id = 1;\nconst t = `let user_id`;\n",
		},
		{
			name:   "keywords used as property names are not declarations",
			path:   "a.ts",
			source: "x.const = 1;\ny.type = foo_bar;\n",
		},
		{
			name:   "underscore-only names pass",
			path:   "a.ts",
			source: "const _ = 1;\nconst __ = 2;\n",
		},
	}

	validate := codebasefx.ValidateNamingAndTodos(nil)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			issues := validate(tt.path, []byte(tt.source))

			if len(issues) != len(tt.wantLines) {
				t.Fatalf("got %d issues %+v, want lines %v", len(issues), issues, tt.wantLines)
			}

			for i, iss := range issues {
				if iss.Line != tt.wantLines[i] {
					t.Errorf("issue %d on line %d, want %d (%s)", i, iss.Line, tt.wantLines[i], iss.Message)
				}

				if !strings.Contains(iss.Message, tt.wantText) {
					t.Errorf("issue %d message %q, want it to contain %q", i, iss.Message, tt.wantText)
				}
			}
		})
	}
}

func TestValidateNamingAndTodos_AllowList(t *testing.T) {
	t.Parallel()

	validate := codebasefx.ValidateNamingAndTodos([]string{"grant_type"})

	issues := validate("a.ts", []byte("const grant_type = \"code\";\nconst other_name = 1;\n"))
	if len(issues) != 1 || issues[0].Line != 2 {
		t.Fatalf("expected one issue on line 2, got %+v", issues)
	}
}
