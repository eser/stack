// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/eser/stack/pkg/ajan/kitfx"
)

// ── resolver tests ────────────────────────────────────────────────────────────

func TestResolveRequires_NoDeps(t *testing.T) {
	t.Parallel()

	recipes := []kitfx.Recipe{
		{Name: "base", Description: "d", Language: "go", Scale: kitfx.RecipeScaleProject, Files: []kitfx.RecipeFile{{Source: "s", Target: "t"}}},
	}

	got, err := kitfx.ResolveRequires("base", recipes)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(got) != 1 || got[0].Name != "base" {
		t.Fatalf("expected [base], got %v", got)
	}
}

func TestResolveRequires_Diamond(t *testing.T) {
	t.Parallel()

	// A → B, A → C, B → D, C → D — D must appear only once.
	recipes := []kitfx.Recipe{
		{Name: "A", Description: "d", Language: "go", Scale: kitfx.RecipeScaleProject, Requires: []string{"B", "C"}, Files: []kitfx.RecipeFile{{Source: "s", Target: "t"}}},
		{Name: "B", Description: "d", Language: "go", Scale: kitfx.RecipeScaleProject, Requires: []string{"D"}, Files: []kitfx.RecipeFile{{Source: "s", Target: "t"}}},
		{Name: "C", Description: "d", Language: "go", Scale: kitfx.RecipeScaleProject, Requires: []string{"D"}, Files: []kitfx.RecipeFile{{Source: "s", Target: "t"}}},
		{Name: "D", Description: "d", Language: "go", Scale: kitfx.RecipeScaleProject, Files: []kitfx.RecipeFile{{Source: "s", Target: "t"}}},
	}

	got, err := kitfx.ResolveRequires("A", recipes)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// D must appear exactly once and before B and C.
	seen := make(map[string]int)
	for i, r := range got {
		seen[r.Name] = i
	}

	if seen["D"] >= seen["B"] || seen["D"] >= seen["C"] {
		t.Errorf("D must appear before B and C; order: %v", got)
	}

	dCount := 0
	for _, r := range got {
		if r.Name == "D" {
			dCount++
		}
	}

	if dCount != 1 {
		t.Errorf("D should appear exactly once, got %d times", dCount)
	}
}

func TestResolveRequires_Cycle(t *testing.T) {
	t.Parallel()

	recipes := []kitfx.Recipe{
		{Name: "A", Description: "d", Language: "go", Scale: kitfx.RecipeScaleProject, Requires: []string{"B"}, Files: []kitfx.RecipeFile{{Source: "s", Target: "t"}}},
		{Name: "B", Description: "d", Language: "go", Scale: kitfx.RecipeScaleProject, Requires: []string{"A"}, Files: []kitfx.RecipeFile{{Source: "s", Target: "t"}}},
	}

	_, err := kitfx.ResolveRequires("A", recipes)
	if err == nil {
		t.Fatal("expected cyclic dependency error, got nil")
	}
}

func TestResolveRequires_Missing(t *testing.T) {
	t.Parallel()

	recipes := []kitfx.Recipe{
		{Name: "A", Description: "d", Language: "go", Scale: kitfx.RecipeScaleProject, Requires: []string{"B"}, Files: []kitfx.RecipeFile{{Source: "s", Target: "t"}}},
	}

	_, err := kitfx.ResolveRequires("A", recipes)
	if err == nil {
		t.Fatal("expected missing dependency error, got nil")
	}
}

// ── variable tests ────────────────────────────────────────────────────────────

func TestSubstituteVariables(t *testing.T) {
	t.Parallel()

	vars := map[string]string{"name": "world", "lang": "go"}

	cases := []struct {
		input string
		want  string
	}{
		{"hello {{.name}}", "hello world"},
		{"{{ .name }}", "world"},
		{"{{.unknown}} stays", "{{.unknown}} stays"},
		{"{{.lang}} project", "go project"},
		{"no placeholders", "no placeholders"},
	}

	for _, c := range cases {
		got := kitfx.SubstituteVariables(c.input, vars)
		if got != c.want {
			t.Errorf("SubstituteVariables(%q) = %q, want %q", c.input, got, c.want)
		}
	}
}

func TestHasVariables(t *testing.T) {
	t.Parallel()

	if !kitfx.HasVariables("hello {{.name}}") {
		t.Error("expected true for content with variables")
	}

	if kitfx.HasVariables("no variables here") {
		t.Error("expected false for content without variables")
	}
}

func TestResolveVariables(t *testing.T) {
	t.Parallel()

	recipe := &kitfx.Recipe{
		Variables: []kitfx.TemplateVariable{
			{Name: "a", Default: "default-a"},
			{Name: "b", Default: ""},
		},
	}

	overrides := map[string]string{"b": "override-b", "extra": "extra-val"}
	got := kitfx.ResolveVariables(recipe, overrides)

	if got["a"] != "default-a" {
		t.Errorf("a: want default-a, got %q", got["a"])
	}

	if got["b"] != "override-b" {
		t.Errorf("b: want override-b, got %q", got["b"])
	}

	if got["extra"] != "extra-val" {
		t.Errorf("extra: want extra-val, got %q", got["extra"])
	}
}

// ── validate tests ────────────────────────────────────────────────────────────

func TestValidateRecipe_Valid(t *testing.T) {
	t.Parallel()

	r := &kitfx.Recipe{
		Name:        "my-recipe",
		Description: "A recipe",
		Language:    "go",
		Scale:       kitfx.RecipeScaleUtility,
		Files:       []kitfx.RecipeFile{{Source: "src/main.go", Target: "main.go"}},
	}

	if err := kitfx.ValidateRecipe(r); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidateRecipe_InvalidScale(t *testing.T) {
	t.Parallel()

	r := &kitfx.Recipe{
		Name:        "r",
		Description: "d",
		Language:    "go",
		Scale:       "invalid",
		Files:       []kitfx.RecipeFile{{Source: "s", Target: "t"}},
	}

	if err := kitfx.ValidateRecipe(r); err == nil {
		t.Fatal("expected error for invalid scale")
	}
}

func TestValidateRegistryManifest_DuplicateNames(t *testing.T) {
	t.Parallel()

	r := kitfx.Recipe{
		Name:        "dup",
		Description: "d",
		Language:    "go",
		Scale:       kitfx.RecipeScaleProject,
		Files:       []kitfx.RecipeFile{{Source: "s", Target: "t"}},
	}

	m := &kitfx.RegistryManifest{
		Name:    "test",
		Recipes: []kitfx.Recipe{r, r},
	}

	if err := kitfx.ValidateRegistryManifest(m); err == nil {
		t.Fatal("expected duplicate name error")
	}
}

// ── path safety tests ─────────────────────────────────────────────────────────

func TestIsPathSafe(t *testing.T) {
	t.Parallel()

	cwd := "/project"
	cases := []struct {
		target string
		safe   bool
	}{
		{"src/main.go", true},
		{"main.go", true},
		{"../evil.go", false},
		{"../../etc/passwd", false},
		{"subdir/../main.go", true}, // resolves to /project/main.go
	}

	for _, c := range cases {
		got := kitfx.IsPathSafe(cwd, c.target)
		if got != c.safe {
			t.Errorf("IsPathSafe(%q, %q) = %v, want %v", cwd, c.target, got, c.safe)
		}
	}
}

// ── applier integration tests ─────────────────────────────────────────────────

func TestApplyRecipe_DryRun(t *testing.T) {
	t.Parallel()

	// Create a temp dir with a source file.
	tmp := t.TempDir()
	srcFile := filepath.Join(tmp, "template.txt")
	if err := os.WriteFile(srcFile, []byte("hello {{.name}}"), 0o644); err != nil { //nolint:gosec
		t.Fatal(err)
	}

	recipe := &kitfx.Recipe{
		Name:        "test-recipe",
		Description: "Test",
		Language:    "go",
		Scale:       kitfx.RecipeScaleUtility,
		Files: []kitfx.RecipeFile{
			{Source: srcFile, Target: "output.txt", Kind: kitfx.RecipeFileKindFile, Provider: kitfx.RecipeFileProviderLocal},
		},
	}

	opts := kitfx.ApplyOptions{
		CWD:       tmp,
		DryRun:    true,
		Variables: map[string]string{"name": "world"},
	}

	result, err := kitfx.ApplyRecipe(recipe, opts)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.Written) != 1 || result.Written[0] != "output.txt" {
		t.Errorf("expected [output.txt] written, got %v", result.Written)
	}

	// Dry run must not create the file.
	if _, err := os.Stat(filepath.Join(tmp, "output.txt")); !os.IsNotExist(err) {
		t.Error("dry run should not create files")
	}
}

func TestApplyRecipe_PathTraversal(t *testing.T) {
	t.Parallel()

	recipe := &kitfx.Recipe{
		Name:        "evil",
		Description: "d",
		Language:    "go",
		Scale:       kitfx.RecipeScaleUtility,
		Files: []kitfx.RecipeFile{
			{Source: "s", Target: "../../evil.sh"},
		},
	}

	opts := kitfx.ApplyOptions{CWD: t.TempDir()}

	_, err := kitfx.ApplyRecipe(recipe, opts)
	if err == nil {
		t.Fatal("expected path traversal error")
	}
}

// ── specifier resolver tests ─────────────────────────────────────────────────

func TestResolveSpecifier(t *testing.T) {
	t.Parallel()

	cases := []struct {
		input string
		want  kitfx.ResolvedSpecifier
	}{
		{
			"my-recipe",
			kitfx.ResolvedSpecifier{Kind: "name", Name: "my-recipe"},
		},
		{
			"gh:owner/repo",
			kitfx.ResolvedSpecifier{Kind: "repo", Owner: "owner", Repo: "repo"},
		},
		{
			"gh:owner/repo#main",
			kitfx.ResolvedSpecifier{Kind: "repo", Owner: "owner", Repo: "repo", Ref: "main"},
		},
	}

	for _, c := range cases {
		got := kitfx.ResolveSpecifier(c.input)
		if got != c.want {
			t.Errorf("ResolveSpecifier(%q) = %+v, want %+v", c.input, got, c.want)
		}
	}
}
