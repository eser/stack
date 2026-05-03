// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Phase E tests: all untested validators, walker, registry integration.

package codebasefx_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// ─── ValidateJSON ─────────────────────────────────────────────────────────────

func TestValidateJSON(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		path    string
		content string
		wantErr bool
	}{
		{"valid json", "f.json", `{"a":1}`, false},
		{"invalid json", "f.json", `{bad}`, true},
		{"valid jsonc", "f.jsonc", "{\"a\":1 // comment\n}", false},
		{"invalid jsonc", "f.jsonc", `{unclosed`, true},
		{"empty object", "f.json", `{}`, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			issues := codebasefx.ValidateJSON(tt.path, []byte(tt.content))
			if (len(issues) > 0) != tt.wantErr {
				t.Errorf("ValidateJSON(%q) issues=%v wantErr=%v", tt.path, issues, tt.wantErr)
			}
		})
	}
}

// ─── ValidateYAML ─────────────────────────────────────────────────────────────

func TestValidateYAML(t *testing.T) {
	t.Parallel()

	issues := codebasefx.ValidateYAML("f.yaml", []byte("key: value\nlist:\n  - a\n  - b\n"))
	if len(issues) != 0 {
		t.Errorf("expected no issues for valid YAML, got %v", issues)
	}

	issues = codebasefx.ValidateYAML("f.yaml", []byte("key: [\nbad"))
	if len(issues) == 0 {
		t.Error("expected issue for invalid YAML")
	}

	// Invalid UTF-8 bytes — skip (nil)
	issues = codebasefx.ValidateYAML("f.yaml", []byte{0xFF, 0xFE, 0xFD})
	if len(issues) != 0 {
		t.Errorf("expected nil for invalid UTF-8 content, got %v", issues)
	}
}

// ─── ValidateTOML ─────────────────────────────────────────────────────────────

func TestValidateTOML(t *testing.T) {
	t.Parallel()

	issues := codebasefx.ValidateTOML("f.toml", []byte("[section]\nkey = \"value\"\n"))
	if len(issues) != 0 {
		t.Errorf("expected no issues for valid TOML, got %v", issues)
	}

	issues = codebasefx.ValidateTOML("f.toml", []byte("key = no-quotes\n"))
	if len(issues) == 0 {
		t.Error("expected issue for invalid TOML")
	}

	// Invalid UTF-8 bytes — skip
	issues = codebasefx.ValidateTOML("f.toml", []byte{0xFF, 0xFE})
	if len(issues) != 0 {
		t.Errorf("expected nil for invalid UTF-8 content, got %v", issues)
	}
}

// ─── ValidateLicenseHeader ────────────────────────────────────────────────────

func TestValidateLicenseHeader(t *testing.T) {
	t.Parallel()

	const good = "// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.\n\npackage main\n"
	const badYear = "// Copyright 2024-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.\n"
	const missing = "package main\n"

	tests := []struct {
		name    string
		path    string
		content string
		want    int
	}{
		{"correct header", "pkg/foo.ts", good, 0},
		{"wrong year", "pkg/foo.ts", badYear, 1},
		{"missing header", "pkg/foo.ts", missing, 1},
		{"empty file", "pkg/foo.ts", "", 0},
		{"docs path skipped", "/docs/foo.ts", missing, 0},
		{"gen.ts skipped", "pkg/manifest.gen.ts", missing, 0},
		{"shebang + correct header", "pkg/foo.ts", "#!/usr/bin/env deno\n" + good, 0},
		{"shebang + missing header", "pkg/foo.ts", "#!/usr/bin/env deno\npackage main\n", 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			issues := codebasefx.ValidateLicenseHeader(tt.path, []byte(tt.content))
			if len(issues) != tt.want {
				t.Errorf("ValidateLicenseHeader(%q): got %d issues, want %d: %v", tt.path, len(issues), tt.want, issues)
			}
		})
	}
}

// ─── ValidateLargeFile ────────────────────────────────────────────────────────

func TestValidateLargeFile(t *testing.T) {
	t.Parallel()

	vf := codebasefx.ValidateLargeFile(10)

	issues := vf("small.txt", []byte("hi"))
	if len(issues) != 0 {
		t.Errorf("expected no issues for small file, got %v", issues)
	}

	issues = vf("large.txt", []byte("this content is definitely larger than ten bytes"))
	if len(issues) == 0 {
		t.Error("expected issue for file exceeding size limit")
	}
}

// ─── ValidateCaseConflict ─────────────────────────────────────────────────────

func TestValidateCaseConflict(t *testing.T) {
	t.Parallel()

	vf := codebasefx.ValidateCaseConflict()

	// First file — no conflict
	issues := vf("pkg/Foo.ts", nil)
	if len(issues) != 0 {
		t.Errorf("expected no issues for first file, got %v", issues)
	}

	// Same name different case — conflict
	issues = vf("pkg/foo.ts", nil)
	if len(issues) == 0 {
		t.Error("expected case conflict issue")
	}

	// Completely different path — no conflict
	issues = vf("pkg/bar.ts", nil)
	if len(issues) != 0 {
		t.Errorf("expected no issues for unrelated path, got %v", issues)
	}
}

func TestValidateCaseConflict_FreshStatePerFactory(t *testing.T) {
	t.Parallel()

	// Each factory call starts fresh
	vf1 := codebasefx.ValidateCaseConflict()
	vf2 := codebasefx.ValidateCaseConflict()

	vf1("pkg/Foo.ts", nil)

	// vf2 has no memory of vf1's call
	issues := vf2("pkg/foo.ts", nil)
	if len(issues) != 0 {
		t.Errorf("expected no issues from fresh factory, got %v", issues)
	}
}

// ─── ValidateSymlinks ─────────────────────────────────────────────────────────

func TestValidateSymlinks(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	vf := codebasefx.ValidateSymlinks()

	// Regular file — not a symlink, must pass
	realFile := filepath.Join(dir, "real.txt")
	if err := os.WriteFile(realFile, []byte("content"), 0o644); err != nil {
		t.Fatal(err)
	}

	issues := vf(realFile, []byte("content"))
	if len(issues) != 0 {
		t.Errorf("expected no issues for regular file, got %v", issues)
	}

	// Broken symlink — target does not exist
	brokenLink := filepath.Join(dir, "broken.txt")
	if err := os.Symlink(filepath.Join(dir, "nonexistent.txt"), brokenLink); err != nil {
		t.Skipf("cannot create symlink (likely no permission): %v", err)
	}

	issues = vf(brokenLink, nil)
	if len(issues) == 0 {
		t.Error("expected issue for broken symlink")
	}

	// Valid symlink — target exists
	goodLink := filepath.Join(dir, "good.txt")
	if err := os.Symlink(realFile, goodLink); err != nil {
		t.Fatal(err)
	}

	issues = vf(goodLink, nil)
	if len(issues) != 0 {
		t.Errorf("expected no issues for valid symlink, got %v", issues)
	}
}

// ─── ValidateSubmodules ───────────────────────────────────────────────────────

func TestValidateSubmodules(t *testing.T) {
	t.Parallel()

	vf := codebasefx.ValidateSubmodules()

	// Not .gitmodules — skip
	issues := vf("pkg/README.md", []byte("[submodule \"ext\"]"))
	if len(issues) != 0 {
		t.Errorf("expected no issues for non-.gitmodules file, got %v", issues)
	}

	// .gitmodules with one submodule — fail
	content := "[submodule \"vendor/lib\"]\npath = vendor/lib\nurl = https://example.com/lib.git\n"
	issues = vf(".gitmodules", []byte(content))
	if len(issues) == 0 {
		t.Error("expected issue for .gitmodules with submodule")
	}
	if len(issues) > 0 && issues[0].Message == "" {
		t.Error("issue must have a non-empty message")
	}

	// .gitmodules with no submodules — pass
	issues = vf(".gitmodules", []byte("# empty\n"))
	if len(issues) != 0 {
		t.Errorf("expected no issues for empty .gitmodules, got %v", issues)
	}
}

// ─── ValidateFilenames ────────────────────────────────────────────────────────

func TestValidateFilenames(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		path     string
		rules    []codebasefx.FilenameRule
		excludes []string
		wantErr  bool
	}{
		{"kebab-case ok", "pkg/my-component.ts", nil, nil, false},
		{"camel-case fail", "pkg/MyComponent.ts", nil, nil, true},
		{"snake_case rule", "data/my_file.py", []codebasefx.FilenameRule{{Directory: "data", Convention: "snake_case"}}, nil, false},
		{"snake_case rule violation", "data/MyFile.py", []codebasefx.FilenameRule{{Directory: "data", Convention: "snake_case"}}, nil, true},
		{"windows reserved", "pkg/con.ts", nil, nil, true},
		{"excluded path", "CLAUDE.md", nil, nil, false},
		{"custom exclude", "pkg/Ignored.ts", nil, []string{"Ignored.ts"}, false},
		{"wildcard exclude", "pkg/SpecialFile.ts", nil, []string{"Special*.ts"}, false},
		{"numbers ok", "pkg/api-v2.ts", nil, nil, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			vf := codebasefx.ValidateFilenames(tt.rules, tt.excludes)
			issues := vf(tt.path, nil)

			if (len(issues) > 0) != tt.wantErr {
				t.Errorf("ValidateFilenames(%q) issues=%v wantErr=%v", tt.path, issues, tt.wantErr)
			}
		})
	}
}

func TestValidateFilenames_RuleExclude(t *testing.T) {
	t.Parallel()

	rules := []codebasefx.FilenameRule{{
		Directory:  "pkg",
		Convention: "kebab-case",
		Exclude:    []string{"Special.ts"},
	}}
	vf := codebasefx.ValidateFilenames(rules, nil)

	// Excluded file under the rule directory — must pass despite CamelCase name
	issues := vf("pkg/Special.ts", nil)
	if len(issues) != 0 {
		t.Errorf("per-rule exclude must suppress check, got %v", issues)
	}

	// Non-excluded CamelCase — must fail
	issues = vf("pkg/CamelCase.ts", nil)
	if len(issues) == 0 {
		t.Error("expected issue for CamelCase filename not in rule exclude")
	}
}

// ─── ValidateRuntimeJSAPIs ────────────────────────────────────────────────────

func TestValidateRuntimeJSAPIs(t *testing.T) {
	t.Parallel()

	// Direct Deno.exit usage — must flag
	issues := codebasefx.ValidateRuntimeJSAPIs("mod.ts", []byte("Deno.exit(1);\n"))
	if len(issues) == 0 {
		t.Error("expected issue for Deno.exit")
	}

	// In a line comment — must skip
	issues = codebasefx.ValidateRuntimeJSAPIs("mod.ts", []byte("// Deno.exit(1);\n"))
	if len(issues) != 0 {
		t.Errorf("must not flag Deno API in comment, got %v", issues)
	}

	// In a string literal — must skip
	issues = codebasefx.ValidateRuntimeJSAPIs("mod.ts", []byte(`const s = "Deno.exit(1)"`+"\n"))
	if len(issues) != 0 {
		t.Errorf("must not flag Deno API in string literal, got %v", issues)
	}

	// Clean file — no issues
	issues = codebasefx.ValidateRuntimeJSAPIs("mod.ts", []byte("console.log('hello');\n"))
	if len(issues) != 0 {
		t.Errorf("expected no issues for clean file, got %v", issues)
	}

	// Multiple Deno APIs
	content := "Deno.env.get('HOME');\nnew Deno.Command('ls');\n"
	issues = codebasefx.ValidateRuntimeJSAPIs("mod.ts", []byte(content))
	if len(issues) < 2 {
		t.Errorf("expected >=2 issues for multiple Deno APIs, got %d", len(issues))
	}

	// Binary content — skip
	issues = codebasefx.ValidateRuntimeJSAPIs("mod.ts", []byte{0x00, 0x01})
	if len(issues) != 0 {
		t.Errorf("expected nil for binary content, got %v", issues)
	}
}

// ─── ValidateShebangs ─────────────────────────────────────────────────────────

func TestValidateShebangs(t *testing.T) {
	t.Parallel()

	// Always a no-op
	issues := codebasefx.ValidateShebangs("bin/tool.ts", []byte("#!/usr/bin/env deno\nconsole.log('hi');\n"))
	if len(issues) != 0 {
		t.Errorf("ValidateShebangs must always return nil, got %v", issues)
	}
}

// ─── RunValidators ────────────────────────────────────────────────────────────

func TestRunValidators_MultipleValidators(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	// Write a file with both a missing newline and a trailing space
	p := filepath.Join(dir, "bad.txt")
	if err := os.WriteFile(p, []byte("line  "), 0o644); err != nil { // trailing space, no newline
		t.Fatal(err)
	}

	files := []codebasefx.FileEntry{{Path: p, Name: "bad.txt"}}
	validators := []codebasefx.ValidatorFunc{
		codebasefx.ValidateEOF,
		codebasefx.ValidateTrailingWhitespace,
	}

	results := codebasefx.RunValidators(files, validators)
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}

	// EOF validator must have found an issue
	if results[0].Passed {
		t.Error("EOF validator must fail for file without trailing newline")
	}

	if results[0].FilesChecked != 1 {
		t.Errorf("expected FilesChecked=1, got %d", results[0].FilesChecked)
	}

	// Trailing whitespace validator must have found an issue
	if results[1].Passed {
		t.Error("trailing whitespace validator must fail")
	}
}

func TestRunValidators_NoFiles(t *testing.T) {
	t.Parallel()

	results := codebasefx.RunValidators(nil, []codebasefx.ValidatorFunc{codebasefx.ValidateEOF})
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	if !results[0].Passed {
		t.Error("validator must pass when there are no files")
	}
}

// ─── WalkSourceFiles ──────────────────────────────────────────────────────────

func TestWalkSourceFiles_FSFallback(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	files := map[string]string{
		"a.ts":              "hello",
		"b.go":              "package main",
		"sub/c.ts":          "world",
		"node_modules/x.ts": "skip-me",
	}

	for rel, content := range files {
		abs := filepath.Join(dir, rel)
		if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	ctx := context.Background()
	entries, err := codebasefx.WalkSourceFiles(ctx, codebasefx.WalkOptions{
		Root:     dir,
		GitAware: false,
	})

	if err != nil {
		t.Fatalf("WalkSourceFiles: %v", err)
	}

	// node_modules must be excluded by default
	for _, e := range entries {
		if filepath.Base(filepath.Dir(e.Path)) == "node_modules" {
			t.Errorf("node_modules must be excluded, got %s", e.Path)
		}
	}

	// Must include the non-excluded files
	if len(entries) < 3 {
		t.Errorf("expected at least 3 entries, got %d", len(entries))
	}
}

func TestWalkSourceFiles_ExtensionFilter(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	for _, name := range []string{"a.ts", "b.go", "c.md"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	entries, err := codebasefx.WalkSourceFiles(context.Background(), codebasefx.WalkOptions{
		Root:       dir,
		GitAware:   false,
		Extensions: []string{"ts"},
	})

	if err != nil {
		t.Fatalf("WalkSourceFiles: %v", err)
	}

	for _, e := range entries {
		if filepath.Ext(e.Name) != ".ts" {
			t.Errorf("extension filter failed: got %s", e.Name)
		}
	}
}

// ─── ParseSemver / FormatSemver ───────────────────────────────────────────────

func TestParseSemver(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input   string
		major   int
		minor   int
		patch   int
		suffix  string
		wantErr bool
	}{
		{"v1.2.3", 1, 2, 3, "", false},
		{"1.2.3", 1, 2, 3, "", false},
		{"v0.0.0", 0, 0, 0, "", false},
		{"v1.2.3-beta.1", 1, 2, 3, "-beta.1", false},
		{"bad", 0, 0, 0, "", true},
		{"v1.2", 0, 0, 0, "", true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			t.Parallel()
			major, minor, patch, suffix, err := codebasefx.ParseSemver(tt.input)

			if (err != nil) != tt.wantErr {
				t.Fatalf("ParseSemver(%q) err=%v wantErr=%v", tt.input, err, tt.wantErr)
			}

			if tt.wantErr {
				return
			}

			if major != tt.major || minor != tt.minor || patch != tt.patch {
				t.Errorf("got %d.%d.%d want %d.%d.%d", major, minor, patch, tt.major, tt.minor, tt.patch)
			}

			if suffix != tt.suffix {
				t.Errorf("suffix=%q want=%q", suffix, tt.suffix)
			}
		})
	}
}

func TestFormatSemver(t *testing.T) {
	t.Parallel()

	got := codebasefx.FormatSemver(1, 2, 3, "")
	if got != "v1.2.3" {
		t.Errorf("FormatSemver(1,2,3,'')=%q want 'v1.2.3'", got)
	}

	got = codebasefx.FormatSemver(0, 0, 1, "-alpha")
	if got != "v0.0.1-alpha" {
		t.Errorf("FormatSemver(0,0,1,'-alpha')=%q want 'v0.0.1-alpha'", got)
	}
}

// ─── ParseConventionalCommits ─────────────────────────────────────────────────

func TestParseConventionalCommits(t *testing.T) {
	t.Parallel()

	commits := []codebasefx.Commit{
		{Subject: "feat: add auth", Hash: "aaa1"},
		{Subject: "not conventional", Hash: "bbb2"},
		{Subject: "fix(db): fix query", Hash: "ccc3"},
		{Subject: "Merge branch 'main'", Hash: "ddd4"},
	}

	result := codebasefx.ParseConventionalCommits(commits)

	// Only conventional commits should be returned
	if len(result) != 2 {
		t.Errorf("expected 2 conventional commits, got %d: %v", len(result), result)
	}

	if result[0].Type != "feat" {
		t.Errorf("first commit type=%q want 'feat'", result[0].Type)
	}

	if result[1].Type != "fix" {
		t.Errorf("second commit type=%q want 'fix'", result[1].Type)
	}
}

// ─── GenerateChangelogSection ─────────────────────────────────────────────────

func TestGenerateChangelogSection(t *testing.T) {
	t.Parallel()

	commits := []codebasefx.ConventionalCommit{
		{Type: "feat", Message: "add login"},
		{Type: "fix", Message: "fix crash"},
	}

	section := codebasefx.GenerateChangelogSection("v1.1.0", commits)

	if section == "" {
		t.Error("expected non-empty changelog section")
	}

	if len(section) < 20 {
		t.Errorf("changelog section too short: %q", section)
	}
}

// ─── BuiltinValidators ────────────────────────────────────────────────────────

func TestBuiltinValidators_Count(t *testing.T) {
	t.Parallel()

	vv := codebasefx.BuiltinValidators()
	if len(vv) == 0 {
		t.Error("BuiltinValidators must return at least one validator")
	}
}

// ─── RegisterAllValidators ────────────────────────────────────────────────────

func TestRegisterAllValidators_AllToolsPresent(t *testing.T) {
	t.Parallel()

	r := workflowfx.NewRegistry()
	codebasefx.RegisterAllValidators(r)

	want := []string{
		"codebase-bom",
		"codebase-case-conflict",
		"codebase-eof",
		"codebase-filenames",
		"codebase-json",
		"codebase-large-file",
		"codebase-license",
		"codebase-line-endings",
		"codebase-merge-conflicts",
		"codebase-runtime-js-apis",
		"codebase-secrets",
		"codebase-shebangs",
		"codebase-submodules",
		"codebase-symlinks",
		"codebase-toml",
		"codebase-trailing",
		"codebase-yaml",
	}

	got := r.Names()
	if len(got) != len(want) {
		t.Fatalf("expected %d tools, got %d: %v", len(want), len(got), got)
	}

	for i, n := range want {
		if got[i] != n {
			t.Errorf("tool[%d]: want %q, got %q", i, n, got[i])
		}
	}
}

func TestValidatorTool_Run_WithTempDir(t *testing.T) {
	t.Parallel()

	// Set up a temp dir with one clean and one bad file
	dir := t.TempDir()

	if err := os.WriteFile(filepath.Join(dir, "ok.txt"), []byte("clean\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(dir, "bad.txt"), []byte("no-newline"), 0o644); err != nil {
		t.Fatal(err)
	}

	r := workflowfx.NewRegistry()
	codebasefx.RegisterAllValidators(r)

	tool := r.MustGet("codebase-eof")
	result, err := tool.Run(context.Background(), map[string]any{"root": dir})

	if err != nil {
		t.Fatalf("unexpected engine error: %v", err)
	}

	// bad.txt has no newline, so the tool must fail
	if result.Passed {
		t.Error("expected Passed=false when bad.txt has no trailing newline")
	}

	if result.Stats["filesChecked"].(int) < 1 {
		t.Error("expected filesChecked >= 1")
	}
}

func TestValidatorTool_Run_LargeFileOptsFloat(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	// Write a 5-byte file; limit is 3 bytes → must fail
	if err := os.WriteFile(filepath.Join(dir, "big.bin"), []byte("12345"), 0o644); err != nil {
		t.Fatal(err)
	}

	r := workflowfx.NewRegistry()
	codebasefx.RegisterAllValidators(r)

	tool := r.MustGet("codebase-large-file")

	// Pass maxKb as float64 (as JSON-decoded opts would be)
	result, err := tool.Run(context.Background(), map[string]any{
		"root":  dir,
		"maxKb": float64(0), // 0 KB = 0 bytes max → any file fails
	})

	if err != nil {
		t.Fatalf("unexpected engine error: %v", err)
	}

	if result.Passed {
		t.Error("expected Passed=false with 0-byte limit")
	}
}

// ─── workspace validators ─────────────────────────────────────────────────────

// makeWorkspace writes a minimal deno.json workspace so workspace validators
// can run without hitting real disk or network.
func makeWorkspace(t *testing.T) string {
	t.Helper()
	root := t.TempDir()

	pkgA := filepath.Join(root, "pkg-a")
	if err := os.MkdirAll(pkgA, 0o755); err != nil {
		t.Fatal(err)
	}

	// root deno.json with workspace member
	rootDeno := map[string]any{
		"workspace": []string{"./pkg-a"},
	}

	writeJSON(t, filepath.Join(root, "deno.json"), rootDeno)

	// pkg-a/deno.json
	pkgDeno := map[string]any{
		"name":    "@scope/pkg-a",
		"version": "1.0.0",
		"exports": map[string]string{".": "./mod.ts"},
	}

	writeJSON(t, filepath.Join(pkgA, "deno.json"), pkgDeno)

	// pkg-a/package.json
	pkgPkg := map[string]any{
		"name":    "@scope/pkg-a",
		"version": "1.0.0",
		"exports": map[string]string{".": "./mod.ts"},
	}

	writeJSON(t, filepath.Join(pkgA, "package.json"), pkgPkg)

	// pkg-a/mod.ts
	if err := os.WriteFile(
		filepath.Join(pkgA, "mod.ts"),
		[]byte("// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.\nexport const x = 1;\n"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}

	return root
}

func writeJSON(t *testing.T, path string, v any) {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestCheckCircularDeps_NoWorkspace(t *testing.T) {
	t.Parallel()

	// No deno.json — acceptable to return error or empty result; must not panic.
	dir := t.TempDir()
	_, _ = codebasefx.CheckCircularDeps(dir)
}

func TestCheckCircularDeps_EmptyWorkspace(t *testing.T) {
	t.Parallel()

	root := makeWorkspace(t)
	result, err := codebasefx.CheckCircularDeps(root)

	if err != nil {
		t.Fatalf("CheckCircularDeps: %v", err)
	}

	if result.HasCycles {
		t.Errorf("expected no cycles in minimal workspace, got: %v", result.Cycles)
	}
}

func TestCheckExportNames_ValidKebabCase(t *testing.T) {
	t.Parallel()

	root := makeWorkspace(t)
	result, err := codebasefx.CheckExportNames(root, nil)

	if err != nil {
		t.Fatalf("CheckExportNames: %v", err)
	}

	// "." is a valid export path
	if !result.IsValid {
		t.Errorf("expected no violations, got: %v", result.Violations)
	}
}

func TestCheckModExports_ModTsPresent(t *testing.T) {
	t.Parallel()

	root := makeWorkspace(t)
	result, err := codebasefx.CheckModExports(root)

	if err != nil {
		t.Fatalf("CheckModExports: %v", err)
	}

	// mod.ts exists and is the only .ts file, so exports are complete
	if !result.IsComplete {
		t.Errorf("expected IsComplete=true, missing: %v", result.MissingExports)
	}
}

func TestCheckPackageConfigs_ConsistentPackage(t *testing.T) {
	t.Parallel()

	root := makeWorkspace(t)
	result, err := codebasefx.CheckPackageConfigs(root)

	if err != nil {
		t.Fatalf("CheckPackageConfigs: %v", err)
	}

	if !result.IsConsistent {
		t.Errorf("expected IsConsistent=true, got inconsistencies: %v / %v",
			result.Inconsistencies, result.DependencyInconsistencies)
	}
}
