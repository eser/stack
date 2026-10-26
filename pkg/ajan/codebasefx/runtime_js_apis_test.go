// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx_test

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// runtimeFindings renders each issue as "<line>:<what it found>", the text
// between "API usage: " and the first ";" of its message.
func runtimeFindings(issues []codebasefx.ValidatorIssue) []string {
	found := make([]string, 0, len(issues))

	for _, issue := range issues {
		_, after, _ := strings.Cut(issue.Message, "API usage: ")
		what, _, _ := strings.Cut(after, ";")
		found = append(found, fmt.Sprintf("%d:%s", issue.Line, what))
	}

	return found
}

func TestValidateRuntimeJSAPIs(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		path   string
		source []string
		want   []string
	}{
		{
			name:   "Deno members",
			source: []string{"const text = await Deno.readTextFile(file);", "Deno.exit(1);", "new Deno.Command(\"ls\");"},
			want:   []string{"1:Deno.readTextFile", "2:Deno.exit", "3:Deno.Command"},
		},
		{
			name:   "globalThis.Deno",
			source: []string{"const deno = globalThis.Deno;"},
			want:   []string{"1:globalThis.Deno"},
		},
		{
			name:   "Bun members and globalThis.Bun",
			source: []string{"const child = Bun.spawn([\"ls\"]);", "const version = globalThis.Bun.version;"},
			want:   []string{"1:Bun.spawn", "2:globalThis.Bun.version"},
		},
		{
			name:   "aliased globals",
			source: []string{"const g = globalThis as any;", "if (g.Deno !== undefined) g.Deno.exit(1);", "const b = g.Bun;"},
			want:   []string{"2:g.Deno", "2:g.Deno.exit", "3:g.Bun"},
		},
		{
			name:   "runtime detection with typeof",
			source: []string{"const isDeno = typeof Deno !== \"undefined\";", "const isBun = typeof Bun !== \"undefined\";"},
			want:   []string{"1:Deno", "2:Bun"},
		},
		{
			name:   "test files are checked",
			path:   "pkg/@eserstack/x/mod.test.ts",
			source: []string{"Deno.test(\"x\", () => {});"},
			want:   []string{"1:Deno.test"},
		},
		{
			name:   "a reference inside a template interpolation",
			source: []string{"const url = `${Deno.cwd()}/x ${process.env.API_URL}`;"},
			want:   []string{"1:Deno.cwd", "1:process.env"},
		},
		{
			name: "comments, strings, templates and regexes do not count",
			source: []string{
				"// Deno.exit(1); process.env.TOKEN",
				"/** const text = await Deno.readTextFile(file); Bun.spawn([]); */",
				"const config = \"deno.json\";",
				"const hint = 'Deno.exit(1) and Bun.spawn';",
				"const docs = `Bun.spawn and Deno.exit`;",
				"const rx = /Deno\\.exit/g;",
			},
			want: []string{},
		},
		{
			name:   "names that only contain Deno or Bun",
			source: []string{"const DenoAdapter = 1;", "const isBun = 2;", "const deno = 3;", "x.Denos = BunFfi;"},
			want:   []string{},
		},
		{
			name:   "members of Node's global process",
			source: []string{"const token = process.env.GITHUB_TOKEN;", "process.exit(1);", "const platform = globalThis.process.platform;"},
			want:   []string{"1:process.env", "2:process.exit", "3:globalThis.process.platform"},
		},
		{
			name: "the cross-runtime API",
			source: []string{
				"import { runtime } from \"@eserstack/standards/cross-runtime\";",
				"const cwd = runtime.process.cwd();",
				"const isNode = typeof process !== \"undefined\";",
			},
			want: []string{},
		},
		{
			name: "a file that binds its own process is checked for process.env only",
			source: []string{
				"const process = spawnChild(cmd);",
				"await process.waitForExit();",
				"const token = process.env.TOKEN;",
				"globalThis.process.exit(1);",
			},
			want: []string{"3:process.env", "4:globalThis.process.exit"},
		},
		{
			name:   "a process parameter is a local binding",
			source: []string{"const wait = async (process?: ChildProcess) => await process.waitForExit();"},
			want:   []string{},
		},
		{
			name:   "process destructured from runtime is a local binding",
			source: []string{"const { args, process } = runtime;", "process.exit(1);"},
			want:   []string{},
		},
		{
			name:   "a commented-out declaration is not a binding",
			source: []string{"// const process = spawnChild(cmd);", "process.exit(1);"},
			want:   []string{"2:process.exit"},
		},
		{
			name:   "the cross-runtime layer is not checked",
			path:   "pkg/@eserstack/standards/cross-runtime/adapters/node.ts",
			source: []string{"export const cwd = () => process.cwd();"},
			want:   []string{},
		},
		{
			name:   "other files are not checked",
			path:   "README.md",
			source: []string{"Deno.exit(1);"},
			want:   []string{},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			path := tc.path
			if path == "" {
				path = "pkg/@eserstack/x/mod.ts"
			}

			issues := codebasefx.ValidateRuntimeJSAPIs(path, []byte(strings.Join(tc.source, "\n")+"\n"))
			if got := runtimeFindings(issues); !slices.Equal(got, tc.want) {
				t.Errorf("found %q, want %q", got, tc.want)
			}
		})
	}
}

func TestValidateRuntimeJSAPIsMessages(t *testing.T) {
	t.Parallel()

	tests := []struct {
		source string
		want   string
	}{
		{
			source: "const token = process.env.TOKEN;",
			want:   "direct Node.js API usage: process.env; use runtime.env.get() from @eserstack/standards/cross-runtime (javascript-practices: Cross-Runtime APIs)",
		},
		{
			source: "Deno.exit(1);",
			want:   "direct Deno API usage: Deno.exit; use runtime.process.exit() from @eserstack/standards/cross-runtime (javascript-practices: Cross-Runtime APIs)",
		},
		{
			source: "const b = Bun.spawn([]);",
			want:   "direct Bun API usage: Bun.spawn; use runtime.exec.spawn() (or @eserstack/shell/exec) from @eserstack/standards/cross-runtime (javascript-practices: Cross-Runtime APIs)",
		},
		{
			source: "const t = process.hrtime();",
			want:   "direct Node.js API usage: process.hrtime; use the matching runtime API from @eserstack/standards/cross-runtime (javascript-practices: Cross-Runtime APIs)",
		},
	}

	for _, tc := range tests {
		t.Run(tc.source, func(t *testing.T) {
			t.Parallel()

			issues := codebasefx.ValidateRuntimeJSAPIs("mod.ts", []byte(tc.source))
			if len(issues) != 1 || issues[0].Message != tc.want || issues[0].Severity != "error" {
				t.Errorf("issues %+v, want one error %q", issues, tc.want)
			}
		})
	}
}
