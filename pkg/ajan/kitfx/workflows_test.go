// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Phase D tests: CloneRecipe, NewProject, UpdateRecipe, kit workflow tools.

package kitfx_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/eser/stack/pkg/ajan/kitfx"
)

// ─── test harness ─────────────────────────────────────────────────────────────

// kitEnv is a test environment with a registry dir (contains manifest + sources)
// and a project dir (target for recipe application).
type kitEnv struct {
	registryDir string
	projectDir  string
}

// setupKitEnv creates both dirs, lets setupFn write source files and return
// recipes (with absolute source paths already set), then writes the manifest.
func setupKitEnv(t *testing.T, setupFn func(reg string) []kitfx.Recipe) *kitEnv {
	t.Helper()
	reg := t.TempDir()
	prj := t.TempDir()

	var recipes []kitfx.Recipe
	if setupFn != nil {
		recipes = setupFn(reg)
	}

	manifest := kitfx.RegistryManifest{Name: "test-registry", Recipes: recipes}
	data, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(reg, ".eser"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(reg, ".eser", "recipes.json"), data, 0o644); err != nil {
		t.Fatal(err)
	}

	return &kitEnv{registryDir: reg, projectDir: prj}
}

// writeSrc writes content to reg/rel and returns the absolute path.
func writeSrc(t *testing.T, reg, rel, content string) string {
	t.Helper()
	abs := filepath.Join(reg, rel)
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return abs
}

// registryURL returns the absolute path to the manifest.
func (e *kitEnv) registryURL() string {
	return filepath.Join(e.registryDir, ".eser", "recipes.json")
}

// localRecipe builds a simple single-file local recipe.
func localRecipe(name, srcPath, target string) kitfx.Recipe {
	return kitfx.Recipe{
		Name:        name,
		Description: "test recipe",
		Language:    "go",
		Scale:       kitfx.RecipeScaleUtility,
		Files:       []kitfx.RecipeFile{{Source: srcPath, Target: target, Provider: kitfx.RecipeFileProviderLocal}},
	}
}

// ─── CloneRecipe ──────────────────────────────────────────────────────────────

func TestCloneRecipe_WritesFiles(t *testing.T) {
	env := setupKitEnv(t, func(reg string) []kitfx.Recipe {
		src := writeSrc(t, reg, "src/hello.txt", "hello {{.name}}")
		return []kitfx.Recipe{localRecipe("greet", src, "hello.txt")}
	})

	result, err := kitfx.CloneRecipe(context.Background(), "greet", env.registryDir, kitfx.ApplyOptions{
		CWD:       env.projectDir,
		Variables: map[string]string{"name": "Eser"},
	})
	if err != nil {
		t.Fatalf("CloneRecipe: %v", err)
	}
	if len(result.Recipes) != 1 || result.Recipes[0].Name != "greet" {
		t.Fatalf("expected 1 recipe 'greet', got %v", result.Recipes)
	}
	if result.Recipes[0].Result.Total != 1 {
		t.Fatalf("expected 1 file written, got %d", result.Recipes[0].Result.Total)
	}
	// Verify variable substitution was applied
	data, _ := os.ReadFile(filepath.Join(env.projectDir, "hello.txt"))
	if string(data) != "hello Eser" {
		t.Fatalf("expected 'hello Eser', got %q", string(data))
	}
}

func TestCloneRecipe_RegistryNotFound_ReturnsError(t *testing.T) {
	emptyDir := t.TempDir()
	_, err := kitfx.CloneRecipe(context.Background(), "any", emptyDir, kitfx.ApplyOptions{CWD: emptyDir})
	if err == nil {
		t.Fatal("expected error when no .eser/recipes.json found")
	}
}

func TestCloneRecipe_RecipeNotFound_ReturnsError(t *testing.T) {
	env := setupKitEnv(t, func(_ string) []kitfx.Recipe { return nil }) // empty manifest
	_, err := kitfx.CloneRecipe(context.Background(), "ghost", env.registryDir, kitfx.ApplyOptions{CWD: env.projectDir})
	if err == nil {
		t.Fatal("expected error when recipe is absent from manifest")
	}
}

func TestCloneRecipe_DependencyChain_OrderedResults(t *testing.T) {
	env := setupKitEnv(t, func(reg string) []kitfx.Recipe {
		baseSrc := writeSrc(t, reg, "src/base.txt", "base")
		childSrc := writeSrc(t, reg, "src/child.txt", "child")
		base := localRecipe("base", baseSrc, "base.txt")
		child := kitfx.Recipe{
			Name: "child", Description: "d", Language: "go", Scale: kitfx.RecipeScaleUtility,
			Requires: []string{"base"},
			Files:    []kitfx.RecipeFile{{Source: childSrc, Target: "child.txt", Provider: kitfx.RecipeFileProviderLocal}},
		}
		return []kitfx.Recipe{base, child}
	})

	result, err := kitfx.CloneRecipe(context.Background(), "child", env.registryDir, kitfx.ApplyOptions{
		CWD: env.projectDir,
	})
	if err != nil {
		t.Fatalf("CloneRecipe chain: %v", err)
	}
	if len(result.Recipes) != 2 {
		t.Fatalf("expected 2 recipes in chain, got %d", len(result.Recipes))
	}
	if result.Recipes[0].Name != "base" || result.Recipes[1].Name != "child" {
		t.Fatalf("unexpected dependency order: %v", result.Recipes)
	}
}

func TestCloneRecipe_DryRun_NoFilesWritten(t *testing.T) {
	env := setupKitEnv(t, func(reg string) []kitfx.Recipe {
		src := writeSrc(t, reg, "src/f.txt", "content")
		return []kitfx.Recipe{localRecipe("dry", src, "f.txt")}
	})

	result, err := kitfx.CloneRecipe(context.Background(), "dry", env.registryDir, kitfx.ApplyOptions{
		CWD:    env.projectDir,
		DryRun: true,
	})
	if err != nil {
		t.Fatalf("CloneRecipe dry-run: %v", err)
	}
	if result.Recipes[0].Result.Total != 1 {
		t.Fatalf("expected total=1 in dry-run result, got %d", result.Recipes[0].Result.Total)
	}
	if _, err := os.Stat(filepath.Join(env.projectDir, "f.txt")); !os.IsNotExist(err) {
		t.Fatal("dry-run must not write files to disk")
	}
}

// ─── NewProject ───────────────────────────────────────────────────────────────

func TestNewProject_CreatesTargetDir(t *testing.T) {
	nonExistent := filepath.Join(t.TempDir(), "new-project")
	if _, err := os.Stat(nonExistent); !os.IsNotExist(err) {
		t.Fatal("precondition: target dir must not exist")
	}

	// Registry lookup will fail (no recipes.json), but dir must still be created.
	_, _ = kitfx.NewProject(context.Background(), "any", nonExistent, kitfx.ApplyOptions{})

	if _, err := os.Stat(nonExistent); os.IsNotExist(err) {
		t.Fatal("NewProject must create the target directory even when recipe lookup fails")
	}
}

func TestNewProject_WritesFilesToTargetDir(t *testing.T) {
	env := setupKitEnv(t, func(reg string) []kitfx.Recipe {
		src := writeSrc(t, reg, "src/main.go", "package main")
		return []kitfx.Recipe{localRecipe("starter", src, "main.go")}
	})

	targetDir := filepath.Join(t.TempDir(), "my-app")

	result, err := kitfx.NewProject(context.Background(), "starter", targetDir, kitfx.ApplyOptions{
		RegistryURL: env.registryURL(),
	})
	if err != nil {
		t.Fatalf("NewProject: %v", err)
	}
	if len(result.Recipes) != 1 || result.Recipes[0].Result.Total != 1 {
		t.Fatalf("expected 1 file written, got %+v", result.Recipes)
	}
	if _, err := os.Stat(filepath.Join(targetDir, "main.go")); err != nil {
		t.Fatalf("main.go must exist in targetDir: %v", err)
	}
}

// ─── UpdateRecipe ─────────────────────────────────────────────────────────────

func TestUpdateRecipe_OverwritesExistingFile(t *testing.T) {
	env := setupKitEnv(t, func(reg string) []kitfx.Recipe {
		src := writeSrc(t, reg, "src/config.txt", "new-content")
		return []kitfx.Recipe{localRecipe("cfg", src, "config.txt")}
	})

	// Pre-write so the file exists
	if err := os.WriteFile(filepath.Join(env.projectDir, "config.txt"), []byte("old-content"), 0o644); err != nil {
		t.Fatal(err)
	}

	_, err := kitfx.UpdateRecipe(context.Background(), "cfg", env.projectDir, kitfx.ApplyOptions{
		RegistryURL: env.registryURL(),
		CWD:         env.projectDir,
	})
	if err != nil {
		t.Fatalf("UpdateRecipe: %v", err)
	}

	data, _ := os.ReadFile(filepath.Join(env.projectDir, "config.txt"))
	if string(data) != "new-content" {
		t.Fatalf("expected 'new-content' after update, got %q", string(data))
	}
}

func TestUpdateRecipe_SetsForceTrue_NoErrorOnExistingFile(t *testing.T) {
	env := setupKitEnv(t, func(reg string) []kitfx.Recipe {
		src := writeSrc(t, reg, "src/x.txt", "x")
		return []kitfx.Recipe{localRecipe("x-recipe", src, "x.txt")}
	})

	_ = os.WriteFile(filepath.Join(env.projectDir, "x.txt"), []byte("old"), 0o644)

	// Without Force this would error ("file already exists"); UpdateRecipe must succeed.
	_, err := kitfx.UpdateRecipe(context.Background(), "x-recipe", env.projectDir, kitfx.ApplyOptions{
		RegistryURL: env.registryURL(),
		CWD:         env.projectDir,
	})
	if err != nil {
		t.Fatalf("UpdateRecipe must succeed when file exists (Force=true): %v", err)
	}
}

// ─── dynamic step injection ───────────────────────────────────────────────────

func TestKitWorkflow_DynamicStepInjection_ThreeRecipes(t *testing.T) {
	env := setupKitEnv(t, func(reg string) []kitfx.Recipe {
		srcC := writeSrc(t, reg, "src/c.txt", "c")
		srcB := writeSrc(t, reg, "src/b.txt", "b")
		srcA := writeSrc(t, reg, "src/a.txt", "a")
		rC := localRecipe("c", srcC, "c.txt")
		rB := kitfx.Recipe{
			Name: "b", Description: "d", Language: "go", Scale: kitfx.RecipeScaleUtility,
			Requires: []string{"c"},
			Files:    []kitfx.RecipeFile{{Source: srcB, Target: "b.txt", Provider: kitfx.RecipeFileProviderLocal}},
		}
		rA := kitfx.Recipe{
			Name: "a", Description: "d", Language: "go", Scale: kitfx.RecipeScaleUtility,
			Requires: []string{"b"},
			Files:    []kitfx.RecipeFile{{Source: srcA, Target: "a.txt", Provider: kitfx.RecipeFileProviderLocal}},
		}
		return []kitfx.Recipe{rA, rB, rC}
	})

	result, err := kitfx.CloneRecipe(context.Background(), "a", env.registryDir, kitfx.ApplyOptions{
		CWD: env.projectDir,
	})
	if err != nil {
		t.Fatalf("3-recipe chain: %v", err)
	}
	// kit-resolve-chain injects 3 kit-apply-recipe steps via NextSteps
	if len(result.Recipes) != 3 {
		t.Fatalf("expected 3 dynamic steps, got %d: %v", len(result.Recipes), result.Recipes)
	}
	for _, name := range []string{"c.txt", "b.txt", "a.txt"} {
		if _, err := os.Stat(filepath.Join(env.projectDir, name)); err != nil {
			t.Fatalf("expected %s to exist: %v", name, err)
		}
	}
}
