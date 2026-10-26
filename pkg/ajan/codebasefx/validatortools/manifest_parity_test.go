// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package validatortools_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx/validatortools"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// The validate-* tools check what the TypeScript tools of the same names
// check (manifest_parity.go); each case is a tree the two would disagree on
// without it.

func writeTree(t *testing.T, files map[string]string) string {
	t.Helper()

	root := t.TempDir()

	for name, content := range files {
		path := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	return root
}

func runTool(t *testing.T, name, root string, opts map[string]any) *workflowfx.WorkflowToolResult {
	t.Helper()

	registry := workflowfx.NewRegistry()
	validatortools.RegisterManifestTools(registry)

	tool, ok := registry.Get(name)
	if !ok {
		t.Fatalf("%s is not registered", name)
	}

	merged := map[string]any{"root": root}
	for k, v := range opts {
		merged[k] = v
	}

	result, err := tool.Run(context.Background(), merged)
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}

	return result
}

func messages(result *workflowfx.WorkflowToolResult) string {
	var b strings.Builder
	for _, issue := range result.Issues {
		b.WriteString(issue.Message + "\n")
	}

	return b.String()
}

func TestManifestToolsMatchTheTypeScriptTools(t *testing.T) {
	t.Parallel()

	binary := "\x89PNG\r\n\x1a\n\x00\x00binary"

	for _, tc := range []struct {
		tool  string
		files map[string]string
		opts  map[string]any
		fails []string // file names the issues must name; none means the tool passes
	}{
		{tool: "validate-eof", files: map[string]string{"logo.png": binary, "a.txt": "x"}, fails: []string{"a.txt"}},
		{tool: "validate-line-endings", files: map[string]string{"crlf.txt": "a\r\nb\r\n", "lf.txt": "a\n", "logo.png": binary}, fails: []string{"crlf.txt"}},
		{tool: "validate-merge-conflict", files: map[string]string{"a.txt": "x\n=======\ny\n", "b.txt": "======= heading\n"}, fails: []string{"a.txt"}},
		{tool: "validate-json", files: map[string]string{"a.md": "not json\n", "b.json": "{\n"}, fails: []string{"b.json"}},
		{tool: "validate-yaml", files: map[string]string{"a.yml": "a: 1\n---\nb: [\n", "notes.md": "a: [\n"}, fails: []string{"a.yml"}},
		{tool: "validate-yaml", files: map[string]string{"a.yaml": "a: 1\n---\nb: 2\n"}, opts: map[string]any{"allowMultipleDocuments": false}, fails: []string{"a.yaml"}},
		{tool: "validate-yaml", files: map[string]string{"a.yaml": "a: 1\n---\nb: 2\n"}, opts: map[string]any{"allowMultipleDocuments": true}},
		{tool: "validate-licenses", files: map[string]string{"a.ts": "export {};\n", "a.md": "# Title\n", "a.json": "{}\n"}, fails: []string{"a.ts"}},
		{tool: "validate-submodules", files: map[string]string{"vendor/x/.gitmodules": "[submodule \"x\"]\n"}},
		{tool: "validate-submodules", files: map[string]string{".gitmodules": "[submodule \"x\"]\n"}, fails: []string{".gitmodules"}},
		{tool: "validate-server-loc", files: map[string]string{"a.txt": "x\n"}, opts: map[string]any{"directory": "pkg/missing"}, fails: []string{"pkg/missing"}},
		{tool: "validate-error-coverage", files: map[string]string{"a.txt": "x\n"}, opts: map[string]any{"file": "pkg/errors.go", "errorObjects": []any{"NSError"}}, fails: []string{"pkg/errors.go"}},
		{tool: "validate-eof", files: map[string]string{"node_modules/x/a.txt": "x", "etc/temp/b.txt": "x"}},
		{tool: "validate-filenames", files: map[string]string{"pkg/Makefile.x": "x\n"}, opts: map[string]any{"rules": []any{map[string]any{"directory": "pkg/", "convention": "kebab-case"}}}, fails: []string{"Makefile.x"}},
	} {
		t.Run(tc.tool, func(t *testing.T) {
			t.Parallel()

			result := runTool(t, tc.tool, writeTree(t, tc.files), tc.opts)
			got := messages(result)

			if result.Passed != (len(tc.fails) == 0) {
				t.Fatalf("%s passed=%v, want %v:\n%s", tc.tool, result.Passed, len(tc.fails) == 0, got)
			}

			if len(result.Issues) != len(tc.fails) {
				t.Errorf("%s: %d issues, want %d:\n%s", tc.tool, len(result.Issues), len(tc.fails), got)
			}

			for _, name := range tc.fails {
				if !strings.Contains(got, name) {
					t.Errorf("%s should name %s:\n%s", tc.tool, name, got)
				}
			}
		})
	}
}

func TestManifestToolsFix(t *testing.T) {
	t.Parallel()

	binary := "\x89PNG\r\n\x1a\n\x00\x00binary"
	root := writeTree(t, map[string]string{"a.txt": "x", "logo.png": binary, "b.ts": "#!/usr/bin/env node\nexport {};\n", "c.md": "# Title\n"})

	eof := runTool(t, "validate-eof", root, map[string]any{"fix": true})
	if !eof.Passed || len(eof.Mutations) != 1 || !strings.HasSuffix(eof.Mutations[0].Path, "a.txt") {
		t.Errorf("validate-eof --fix should fix a.txt only and pass: %+v", eof)
	}

	dry := runTool(t, "validate-eof", root, map[string]any{"fix": true, "dryRun": true})
	if dry.Passed || len(dry.Mutations) != 1 {
		t.Errorf("a dry run reports the fix and keeps the issue: %+v", dry)
	}

	licenses := runTool(t, "validate-licenses", root, map[string]any{"fix": true})
	if !licenses.Passed || len(licenses.Mutations) != 1 {
		t.Fatalf("validate-licenses --fix should fix b.ts only: %+v", licenses)
	}

	want := "#!/usr/bin/env node\n// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.\nexport {};\n"
	if licenses.Mutations[0].NewContent != want {
		t.Errorf("license fix:\n%s", licenses.Mutations[0].NewContent)
	}
}
