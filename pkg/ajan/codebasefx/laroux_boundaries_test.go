// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

const (
	runtimeFile = "pkg/@eserstack/laroux-server/runtime/server.ts"
	bundlerFile = "pkg/@eserstack/bundler/css/mod.ts"
	larouxFile  = "pkg/@eserstack/laroux/config/mod.ts"
	otherFile   = "pkg/@eserstack/other/mod.ts"
)

func writeLarouxTree(t *testing.T, files map[string]string) string {
	t.Helper()

	root := t.TempDir()

	for name, content := range files {
		path := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	return root
}

func checkLaroux(t *testing.T, root string, allowlist codebasefx.LarouxImporterAllowlist) codebasefx.LarouxBoundariesResult {
	t.Helper()

	files, err := codebasefx.WalkSourceFiles(context.Background(), codebasefx.WalkOptions{Root: root}) //nolint:exhaustruct
	if err != nil {
		t.Fatal(err)
	}

	result, err := codebasefx.CheckLarouxBoundaries(root, allowlist, files)
	if err != nil {
		t.Fatal(err)
	}

	return result
}

func TestCheckLarouxBoundaries_Rules(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		file     string
		source   string
		wantRule string // a part of the message; empty means the import is allowed
	}{
		// laroux-server/runtime/ never imports cli/ or dev/.
		{"runtime imports cli/", runtimeFile, `import * as a from "../cli/mod.ts";`, "never imports cli/ or dev/"},
		{"runtime imports dev/", runtimeFile, `import * as a from "../dev/watcher.ts";`, "never imports cli/ or dev/"},
		{"runtime imports dev/ from a sub-directory", "pkg/@eserstack/laroux-server/runtime/seo/a.ts", `import * as a from "../../dev/watcher.ts";`, "never imports cli/ or dev/"},
		{"runtime imports cli.ts", runtimeFile, `import * as a from "../cli.ts";`, "never imports cli/ or dev/"},
		{"runtime imports commands/", runtimeFile, `import * as a from "../commands/dev.ts";`, "never imports cli/ or dev/"},
		{"runtime imports the cli export", runtimeFile, `import * as a from "@eserstack/laroux-server/cli";`, "never imports cli/ or dev/"},
		{"runtime imports a commands export", runtimeFile, `import * as a from "@eserstack/laroux-server/commands/dev";`, "never imports cli/ or dev/"},
		{"runtime test imports dev/", "pkg/@eserstack/laroux-server/runtime/server.test.ts", `import * as a from "../dev/watcher.ts";`, "never imports cli/ or dev/"},
		{"runtime imports a dev module dynamically", runtimeFile, "const a = await import(`../dev/${name}.ts`);", "never imports cli/ or dev/"},
		{"runtime imports its siblings", runtimeFile, `import * as a from "./html-shell.ts";`, ""},
		{"runtime imports a dev directory of its own", runtimeFile, `import * as a from "./dev/x.ts";`, ""},
		{"runtime imports domain/", runtimeFile, `import * as a from "../domain/renderer.ts";`, ""},
		{"runtime imports a name that starts like cli", runtimeFile, `import * as a from "../client/mod.ts";`, ""},
		{"runtime imports another export", runtimeFile, `import * as a from "@eserstack/laroux-server/config";`, ""},
		{"runtime imports another package's dev/", runtimeFile, `import * as a from "@eserstack/other/dev";`, ""},
		{"cli imports dev/ outside the runtime", "pkg/@eserstack/laroux-server/cli/mod.ts", `import * as a from "../dev/watcher.ts";`, ""},

		// bundler never imports react or a laroux package.
		{"bundler imports react", bundlerFile, `import * as a from "react";`, "free of React"},
		{"bundler imports a react sub-path", bundlerFile, `import * as a from "react/jsx-runtime";`, "free of React"},
		{"bundler imports react-dom", bundlerFile, `import * as a from "react-dom/server";`, "free of React"},
		{"bundler imports the flight runtime", bundlerFile, `import * as a from "react-server-dom-webpack/client";`, "free of React"},
		{"bundler imports @eserstack/laroux", bundlerFile, `import * as a from "@eserstack/laroux/config";`, "free of React"},
		{"bundler imports laroux-server", bundlerFile, `import * as a from "@eserstack/laroux-server";`, "free of React"},
		{"bundler imports the laroux npm package", bundlerFile, `import * as a from "laroux";`, "free of React"},
		{"bundler reaches laroux by a relative path", bundlerFile, `import * as a from "../../laroux/config/mod.ts";`, "free of React"},
		{"bundler test imports react", "pkg/@eserstack/bundler/css/mod.test.ts", `import * as a from "react";`, "free of React"},
		{"bundler imports rolldown", bundlerFile, `import * as a from "rolldown";`, ""},
		{"bundler imports its siblings", bundlerFile, `import * as a from "./types.ts";`, ""},
		{"bundler imports a generic package", bundlerFile, `import * as a from "@eserstack/standards/cross-runtime";`, ""},
		{"bundler imports a name that starts like react", bundlerFile, `import * as a from "reactive";`, ""},
		{"bundler names react in a string", bundlerFile, `export const external = ["react", "@eserstack/laroux"];`, ""},
		{"another package imports react", otherFile, `import * as a from "react";`, ""},

		// @eserstack/laroux never imports bundler or laroux-server.
		{"laroux imports bundler", larouxFile, `import * as a from "@eserstack/bundler";`, "never imports the tool"},
		{"laroux imports a bundler sub-path", larouxFile, `import type { A } from "@eserstack/bundler/types";`, "never imports the tool"},
		{"laroux imports laroux-server", larouxFile, `import * as a from "@eserstack/laroux-server/config";`, "never imports the tool"},
		{"laroux imports the laroux npm package", larouxFile, `import * as a from "laroux";`, "never imports the tool"},
		{"laroux reaches bundler by a relative path", larouxFile, `import * as a from "../../bundler/mod.ts";`, "never imports the tool"},
		{"laroux reaches laroux-server by a relative path", larouxFile, `import * as a from "../../laroux-server/main.ts";`, "never imports the tool"},
		{"laroux imports its siblings", larouxFile, `import * as a from "./types.ts";`, ""},
		{"laroux imports react", larouxFile, `import * as a from "react";`, ""},
		{"laroux names laroux-server in a string", larouxFile, `export const ids = ["@eserstack/laroux-server"];`, ""},
		{"laroux-server imports bundler", "pkg/@eserstack/laroux-server/commands/build.ts", `import * as a from "@eserstack/bundler";`, ""},
		{"laroux-server imports laroux", "pkg/@eserstack/laroux-server/commands/build.ts", `import * as a from "@eserstack/laroux/config";`, ""},

		// Nothing imports @tanstack/*.
		{"a package imports tanstack", otherFile, `import * as a from "@tanstack/react-query";`, "decision-53"},
		{"a script imports a tanstack sub-path", "etc/scripts/a.mjs", `import a from "@tanstack/start/server";`, "decision-53"},
		{"tsx imports tanstack", "pkg/@eserstack/other/a.tsx", `import * as a from "@tanstack/react-router";`, "decision-53"},
		{"a recipe imports tanstack", ".eser/recipes/app/a.ts", `import * as a from "@tanstack/react-router";`, "decision-53"},
		{"a scope that only starts like tanstack", otherFile, `import * as a from "@tanstack-like/query";`, ""},

		// Every way to write an import is read.
		{"a type import", otherFile, `import type { A } from "@tanstack/q";`, "decision-53"},
		{"a named import over lines", otherFile, "import {\n  a,\n  b as c,\n} from \"@tanstack/q\";", "decision-53"},
		{"a default and named import", otherFile, `import a, { b } from "@tanstack/q";`, "decision-53"},
		{"a namespace import", otherFile, `import d, * as a from "@tanstack/q";`, "decision-53"},
		{"an import named from", otherFile, `import from from "@tanstack/q";`, "decision-53"},
		{"a named import of from", otherFile, `import { from } from "@tanstack/q";`, "decision-53"},
		{"a side-effect import", otherFile, `import "@tanstack/q";`, "decision-53"},
		{"a dynamic import", otherFile, `const a = await import("@tanstack/q");`, "decision-53"},
		{"a template dynamic import", otherFile, "const a = await import(`@tanstack/q`);", "decision-53"},
		{"a dynamic import with substitutions", otherFile, "const a = await import(`@tanstack/${name}`);", "decision-53"},
		{"an import in a template substitution", otherFile, "const a = `${await import(\"@tanstack/q\")}`;", "decision-53"},
		{"an import type", otherFile, `type A = typeof import("@tanstack/q");`, "decision-53"},
		{"a re-export", otherFile, `export { a } from "@tanstack/q";`, "decision-53"},
		{"a type re-export", otherFile, `export type { A } from "@tanstack/q";`, "decision-53"},
		{"a star re-export", otherFile, `export * from "@tanstack/q";`, "decision-53"},
		{"a named star re-export", otherFile, `export * as a from "@tanstack/q";`, "decision-53"},
		{"a require call", "etc/a.cjs", `const a = require("@tanstack/q");`, "decision-53"},
		{"an import equals", otherFile, `import a = require("@tanstack/q");`, "decision-53"},
		{"an import.meta.resolve call", otherFile, `const a = import.meta.resolve("@tanstack/q");`, "decision-53"},
		{"an npm: specifier with a version", otherFile, `import * as a from "npm:@tanstack/q@5";`, "decision-53"},
		{"a comment between the words", otherFile, `import /* c */ * as a /* c */ from /* c */ "@tanstack/q";`, "decision-53"},
		{"an npm: react with a version", bundlerFile, `import * as a from "npm:react@19";`, "free of React"},

		// Text that is not an import.
		{"a line comment", otherFile, `// import * as a from "@tanstack/q";`, ""},
		{"a block comment", otherFile, "/*\n * import * as a from \"@tanstack/q\";\n */", ""},
		{"a string", otherFile, `export const a = 'import * as b from "@tanstack/q"';`, ""},
		{"a template", otherFile, "export const a = `import * as b from \"@tanstack/q\"`;", ""},
		{"a regular expression", otherFile, `export const a = /import "@tanstack\/q"/;`, ""},
		{"a method named import", otherFile, `loader.import("@tanstack/q");`, ""},
		{"a method named require", otherFile, `loader.require("@tanstack/q");`, ""},
		{"a property named import", otherFile, `export const a = { import: "@tanstack/q" };`, ""},
		{"an exported const", otherFile, `export const from = "@tanstack/q";`, ""},
		{"an exported type", otherFile, `export type A = "@tanstack/q";`, ""},
		{"a module declaration", otherFile, `declare module "@tanstack/q" {}`, ""},
		{"a computed specifier", otherFile, `const a = await import(toUrl("@tanstack/q"));`, ""},
		{"a file that is not code", "pkg/@eserstack/other/README.md", `import * as a from "@tanstack/q";`, ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			result := checkLaroux(t, writeLarouxTree(t, map[string]string{tc.file: tc.source + "\n"}), nil)

			if tc.wantRule == "" {
				if len(result.Issues) != 0 {
					t.Errorf("want no issue, got %+v", result.Issues)
				}

				return
			}

			if len(result.Issues) != 1 {
				t.Fatalf("want one issue, got %+v", result.Issues)
			}

			issue := result.Issues[0]
			if issue.File != tc.file || issue.Severity != "error" || !strings.Contains(issue.Message, tc.wantRule) {
				t.Errorf("want an error in %s naming %q, got %+v", tc.file, tc.wantRule, issue)
			}
		})
	}
}

func TestCheckLarouxBoundaries_ReportsLineAndSpecifier(t *testing.T) {
	t.Parallel()

	root := writeLarouxTree(t, map[string]string{otherFile: "export {};\n\nimport {\n  a,\n} from \"@tanstack/q\";\n"})

	result := checkLaroux(t, root, nil)
	if len(result.Issues) != 1 || result.Issues[0].Line != 5 || !strings.Contains(result.Issues[0].Message, `imports "@tanstack/q"`) {
		t.Errorf("issues: %+v", result.Issues)
	}

	if result.FilesChecked != 1 {
		t.Errorf("files checked: %d", result.FilesChecked)
	}
}

func TestCheckLarouxBoundaries_DeprecatedPackages(t *testing.T) {
	t.Parallel()

	const (
		bundler = "@eserstack/laroux-bundler"
		react   = "@eserstack/laroux-react"
	)

	tests := []struct {
		name      string
		files     map[string]string
		allowlist codebasefx.LarouxImporterAllowlist
		want      []string // "<file> <part of the message>", in order
	}{
		{
			name:  "a new importer of laroux-bundler fails",
			files: map[string]string{otherFile: `import * as a from "@eserstack/laroux-bundler";`},
			want:  []string{otherFile + " " + bundler + " is deprecated"},
		},
		{
			name:  "a new importer of a laroux-react sub-path fails",
			files: map[string]string{otherFile: `import * as a from "@eserstack/laroux-react/client";`},
			want:  []string{otherFile + " " + react + " is deprecated"},
		},
		{
			name:  "a new importer by a relative path fails",
			files: map[string]string{"etc/scripts/a.ts": `import * as a from "../../pkg/@eserstack/laroux-react/mod.ts";`},
			want:  []string{"etc/scripts/a.ts " + react + " is deprecated"},
		},
		{
			name:      "a listed importer passes",
			files:     map[string]string{otherFile: `import * as a from "@eserstack/laroux-bundler/system";`},
			allowlist: codebasefx.LarouxImporterAllowlist{bundler: {otherFile}},
		},
		{
			name:      "an entry holds for its own package only",
			files:     map[string]string{otherFile: "import * as a from \"@eserstack/laroux-bundler\";\nimport * as b from \"@eserstack/laroux-react\";\n"},
			allowlist: codebasefx.LarouxImporterAllowlist{bundler: {otherFile}},
			want:      []string{otherFile + " " + react + " is deprecated"},
		},
		{
			name:      "a stale entry of a file that dropped the import fails",
			files:     map[string]string{otherFile: `import * as a from "@eserstack/laroux/config";`},
			allowlist: codebasefx.LarouxImporterAllowlist{bundler: {otherFile}},
			want:      []string{otherFile + " stale allowlist entry"},
		},
		{
			name:      "a stale entry of a file that only mentions the package fails",
			files:     map[string]string{otherFile: `// import * as a from "@eserstack/laroux-react";`},
			allowlist: codebasefx.LarouxImporterAllowlist{react: {otherFile}},
			want:      []string{otherFile + " stale allowlist entry"},
		},
		{
			name:      "a stale entry of a deleted file fails",
			files:     map[string]string{otherFile: "export {};"},
			allowlist: codebasefx.LarouxImporterAllowlist{react: {"pkg/@eserstack/gone/mod.ts"}},
			want:      []string{"pkg/@eserstack/gone/mod.ts stale allowlist entry"},
		},
		{
			name:  "the package's own imports are not the rule's business",
			files: map[string]string{"pkg/@eserstack/laroux-react/a.ts": "import * as a from \"@eserstack/laroux-react/b\";\nimport * as b from \"./c.ts\";\n"},
		},
		{
			name:  "laroux-bundler importing laroux-react is an importer too",
			files: map[string]string{"pkg/@eserstack/laroux-bundler/a.ts": `import * as a from "@eserstack/laroux-react/protocol";`},
			want:  []string{"pkg/@eserstack/laroux-bundler/a.ts " + react + " is deprecated"},
		},
		{
			name:  "a mention in a string is no import",
			files: map[string]string{otherFile: `export const name = "@eserstack/laroux-react";`},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			result := checkLaroux(t, writeLarouxTree(t, tc.files), tc.allowlist)

			if len(result.Issues) != len(tc.want) {
				t.Fatalf("want %d issues, got %+v", len(tc.want), result.Issues)
			}

			for i, want := range tc.want {
				got := result.Issues[i]
				file, part, _ := strings.Cut(want, " ")

				if got.File != file || !strings.Contains(got.Message, part) {
					t.Errorf("issue %d: want %q, got %+v", i, want, got)
				}
			}
		})
	}
}

func TestReadLarouxImporterAllowlist(t *testing.T) {
	t.Parallel()

	root := writeLarouxTree(t, map[string]string{
		"good.json":    `{"@eserstack/laroux-react": ["a.ts"]}`,
		"broken.json":  `{`,
		"unknown.json": `{"@eserstack/other": ["a.ts"]}`,
	})

	good, err := codebasefx.ReadLarouxImporterAllowlist(filepath.Join(root, "good.json"))
	if err != nil || fmt.Sprint(good["@eserstack/laroux-react"]) != "[a.ts]" {
		t.Errorf("good: %v, %v", good, err)
	}

	missing, err := codebasefx.ReadLarouxImporterAllowlist(filepath.Join(root, "missing.json"))
	if err != nil || len(missing) != 0 {
		t.Errorf("a missing file is an empty allowlist: %v, %v", missing, err)
	}

	if _, err := codebasefx.ReadLarouxImporterAllowlist(filepath.Join(root, "broken.json")); err == nil || !strings.Contains(err.Error(), "broken.json") {
		t.Errorf("broken: %v", err)
	}

	if _, err := codebasefx.ReadLarouxImporterAllowlist(filepath.Join(root, "unknown.json")); !errors.Is(err, codebasefx.ErrInvalidOption) {
		t.Errorf("an unknown key: %v", err)
	}
}

// TestLarouxImporterAllowlist_OnlyShrinks holds the committed allowlist to the
// snapshot of its first version. Removing an entry needs nothing here; an entry
// the snapshot lacks is a new importer of a deprecated package and fails. The
// snapshot never grows, and it is deleted with the allowlist.
func TestLarouxImporterAllowlist_OnlyShrinks(t *testing.T) {
	t.Parallel()

	committed, err := codebasefx.ReadLarouxImporterAllowlist(filepath.Join("../../..", codebasefx.DefaultLarouxImporterAllowlist))
	if err != nil {
		t.Fatal(err)
	}

	snapshot, err := codebasefx.ReadLarouxImporterAllowlist("testdata/laroux_deprecated_importers_snapshot.json")
	if err != nil {
		t.Fatal(err)
	}

	if len(snapshot) == 0 {
		t.Fatal("the snapshot is empty")
	}

	for pkg, files := range committed {
		for _, file := range files {
			if !slices.Contains(snapshot[pkg], file) {
				t.Errorf("%s is a new importer of %s: the allowlist only shrinks", file, pkg)
			}
		}
	}
}
