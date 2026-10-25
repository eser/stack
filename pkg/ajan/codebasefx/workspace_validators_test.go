// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx_test

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// missingFiles returns the reported files as "package: file", sorted.
func missingFiles(result codebasefx.ModExportsResult) []string {
	out := make([]string, 0, len(result.MissingExports))
	for _, m := range result.MissingExports {
		out = append(out, m.PackageName+": "+m.File)
	}

	slices.Sort(out)

	return out
}

func TestCheckModExports_Reachability(t *testing.T) {
	t.Parallel()

	const root = `{"workspaces": ["pkg/*"]}`

	cases := []struct {
		name  string
		files []workspaceFile
		want  []string
	}{
		{
			name: "namespace re-export from mod.ts",
			files: []workspaceFile{
				{path: "pkg/a/package.json", content: `{"name": "a", "exports": {".": "./mod.ts"}}`},
				{path: "pkg/a/mod.ts", content: `export * as results from "./results.ts";` + "\n"},
				{path: "pkg/a/results.ts", content: "export const ok = 1;\n"},
			},
			want: []string{},
		},
		{
			name: "sub-path in the exports map",
			files: []workspaceFile{
				{
					path:    "pkg/a/package.json",
					content: `{"name": "a", "exports": {".": "./mod.ts", "./span": "./span.ts"}}`,
				},
				{path: "pkg/a/mod.ts", content: "export const x = 1;\n"},
				{path: "pkg/a/span.ts", content: "export const bold = 1;\n"},
			},
			want: []string{},
		},
		{
			name: "internal module reached through a subdirectory",
			files: []workspaceFile{
				{path: "pkg/a/package.json", content: `{"name": "a", "exports": {".": "./main.ts"}}`},
				{path: "pkg/a/main.ts", content: `import * as cmd from "./commands/run.ts";` + "\n"},
				{path: "pkg/a/commands/run.ts", content: `import * as ffi from "../ffi-client.ts";` + "\n"},
				{path: "pkg/a/ffi-client.ts", content: "export const load = 1;\n"},
			},
			want: []string{},
		},
		{
			name: "dynamic import, worker url and implicit extension",
			files: []workspaceFile{
				{path: "pkg/a/package.json", content: `{"name": "a"}`},
				{
					path: "pkg/a/mod.ts",
					content: `const m = await import("./lazy.ts");` + "\n" +
						`new Worker(new URL("./worker.ts", import.meta.url));` + "\n" +
						`export { x } from "./sloppy";` + "\n",
				},
				{path: "pkg/a/lazy.ts", content: "export const a = 1;\n"},
				{path: "pkg/a/worker.ts", content: "export const b = 1;\n"},
				{path: "pkg/a/sloppy.ts", content: "export const x = 1;\n"},
			},
			want: []string{},
		},
		{
			name: "package.json main and a program entry",
			files: []workspaceFile{
				{path: "pkg/a/package.json", content: `{"name": "a", "main": "worker-main.ts"}`},
				{path: "pkg/a/worker-main.ts", content: `import * as deps from "./deps.ts";` + "\n"},
				{path: "pkg/a/deps.ts", content: `export * as net from "node:net";` + "\n"},
				{
					path:    "pkg/a/scripts/release.ts",
					content: `import * as targets from "../targets.ts";` + "\nif (import.meta.main) {}\n",
				},
				{path: "pkg/a/targets.ts", content: "export const all = [];\n"},
			},
			want: []string{},
		},
		{
			name: "modules reached only by tests or by nothing",
			files: []workspaceFile{
				{path: "pkg/a/package.json", content: `{"name": "a", "exports": {".": "./mod.ts"}}`},
				{path: "pkg/a/mod.ts", content: "export const x = 1;\n"},
				{path: "pkg/a/mod.test.ts", content: `import * as helper from "./helper.ts";` + "\n"},
				{path: "pkg/a/helper.ts", content: "export const y = 2;\n"},
				{path: "pkg/a/orphan.tsx", content: "export const z = 3;\n"},
				// Tests, benches and private files are never reported.
				{path: "pkg/a/helper.test.ts", content: "\n"},
				{path: "pkg/a/helper_bench.ts", content: "\n"},
				{path: "pkg/a/_internal.ts", content: "\n"},
			},
			want: []string{"a: helper.ts", "a: orphan.tsx"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			files := append([]workspaceFile{{path: "package.json", content: root}}, tc.files...)
			result, err := codebasefx.CheckModExports(writeWorkspace(t, files))
			if err != nil {
				t.Fatalf("CheckModExports: %v", err)
			}

			got := missingFiles(result)
			if !slices.Equal(got, tc.want) {
				t.Errorf("CheckModExports missing = %q, want %q", got, tc.want)
			}

			if result.IsComplete != (len(tc.want) == 0) {
				t.Errorf("CheckModExports IsComplete = %v with missing %q", result.IsComplete, got)
			}
		})
	}
}

func TestCheckPackageConfigs_Dependencies(t *testing.T) {
	t.Parallel()

	const pkgJSON = `{"name": "a", "version": "1.0.0", ` +
		`"dependencies": {"@std/path": "npm:@jsr/std__path@^1.1.6", "b": "workspace:*"}}`

	cases := []struct {
		name     string
		denoJSON string
		want     []string
	}{
		{
			name:     "deno.json without an import map",
			denoJSON: `{"name": "a", "version": "1.0.0"}`,
			want:     []string{},
		},
		{
			name:     "import map in step with package.json",
			denoJSON: `{"name": "a", "version": "1.0.0", "imports": {"@std/path": "jsr:@std/path@^1.1.6"}}`,
			want:     []string{},
		},
		{
			name:     "import map missing a dependency",
			denoJSON: `{"name": "a", "version": "1.0.0", "imports": {"zod": "npm:zod@^4.0.0"}}`,
			want:     []string{"@std/path missing_in_deno", "zod missing_in_package"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			root := writeWorkspace(t, []workspaceFile{
				{path: "package.json", content: `{"workspaces": ["pkg/*"]}`},
				{path: "pkg/a/package.json", content: pkgJSON},
				{path: "pkg/a/deno.json", content: tc.denoJSON},
			})

			result, err := codebasefx.CheckPackageConfigs(root)
			if err != nil {
				t.Fatalf("CheckPackageConfigs: %v", err)
			}

			got := make([]string, 0, len(result.DependencyInconsistencies))
			for _, d := range result.DependencyInconsistencies {
				got = append(got, d.DependencyName+" "+d.Issue)
			}

			slices.Sort(got)

			if !slices.Equal(got, tc.want) {
				t.Errorf("CheckPackageConfigs dependency issues = %q, want %q", got, tc.want)
			}

			if result.IsConsistent != (len(tc.want) == 0) {
				t.Errorf("CheckPackageConfigs IsConsistent = %v with issues %q", result.IsConsistent, got)
			}
		})
	}
}

// TestWorkspaceValidators_EmptyListsAreJSONArrays guards the FFI contract: the
// TypeScript callers read `.length` on these lists, so a clean result must
// encode them as [] and never as null.
func TestWorkspaceValidators_EmptyListsAreJSONArrays(t *testing.T) {
	t.Parallel()

	root := writeWorkspace(t, []workspaceFile{
		{path: "package.json", content: `{"workspaces": ["pkg/*"]}`},
		{path: "pkg/a/package.json", content: `{"name": "a", "version": "1.0.0", "exports": {".": "./mod.ts"}}`},
		{path: "pkg/a/deno.json", content: `{"name": "a", "version": "1.0.0", "exports": {".": "./mod.ts"}}`},
		{path: "pkg/a/mod.ts", content: "/** The answer. */\nexport const x = 1;\n"},
	})

	circular, err := codebasefx.CheckCircularDeps(root)
	if err != nil {
		t.Fatalf("CheckCircularDeps: %v", err)
	}

	names, err := codebasefx.CheckExportNames(root, nil)
	if err != nil {
		t.Fatalf("CheckExportNames: %v", err)
	}

	mods, err := codebasefx.CheckModExports(root)
	if err != nil {
		t.Fatalf("CheckModExports: %v", err)
	}

	configs, err := codebasefx.CheckPackageConfigs(root)
	if err != nil {
		t.Fatalf("CheckPackageConfigs: %v", err)
	}

	docs, err := codebasefx.CheckDocs(root, false)
	if err != nil {
		t.Fatalf("CheckDocs: %v", err)
	}

	results := []struct {
		name  string
		value any
	}{
		{"CheckCircularDeps", circular},
		{"CheckExportNames", names},
		{"CheckModExports", mods},
		{"CheckPackageConfigs", configs},
		{"CheckDocs", docs},
	}

	for _, r := range results {
		t.Run(r.name, func(t *testing.T) {
			t.Parallel()

			data, err := json.Marshal(r.value)
			if err != nil {
				t.Fatalf("marshal %s result: %v", r.name, err)
			}

			if strings.Contains(string(data), "null") {
				t.Errorf("%s result JSON = %s, want [] for every empty list", r.name, data)
			}
		})
	}
}
