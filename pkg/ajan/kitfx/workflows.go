// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"context"
	"fmt"
	"os"

	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// ─── Public entry points ──────────────────────────────────────────────────────

// CloneRecipe applies a named recipe (and its full dependency chain) from the
// registry to cwd. The application is driven by a workflowfx workflow so that
// each recipe in the chain becomes a dynamically-injected step.
func CloneRecipe(ctx context.Context, recipeName, cwd string, opts ApplyOptions) (ApplyChainResult, error) {
	if opts.CWD == "" {
		opts.CWD = cwd
	}

	return runKitWorkflow(ctx, recipeName, cwd, opts)
}

// NewProject creates targetDir (and any parents) and then applies the recipe
// chain to it — equivalent to CloneRecipe on a freshly created directory.
func NewProject(ctx context.Context, recipeName, targetDir string, opts ApplyOptions) (ApplyChainResult, error) {
	if err := os.MkdirAll(targetDir, 0o755); err != nil { //nolint:gosec
		return ApplyChainResult{}, fmt.Errorf("creating project dir %q: %w", targetDir, err)
	}

	opts.CWD = targetDir

	return runKitWorkflow(ctx, recipeName, targetDir, opts)
}

// UpdateRecipe re-applies a recipe chain to an existing project with Force=true,
// overwriting files that have changed.
func UpdateRecipe(ctx context.Context, recipeName, cwd string, opts ApplyOptions) (ApplyChainResult, error) {
	opts.Force = true
	opts.CWD = cwd

	return runKitWorkflow(ctx, recipeName, cwd, opts)
}

// ─── Workflow runner ──────────────────────────────────────────────────────────

func runKitWorkflow(ctx context.Context, recipeName, cwd string, opts ApplyOptions) (ApplyChainResult, error) {
	r := workflowfx.NewRegistry()
	r.Register(&kitFetchRegistryTool{})
	r.Register(&kitResolveChainTool{})
	r.Register(&kitApplyRecipeTool{})

	wf := workflowfx.Create("kit-run").On("run").
		Step("kit-fetch-registry", workflowfx.StepOpts{
			"recipeName": recipeName,
			"applyOpts":  opts,
		}).
		MustBuild()

	var chainResult ApplyChainResult

	runOpts := &workflowfx.RunOptions{
		Root: cwd,
		OnStepEnd: func(name string, result workflowfx.StepResult) {
			if name != "kit-apply-recipe" {
				return
			}

			recipeName, _ := result.Stats["recipeName"].(string)
			written, _ := result.Stats["written"].([]string)
			skipped, _ := result.Stats["skipped"].([]string)
			total, _ := result.Stats["total"].(int)
			ran, _ := result.Stats["postInstallRan"].([]string)

			chainResult.Recipes = append(chainResult.Recipes, NamedApplyResult{
				Name: recipeName,
				Result: ApplyResult{
					Written:        written,
					Skipped:        skipped,
					Total:          total,
					PostInstallRan: ran,
				},
			})
		},
	}

	_, err := workflowfx.RunWorkflow(ctx, wf, r, runOpts)

	return chainResult, err
}

// ─── kit-fetch-registry tool ──────────────────────────────────────────────────

// kitFetchRegistryTool fetches the registry manifest and injects a
// kit-resolve-chain step with the manifest in its options.
type kitFetchRegistryTool struct{}

func (t *kitFetchRegistryTool) Name() string        { return "kit-fetch-registry" }
func (t *kitFetchRegistryTool) Description() string { return "fetch kit registry manifest" }

func (t *kitFetchRegistryTool) Run(_ context.Context, opts map[string]any) (*workflowfx.WorkflowToolResult, error) {
	recipeName, _ := opts["recipeName"].(string)
	applyOpts, _ := opts["applyOpts"].(ApplyOptions)
	root, _ := opts["root"].(string)

	if root == "" {
		root = "."
	}

	if applyOpts.CWD == "" {
		applyOpts.CWD = root
	}

	manifest, err := FetchRegistry(root, applyOpts.RegistryURL)
	if err != nil {
		return nil, fmt.Errorf("kit-fetch-registry: %w", err)
	}

	return &workflowfx.WorkflowToolResult{
		Name:   t.Name(),
		Passed: true,
		Stats:  map[string]any{"recipeCount": len(manifest.Recipes)},
		NextSteps: []workflowfx.StepConfig{{
			Name: "kit-resolve-chain",
			Options: map[string]any{
				"manifest":   manifest,
				"recipeName": recipeName,
				"applyOpts":  applyOpts,
			},
		}},
	}, nil
}

// ─── kit-resolve-chain tool ───────────────────────────────────────────────────

// kitResolveChainTool resolves the dependency chain for a recipe and injects
// one kit-apply-recipe step per recipe via NextSteps.
type kitResolveChainTool struct{}

func (t *kitResolveChainTool) Name() string        { return "kit-resolve-chain" }
func (t *kitResolveChainTool) Description() string { return "resolve recipe dependency chain" }

func (t *kitResolveChainTool) Run(_ context.Context, opts map[string]any) (*workflowfx.WorkflowToolResult, error) {
	manifest, _ := opts["manifest"].(*RegistryManifest)
	recipeName, _ := opts["recipeName"].(string)
	applyOpts, _ := opts["applyOpts"].(ApplyOptions)

	if manifest == nil {
		return nil, fmt.Errorf("kit-resolve-chain: manifest is required")
	}

	chain, err := ResolveRequires(recipeName, manifest.Recipes)
	if err != nil {
		return nil, fmt.Errorf("kit-resolve-chain: %w", err)
	}

	nextSteps := make([]workflowfx.StepConfig, len(chain))
	for i, recipe := range chain {
		r := recipe // capture for closure safety

		nextSteps[i] = workflowfx.StepConfig{
			Name: "kit-apply-recipe",
			Options: map[string]any{
				"recipe":    r,
				"applyOpts": applyOpts,
			},
		}
	}

	return &workflowfx.WorkflowToolResult{
		Name:      t.Name(),
		Passed:    true,
		Stats:     map[string]any{"chainLength": len(chain)},
		NextSteps: nextSteps,
	}, nil
}

// ─── kit-apply-recipe tool ────────────────────────────────────────────────────

// kitApplyRecipeTool applies a single recipe to the project directory.
type kitApplyRecipeTool struct{}

func (t *kitApplyRecipeTool) Name() string        { return "kit-apply-recipe" }
func (t *kitApplyRecipeTool) Description() string { return "apply a single recipe to the project" }

func (t *kitApplyRecipeTool) Run(_ context.Context, opts map[string]any) (*workflowfx.WorkflowToolResult, error) {
	recipe, _ := opts["recipe"].(Recipe)
	applyOpts, _ := opts["applyOpts"].(ApplyOptions)

	result, err := ApplyRecipe(&recipe, applyOpts)
	if err != nil {
		return nil, fmt.Errorf("kit-apply-recipe: %w", err)
	}

	return &workflowfx.WorkflowToolResult{
		Name:   t.Name(),
		Passed: true,
		Stats: map[string]any{
			"recipeName":     recipe.Name,
			"written":        result.Written,
			"skipped":        result.Skipped,
			"total":          result.Total,
			"postInstallRan": result.PostInstallRan,
		},
	}, nil
}
