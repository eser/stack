// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/kitfx"
)

// ── MissingVariables ──────────────────────────────────────────────────────────

func TestMissingVariables_AllPresent(t *testing.T) {
	t.Parallel()

	recipe := &kitfx.Recipe{
		Variables: []kitfx.TemplateVariable{
			{Name: "a", Default: ""},
			{Name: "b", Default: ""},
		},
	}

	missing := kitfx.MissingVariables(recipe, map[string]string{"a": "x", "b": "y"})
	if len(missing) != 0 {
		t.Errorf("expected no missing, got %v", missing)
	}
}

func TestMissingVariables_MissingWithNoDefault(t *testing.T) {
	t.Parallel()

	recipe := &kitfx.Recipe{
		Variables: []kitfx.TemplateVariable{
			{Name: "required", Default: ""},
			{Name: "optional", Default: "fallback"},
		},
	}

	missing := kitfx.MissingVariables(recipe, map[string]string{})
	if len(missing) != 1 || missing[0] != "required" {
		t.Errorf("expected [required], got %v", missing)
	}
}

func TestMissingVariables_WhitespaceValueCountsAsMissing(t *testing.T) {
	t.Parallel()

	recipe := &kitfx.Recipe{
		Variables: []kitfx.TemplateVariable{
			{Name: "host", Default: ""},
		},
	}

	// Whitespace-only value with no default → missing.
	missing := kitfx.MissingVariables(recipe, map[string]string{"host": "   "})
	if len(missing) != 1 {
		t.Errorf("expected 1 missing (whitespace value), got %v", missing)
	}
}

func TestMissingVariables_HasDefault_NotMissing(t *testing.T) {
	t.Parallel()

	recipe := &kitfx.Recipe{
		Variables: []kitfx.TemplateVariable{
			{Name: "port", Default: "8080"},
		},
	}

	// Not in vars but has a default → not missing.
	missing := kitfx.MissingVariables(recipe, map[string]string{})
	if len(missing) != 0 {
		t.Errorf("expected no missing (has default), got %v", missing)
	}
}

func TestMissingVariables_NoVariables(t *testing.T) {
	t.Parallel()

	recipe := &kitfx.Recipe{}
	missing := kitfx.MissingVariables(recipe, map[string]string{})

	if missing != nil {
		t.Errorf("expected nil for recipe with no variables, got %v", missing)
	}
}

// ── ValidateRecipe — full error coverage ─────────────────────────────────────

func TestValidateRecipe_ErrorCases(t *testing.T) {
	t.Parallel()

	base := kitfx.Recipe{
		Name:        "r",
		Description: "d",
		Language:    "go",
		Scale:       kitfx.RecipeScaleUtility,
		Files:       []kitfx.RecipeFile{{Source: "s", Target: "t"}},
	}

	cases := []struct {
		name   string
		mutate func(r *kitfx.Recipe)
		errIs  error
	}{
		{"missing name", func(r *kitfx.Recipe) { r.Name = "" }, kitfx.ErrRecipeNameRequired},
		{"missing description", func(r *kitfx.Recipe) { r.Description = "" }, kitfx.ErrRecipeDescRequired},
		{"missing language", func(r *kitfx.Recipe) { r.Language = "" }, kitfx.ErrRecipeLanguageRequired},
		{"missing scale", func(r *kitfx.Recipe) { r.Scale = "" }, kitfx.ErrRecipeScaleRequired},
		{"invalid scale", func(r *kitfx.Recipe) { r.Scale = "mega" }, kitfx.ErrRecipeScaleInvalid},
		{"no files", func(r *kitfx.Recipe) { r.Files = nil }, kitfx.ErrRecipeFilesRequired},
		{"file missing source", func(r *kitfx.Recipe) { r.Files[0].Source = "" }, kitfx.ErrRecipeFileSourceRequired},
		{"file missing target", func(r *kitfx.Recipe) { r.Files[0].Target = "" }, kitfx.ErrRecipeFileTargetRequired},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			r := base
			r.Files = []kitfx.RecipeFile{{Source: base.Files[0].Source, Target: base.Files[0].Target}}
			tc.mutate(&r)

			err := kitfx.ValidateRecipe(&r)
			if err == nil {
				t.Fatalf("expected error for %q, got nil", tc.name)
			}
		})
	}
}

// ── ValidateRegistryManifest ──────────────────────────────────────────────────

func TestValidateRegistryManifest_MissingName(t *testing.T) {
	t.Parallel()

	m := &kitfx.RegistryManifest{}
	if err := kitfx.ValidateRegistryManifest(m); err == nil {
		t.Fatal("expected error for missing manifest name")
	}
}

func TestValidateRegistryManifest_DuplicateRecipeNames(t *testing.T) {
	t.Parallel()

	r := kitfx.Recipe{
		Name:        "dup",
		Description: "d",
		Language:    "go",
		Scale:       kitfx.RecipeScaleUtility,
		Files:       []kitfx.RecipeFile{{Source: "s", Target: "t"}},
	}

	m := &kitfx.RegistryManifest{Name: "reg", Recipes: []kitfx.Recipe{r, r}}
	if err := kitfx.ValidateRegistryManifest(m); err == nil {
		t.Fatal("expected error for duplicate recipe names")
	}
}

func TestValidateRegistryManifest_InvalidRecipeInsideManifest(t *testing.T) {
	t.Parallel()

	m := &kitfx.RegistryManifest{
		Name: "reg",
		Recipes: []kitfx.Recipe{
			{Name: "", Description: "d", Language: "go", Scale: kitfx.RecipeScaleUtility,
				Files: []kitfx.RecipeFile{{Source: "s", Target: "t"}}},
		},
	}

	if err := kitfx.ValidateRegistryManifest(m); err == nil {
		t.Fatal("expected error for recipe with missing name")
	}
}

func TestValidateRegistryManifest_Valid(t *testing.T) {
	t.Parallel()

	m := &kitfx.RegistryManifest{
		Name: "reg",
		Recipes: []kitfx.Recipe{
			{Name: "r", Description: "d", Language: "go", Scale: kitfx.RecipeScaleUtility,
				Files: []kitfx.RecipeFile{{Source: "s", Target: "t"}}},
		},
	}

	if err := kitfx.ValidateRegistryManifest(m); err != nil {
		t.Fatalf("expected valid manifest, got error: %v", err)
	}
}

// ── DetectProjectType ─────────────────────────────────────────────────────────

func TestDetectProjectType_Go(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "go.mod"), []byte("module test\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	det := kitfx.DetectProjectType(dir)
	if det.Type != kitfx.ProjectTypeGo {
		t.Errorf("expected Go, got %q", det.Type)
	}

	if det.ConfigFile == "" {
		t.Error("expected ConfigFile to be set")
	}
}

func TestDetectProjectType_Deno(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "deno.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	det := kitfx.DetectProjectType(dir)
	if det.Type != kitfx.ProjectTypeDeno {
		t.Errorf("expected Deno, got %q", det.Type)
	}
}

func TestDetectProjectType_Node(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	det := kitfx.DetectProjectType(dir)
	if det.Type != kitfx.ProjectTypeNode {
		t.Errorf("expected Node, got %q", det.Type)
	}
}

func TestDetectProjectType_Unknown(t *testing.T) {
	t.Parallel()

	dir := t.TempDir() // no sentinel files

	det := kitfx.DetectProjectType(dir)
	if det.Type != kitfx.ProjectTypeUnknown {
		t.Errorf("expected Unknown, got %q", det.Type)
	}

	if det.ConfigFile != "" {
		t.Errorf("expected empty ConfigFile for Unknown, got %q", det.ConfigFile)
	}
}

// ── GetDependencyInstructions ─────────────────────────────────────────────────

func TestGetDependencyInstructions_NilDependencies(t *testing.T) {
	t.Parallel()

	recipe := &kitfx.Recipe{}
	instr := kitfx.GetDependencyInstructions(recipe, kitfx.ProjectDetection{Type: kitfx.ProjectTypeGo})

	if len(instr.Instructions) != 0 || len(instr.Warnings) != 0 {
		t.Errorf("expected empty instructions for nil deps, got %+v", instr)
	}
}

func TestGetDependencyInstructions_GoDeps_Matching(t *testing.T) {
	t.Parallel()

	recipe := &kitfx.Recipe{
		Dependencies: &kitfx.RecipeDependencies{
			Go: []string{"github.com/pkg/errors@latest"},
		},
	}

	instr := kitfx.GetDependencyInstructions(recipe, kitfx.ProjectDetection{Type: kitfx.ProjectTypeGo})

	if len(instr.Instructions) != 1 || !strings.Contains(instr.Instructions[0], "go get") {
		t.Errorf("expected go get instruction, got %v", instr.Instructions)
	}

	if len(instr.Warnings) != 0 {
		t.Errorf("expected no warnings for matching project type, got %v", instr.Warnings)
	}
}

func TestGetDependencyInstructions_GoDeps_Mismatch(t *testing.T) {
	t.Parallel()

	recipe := &kitfx.Recipe{
		Dependencies: &kitfx.RecipeDependencies{
			Go: []string{"github.com/pkg/errors@latest"},
		},
	}

	instr := kitfx.GetDependencyInstructions(recipe, kitfx.ProjectDetection{Type: kitfx.ProjectTypeNode})

	if len(instr.Warnings) == 0 {
		t.Error("expected warning for Go deps in Node project")
	}

	if len(instr.Instructions) == 0 {
		t.Error("expected go get instruction even on mismatch")
	}
}

func TestGetDependencyInstructions_NPMDeps_Single(t *testing.T) {
	t.Parallel()

	recipe := &kitfx.Recipe{
		Dependencies: &kitfx.RecipeDependencies{
			NPM: []string{"express"},
		},
	}

	instr := kitfx.GetDependencyInstructions(recipe, kitfx.ProjectDetection{Type: kitfx.ProjectTypeNode})

	if len(instr.Instructions) != 1 || !strings.Contains(instr.Instructions[0], "npm install") {
		t.Errorf("expected npm install instruction, got %v", instr.Instructions)
	}
}

func TestGetDependencyInstructions_NPMDeps_Multi(t *testing.T) {
	t.Parallel()

	recipe := &kitfx.Recipe{
		Dependencies: &kitfx.RecipeDependencies{
			NPM: []string{"express", "lodash"},
		},
	}

	instr := kitfx.GetDependencyInstructions(recipe, kitfx.ProjectDetection{Type: kitfx.ProjectTypeNode})

	if len(instr.Instructions) != 1 {
		t.Fatalf("expected 1 npm install instruction, got %d", len(instr.Instructions))
	}

	if !strings.Contains(instr.Instructions[0], "express") || !strings.Contains(instr.Instructions[0], "lodash") {
		t.Errorf("expected both packages in instruction, got %q", instr.Instructions[0])
	}
}

func TestGetDependencyInstructions_JSRDeps(t *testing.T) {
	t.Parallel()

	recipe := &kitfx.Recipe{
		Dependencies: &kitfx.RecipeDependencies{
			JSR: []string{"@std/path"},
		},
	}

	instr := kitfx.GetDependencyInstructions(recipe, kitfx.ProjectDetection{Type: kitfx.ProjectTypeDeno})

	if len(instr.Instructions) == 0 || !strings.Contains(instr.Instructions[0], "deno add") {
		t.Errorf("expected deno add instruction, got %v", instr.Instructions)
	}
}

func TestGetDependencyInstructions_JSRDeps_WrongProjectType(t *testing.T) {
	t.Parallel()

	recipe := &kitfx.Recipe{
		Dependencies: &kitfx.RecipeDependencies{
			JSR: []string{"@std/path"},
		},
	}

	instr := kitfx.GetDependencyInstructions(recipe, kitfx.ProjectDetection{Type: kitfx.ProjectTypeGo})

	if len(instr.Warnings) == 0 {
		t.Error("expected warning for JSR deps in Go project")
	}
}

func TestGetDependencyInstructions_UnknownType_NoWarning(t *testing.T) {
	t.Parallel()

	recipe := &kitfx.Recipe{
		Dependencies: &kitfx.RecipeDependencies{
			Go:  []string{"github.com/pkg/errors@latest"},
			NPM: []string{"express"},
			JSR: []string{"@std/path"},
		},
	}

	instr := kitfx.GetDependencyInstructions(recipe, kitfx.ProjectDetection{Type: kitfx.ProjectTypeUnknown})

	if len(instr.Warnings) != 0 {
		t.Errorf("expected no warnings for Unknown project type, got %v", instr.Warnings)
	}

	if len(instr.Instructions) != 3 {
		t.Errorf("expected 3 instructions (go get + npm install + deno add), got %d", len(instr.Instructions))
	}
}

// ── InstallDependencies ───────────────────────────────────────────────────────

func TestInstallDependencies_SuccessfulCommand(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	results := kitfx.InstallDependencies([]string{"go version"}, cwd)

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	if !results[0].Success {
		t.Errorf("expected success for 'go version', got error: %s", results[0].Error)
	}
}

func TestInstallDependencies_FailingCommand(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	results := kitfx.InstallDependencies([]string{"nonexistent-cmd-4567"}, cwd)

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	if results[0].Success {
		t.Error("expected failure for nonexistent command")
	}

	if results[0].Error == "" {
		t.Error("expected non-empty error message")
	}
}

func TestInstallDependencies_EmptyInstruction(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	results := kitfx.InstallDependencies([]string{""}, cwd)

	if len(results) != 0 {
		t.Errorf("expected 0 results for empty instruction, got %d", len(results))
	}
}

func TestInstallDependencies_ContinuesAfterFailure(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	results := kitfx.InstallDependencies([]string{"nonexistent-cmd-4567", "go version"}, cwd)

	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}

	if results[0].Success {
		t.Error("first command should have failed")
	}

	if !results[1].Success {
		t.Errorf("second command should have succeeded, error: %s", results[1].Error)
	}
}

// ── ApplyRecipeChain ──────────────────────────────────────────────────────────

func TestApplyRecipeChain_SingleRecipe(t *testing.T) {
	t.Parallel()

	tmp := t.TempDir()
	srcFile := filepath.Join(tmp, "src.txt")

	if err := os.WriteFile(srcFile, []byte("content"), 0o644); err != nil {
		t.Fatal(err)
	}

	manifest := &kitfx.RegistryManifest{
		Name: "test",
		Recipes: []kitfx.Recipe{
			{
				Name:        "single",
				Description: "d",
				Language:    "go",
				Scale:       kitfx.RecipeScaleUtility,
				Files:       []kitfx.RecipeFile{{Source: srcFile, Target: "out.txt", Provider: kitfx.RecipeFileProviderLocal}},
			},
		},
	}

	opts := kitfx.ApplyOptions{CWD: t.TempDir(), DryRun: true}

	result, err := kitfx.ApplyRecipeChain("single", manifest, opts)
	if err != nil {
		t.Fatalf("ApplyRecipeChain: %v", err)
	}

	if len(result.Recipes) != 1 || result.Recipes[0].Name != "single" {
		t.Errorf("expected 1 recipe 'single', got %v", result.Recipes)
	}
}

func TestApplyRecipeChain_ChainOrder(t *testing.T) {
	t.Parallel()

	tmp := t.TempDir()
	baseSrc := writeSrc(t, tmp, "base.txt", "base")
	childSrc := writeSrc(t, tmp, "child.txt", "child")

	manifest := &kitfx.RegistryManifest{
		Name: "test",
		Recipes: []kitfx.Recipe{
			{
				Name: "base", Description: "d", Language: "go", Scale: kitfx.RecipeScaleUtility,
				Files: []kitfx.RecipeFile{{Source: baseSrc, Target: "base.txt", Provider: kitfx.RecipeFileProviderLocal}},
			},
			{
				Name: "child", Description: "d", Language: "go", Scale: kitfx.RecipeScaleUtility,
				Requires: []string{"base"},
				Files:    []kitfx.RecipeFile{{Source: childSrc, Target: "child.txt", Provider: kitfx.RecipeFileProviderLocal}},
			},
		},
	}

	opts := kitfx.ApplyOptions{CWD: t.TempDir(), DryRun: true}

	result, err := kitfx.ApplyRecipeChain("child", manifest, opts)
	if err != nil {
		t.Fatalf("ApplyRecipeChain chain: %v", err)
	}

	if len(result.Recipes) != 2 {
		t.Fatalf("expected 2 recipes, got %d", len(result.Recipes))
	}

	if result.Recipes[0].Name != "base" || result.Recipes[1].Name != "child" {
		t.Errorf("wrong order: %v", result.Recipes)
	}
}

func TestApplyRecipeChain_UnknownRecipe_Error(t *testing.T) {
	t.Parallel()

	manifest := &kitfx.RegistryManifest{Name: "test"}

	_, err := kitfx.ApplyRecipeChain("ghost", manifest, kitfx.ApplyOptions{CWD: t.TempDir()})
	if err == nil {
		t.Fatal("expected error for unknown recipe in chain")
	}
}

// ── ApplyRecipe — conflict phase ──────────────────────────────────────────────

func TestApplyRecipe_ConflictError_WhenFileExists(t *testing.T) {
	t.Parallel()

	tmp := t.TempDir()
	srcFile := filepath.Join(tmp, "src.txt")

	if err := os.WriteFile(srcFile, []byte("new"), 0o644); err != nil {
		t.Fatal(err)
	}

	cwd := t.TempDir()
	// Pre-create the target file.
	if err := os.WriteFile(filepath.Join(cwd, "out.txt"), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}

	recipe := &kitfx.Recipe{
		Name: "r", Description: "d", Language: "go", Scale: kitfx.RecipeScaleUtility,
		Files: []kitfx.RecipeFile{{Source: srcFile, Target: "out.txt", Provider: kitfx.RecipeFileProviderLocal}},
	}

	// Force=false, SkipExisting=false → conflict error.
	_, err := kitfx.ApplyRecipe(recipe, kitfx.ApplyOptions{CWD: cwd})
	if err == nil {
		t.Fatal("expected conflict error when file exists and Force=false, SkipExisting=false")
	}
}

func TestApplyRecipe_SkipExisting_SkipsConflict(t *testing.T) {
	t.Parallel()

	tmp := t.TempDir()
	srcFile := filepath.Join(tmp, "src.txt")

	if err := os.WriteFile(srcFile, []byte("new"), 0o644); err != nil {
		t.Fatal(err)
	}

	cwd := t.TempDir()
	if err := os.WriteFile(filepath.Join(cwd, "out.txt"), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}

	recipe := &kitfx.Recipe{
		Name: "r", Description: "d", Language: "go", Scale: kitfx.RecipeScaleUtility,
		Files: []kitfx.RecipeFile{{Source: srcFile, Target: "out.txt", Provider: kitfx.RecipeFileProviderLocal}},
	}

	result, err := kitfx.ApplyRecipe(recipe, kitfx.ApplyOptions{
		CWD:          cwd,
		SkipExisting: true,
	})
	if err != nil {
		t.Fatalf("unexpected error with SkipExisting: %v", err)
	}

	if len(result.Skipped) != 1 || result.Skipped[0] != "out.txt" {
		t.Errorf("expected out.txt in skipped, got %v", result.Skipped)
	}

	// File should be unchanged.
	data, _ := os.ReadFile(filepath.Join(cwd, "out.txt")) //nolint:gosec
	if string(data) != "old" {
		t.Errorf("file content should be unchanged, got %q", string(data))
	}
}

// ── writeFile error path (MkdirAll fails when parent is a regular file) ──────

func TestApplyRecipe_WriteFile_MkdirAllError(t *testing.T) {
	t.Parallel()

	tmp := t.TempDir()
	srcFile := filepath.Join(tmp, "src.txt")

	if err := os.WriteFile(srcFile, []byte("content"), 0o644); err != nil { //nolint:gosec
		t.Fatal(err)
	}

	cwd := t.TempDir()
	// Create a regular file where a subdirectory must be created — MkdirAll fails.
	if err := os.WriteFile(filepath.Join(cwd, "subdir"), []byte("blocker"), 0o644); err != nil { //nolint:gosec
		t.Fatal(err)
	}

	recipe := &kitfx.Recipe{
		Name: "r", Description: "d", Language: "go", Scale: kitfx.RecipeScaleUtility,
		Files: []kitfx.RecipeFile{{
			Source: srcFile, Target: "subdir/out.txt",
			Kind: kitfx.RecipeFileKindFile, Provider: kitfx.RecipeFileProviderLocal,
		}},
	}

	if _, err := kitfx.ApplyRecipe(recipe, kitfx.ApplyOptions{CWD: cwd}); err == nil {
		t.Fatal("expected MkdirAll error when parent path is a regular file, not a dir")
	}
}

// ── applyFolder (via ApplyRecipe) ─────────────────────────────────────────────

func TestApplyRecipe_FolderKind_DryRun(t *testing.T) {
	t.Parallel()

	// Source directory with two files.
	srcDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(srcDir, "a.txt"), []byte("file-a"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(srcDir, "b.txt"), []byte("file-b"), 0o644); err != nil {
		t.Fatal(err)
	}

	recipe := &kitfx.Recipe{
		Name: "folder-recipe", Description: "d", Language: "go", Scale: kitfx.RecipeScaleUtility,
		Files: []kitfx.RecipeFile{{
			Source:   srcDir,
			Target:   "output",
			Kind:     kitfx.RecipeFileKindFolder,
			Provider: kitfx.RecipeFileProviderLocal,
		}},
	}

	cwd := t.TempDir()
	result, err := kitfx.ApplyRecipe(recipe, kitfx.ApplyOptions{CWD: cwd, DryRun: true})
	if err != nil {
		t.Fatalf("ApplyRecipe folder dry-run: %v", err)
	}

	if result.Total != 2 {
		t.Errorf("expected total=2 (2 files in folder), got %d", result.Total)
	}

	// Dry-run: no files should be written.
	if _, err := os.Stat(filepath.Join(cwd, "output")); !os.IsNotExist(err) {
		t.Error("dry-run must not create output directory")
	}
}

func TestApplyRecipe_FolderKind_WritesToDisk(t *testing.T) {
	t.Parallel()

	srcDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(srcDir, "hello.txt"), []byte("world"), 0o644); err != nil {
		t.Fatal(err)
	}

	recipe := &kitfx.Recipe{
		Name: "folder-recipe", Description: "d", Language: "go", Scale: kitfx.RecipeScaleUtility,
		Files: []kitfx.RecipeFile{{
			Source:   srcDir,
			Target:   "output",
			Kind:     kitfx.RecipeFileKindFolder,
			Provider: kitfx.RecipeFileProviderLocal,
		}},
	}

	cwd := t.TempDir()
	result, err := kitfx.ApplyRecipe(recipe, kitfx.ApplyOptions{CWD: cwd})
	if err != nil {
		t.Fatalf("ApplyRecipe folder: %v", err)
	}

	if result.Total != 1 {
		t.Errorf("expected 1 file written, got %d", result.Total)
	}

	// File should be on disk.
	content, err := os.ReadFile(filepath.Join(cwd, "output", "hello.txt")) //nolint:gosec
	if err != nil {
		t.Fatalf("output/hello.txt should exist: %v", err)
	}

	if string(content) != "world" {
		t.Errorf("unexpected content: %q", string(content))
	}
}

// ── runPostInstall (via ApplyRecipe) ──────────────────────────────────────────

func TestApplyRecipe_PostInstall_RunsCommand(t *testing.T) {
	t.Parallel()

	tmp := t.TempDir()
	srcFile := filepath.Join(tmp, "src.txt")

	if err := os.WriteFile(srcFile, []byte("content"), 0o644); err != nil {
		t.Fatal(err)
	}

	cwd := t.TempDir()

	recipe := &kitfx.Recipe{
		Name: "post", Description: "d", Language: "go", Scale: kitfx.RecipeScaleUtility,
		Files:       []kitfx.RecipeFile{{Source: srcFile, Target: "out.txt", Provider: kitfx.RecipeFileProviderLocal}},
		PostInstall: []string{"go version"},
	}

	result, err := kitfx.ApplyRecipe(recipe, kitfx.ApplyOptions{CWD: cwd, DryRun: false})
	if err != nil {
		t.Fatalf("ApplyRecipe post-install: %v", err)
	}

	if len(result.PostInstallRan) != 1 || result.PostInstallRan[0] != "go version" {
		t.Errorf("expected post-install 'go version', got %v", result.PostInstallRan)
	}
}

func TestApplyRecipe_PostInstall_FailingCommand_NonFatal(t *testing.T) {
	t.Parallel()

	tmp := t.TempDir()
	srcFile := filepath.Join(tmp, "src.txt")

	if err := os.WriteFile(srcFile, []byte("content"), 0o644); err != nil {
		t.Fatal(err)
	}

	cwd := t.TempDir()

	recipe := &kitfx.Recipe{
		Name: "post-fail", Description: "d", Language: "go", Scale: kitfx.RecipeScaleUtility,
		Files:       []kitfx.RecipeFile{{Source: srcFile, Target: "out.txt", Provider: kitfx.RecipeFileProviderLocal}},
		PostInstall: []string{"nonexistent-postinstall-cmd"},
	}

	// Failing post-install is non-fatal — ApplyRecipe should still succeed.
	result, err := kitfx.ApplyRecipe(recipe, kitfx.ApplyOptions{CWD: cwd, DryRun: false})
	if err != nil {
		t.Fatalf("ApplyRecipe must not fail for failing post-install: %v", err)
	}

	// Command is still appended to PostInstallRan even if it failed.
	if len(result.PostInstallRan) != 1 {
		t.Errorf("expected 1 post-install ran, got %v", result.PostInstallRan)
	}
}

func TestApplyRecipe_PostInstall_EmptyCommand_Noop(t *testing.T) {
	t.Parallel()

	tmp := t.TempDir()
	srcFile := filepath.Join(tmp, "src.txt")

	if err := os.WriteFile(srcFile, []byte("content"), 0o644); err != nil { //nolint:gosec
		t.Fatal(err)
	}

	cwd := t.TempDir()

	recipe := &kitfx.Recipe{
		Name: "post-empty", Description: "d", Language: "go", Scale: kitfx.RecipeScaleUtility,
		Files:       []kitfx.RecipeFile{{Source: srcFile, Target: "out.txt", Provider: kitfx.RecipeFileProviderLocal}},
		PostInstall: []string{""}, // empty string → strings.Fields returns [] → return nil
	}

	result, err := kitfx.ApplyRecipe(recipe, kitfx.ApplyOptions{CWD: cwd})
	if err != nil {
		t.Fatalf("empty post-install command must not error: %v", err)
	}

	if len(result.PostInstallRan) != 1 || result.PostInstallRan[0] != "" {
		t.Errorf("expected empty command recorded in PostInstallRan, got %v", result.PostInstallRan)
	}
}

// ── readLocalFolder / FetchRecipeFolder ───────────────────────────────────────

func TestFetchRecipeFolder_LocalProvider_ReadsFiles(t *testing.T) {
	t.Parallel()

	srcDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(srcDir, "x.txt"), []byte("x-content"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(srcDir, "y.txt"), []byte("y-content"), 0o644); err != nil {
		t.Fatal(err)
	}

	f := &kitfx.RecipeFile{
		Source:   srcDir,
		Target:   "target",
		Kind:     kitfx.RecipeFileKindFolder,
		Provider: kitfx.RecipeFileProviderLocal,
	}

	files, err := kitfx.FetchRecipeFolder(f, &kitfx.Recipe{}, "")
	if err != nil {
		t.Fatalf("FetchRecipeFolder: %v", err)
	}

	if len(files) != 2 {
		t.Errorf("expected 2 files, got %d", len(files))
	}
}

func TestFetchRecipeFolder_EmptyDir(t *testing.T) {
	t.Parallel()

	srcDir := t.TempDir()

	f := &kitfx.RecipeFile{
		Source:   srcDir,
		Provider: kitfx.RecipeFileProviderLocal,
		Kind:     kitfx.RecipeFileKindFolder,
	}

	files, err := kitfx.FetchRecipeFolder(f, &kitfx.Recipe{}, "")
	if err != nil {
		t.Fatalf("unexpected error for empty dir: %v", err)
	}

	if len(files) != 0 {
		t.Errorf("expected 0 files for empty dir, got %d", len(files))
	}
}

// ── fetchRegistryHTTP (via FetchRegistry with http URL) ───────────────────────

func TestFetchRegistry_HTTPUrl_ReturnsManifest(t *testing.T) {
	t.Parallel()

	manifest := kitfx.RegistryManifest{
		Name:    "http-registry",
		Recipes: []kitfx.Recipe{},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(manifest)
	}))
	defer server.Close()

	got, err := kitfx.FetchRegistry(".", server.URL)
	if err != nil {
		t.Fatalf("FetchRegistry HTTP: %v", err)
	}

	if got.Name != "http-registry" {
		t.Errorf("expected name 'http-registry', got %q", got.Name)
	}
}

func TestFetchRegistry_HTTPUrl_Non200_Error(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	_, err := kitfx.FetchRegistry(".", server.URL)
	if err == nil {
		t.Fatal("expected error for HTTP 404 response")
	}
}

func TestFetchRegistry_HTTPUrl_InvalidJSON_Error(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("not-valid-json{"))
	}))
	defer server.Close()

	_, err := kitfx.FetchRegistry(".", server.URL)
	if err == nil {
		t.Fatal("expected error for invalid JSON response")
	}
}

// ── CloneRecipe — opts.CWD already set branch ─────────────────────────────────

// ── fetchRegistryFile error path ──────────────────────────────────────────────

func TestFetchRegistry_FilePath_NotFound_Error(t *testing.T) {
	t.Parallel()

	// Passing a non-existent file path (not http, not empty) → fetchRegistryFile → error.
	_, err := kitfx.FetchRegistry(".", "/nonexistent-path/eser-registry.json")
	if err == nil {
		t.Fatal("expected error for nonexistent registry file")
	}
}

// ── readLocalFile error path ──────────────────────────────────────────────────

func TestFetchRecipeFile_LocalProvider_FileNotFound_Error(t *testing.T) {
	t.Parallel()

	f := &kitfx.RecipeFile{
		Source:   "/nonexistent-file-1234567.txt",
		Target:   "out.txt",
		Provider: kitfx.RecipeFileProviderLocal,
	}

	_, err := kitfx.FetchRecipeFile(f, &kitfx.Recipe{}, "")
	if err == nil {
		t.Fatal("expected error for nonexistent source file")
	}
}

// ── FetchRecipeFile GitHub error path (non-repo registry URL) ─────────────────

func TestFetchRecipeFile_GitHubProvider_NonRepoURL_Error(t *testing.T) {
	t.Parallel()

	f := &kitfx.RecipeFile{
		Source:   "src/file.txt",
		Target:   "out.txt",
		Provider: kitfx.RecipeFileProviderGitHub,
	}

	// "just-a-name" is a name specifier, not a repo specifier.
	_, err := kitfx.FetchRecipeFile(f, &kitfx.Recipe{}, "just-a-name")
	if err == nil {
		t.Fatal("expected error for GitHub provider with non-repo registry URL")
	}
}

// ── FetchRecipeFolder GitHub error path (non-repo registry URL) ───────────────

func TestFetchRecipeFolder_GitHubProvider_NonRepoURL_Error(t *testing.T) {
	t.Parallel()

	f := &kitfx.RecipeFile{
		Source:   "src/folder",
		Target:   "output",
		Provider: kitfx.RecipeFileProviderGitHub,
		Kind:     kitfx.RecipeFileKindFolder,
	}

	_, err := kitfx.FetchRecipeFolder(f, &kitfx.Recipe{}, "not-a-repo-url")
	if err == nil {
		t.Fatal("expected error for GitHub provider with non-repo registry URL")
	}
}

// ── CloneRecipe — opts.CWD empty branch ───────────────────────────────────────

func TestCloneRecipe_EmptyCWD_UsesCWDParam(t *testing.T) {
	env := setupKitEnv(t, func(reg string) []kitfx.Recipe {
		src := writeSrc(t, reg, "src/f.txt", "content")
		return []kitfx.Recipe{localRecipe("r", src, "f.txt")}
	})

	// opts.CWD intentionally empty — CloneRecipe should fill it from the cwd parameter.
	result, err := kitfx.CloneRecipe(context.Background(), "r", env.registryDir, kitfx.ApplyOptions{
		DryRun:      true,
		RegistryURL: env.registryURL(),
	})
	if err != nil {
		t.Fatalf("CloneRecipe with empty opts.CWD: %v", err)
	}

	if len(result.Recipes) != 1 {
		t.Fatalf("expected 1 recipe, got %d", len(result.Recipes))
	}
}

// ── NewProject — MkdirAll error path ─────────────────────────────────────────

func TestNewProject_MkdirAllError(t *testing.T) {
	t.Parallel()

	tmp := t.TempDir()
	// A regular file at "blocker" prevents MkdirAll from creating "blocker/project".
	blocker := filepath.Join(tmp, "blocker")
	if err := os.WriteFile(blocker, []byte("x"), 0o644); err != nil { //nolint:gosec
		t.Fatal(err)
	}

	_, err := kitfx.NewProject(context.Background(), "r", filepath.Join(blocker, "project"), kitfx.ApplyOptions{})
	if err == nil {
		t.Fatal("expected MkdirAll error when parent component is a regular file")
	}
}

func TestCloneRecipe_CWDAlreadySet_UsesProvidedCWD(t *testing.T) {
	env := setupKitEnv(t, func(reg string) []kitfx.Recipe {
		src := writeSrc(t, reg, "src/f.txt", "content")
		return []kitfx.Recipe{localRecipe("r", src, "f.txt")}
	})

	// Provide a separate targetDir different from registryDir.
	targetDir := t.TempDir()

	// opts.CWD is pre-filled → CloneRecipe should not overwrite it with cwd param.
	result, err := kitfx.CloneRecipe(context.Background(), "r", env.registryDir, kitfx.ApplyOptions{
		CWD:         targetDir,
		RegistryURL: env.registryURL(),
	})
	if err != nil {
		t.Fatalf("CloneRecipe with pre-set CWD: %v", err)
	}

	if len(result.Recipes) != 1 {
		t.Fatalf("expected 1 recipe, got %d", len(result.Recipes))
	}

	// File should land in targetDir, not in registryDir.
	if _, err := os.Stat(filepath.Join(targetDir, "f.txt")); err != nil {
		t.Fatalf("file should exist in pre-set CWD (%s): %v", targetDir, err)
	}
}
