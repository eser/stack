// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"context"
	"encoding/json"
	"os"
	"strings"

	"github.com/eser/stack/pkg/ajan/kitfx"
)

// ---------------------------------------------------------------------------
// Kit (recipe/scaffolding) bridge
// ---------------------------------------------------------------------------

// kitListRecipesRequest is the JSON request for EserAjanKitListRecipes.
type kitListRecipesRequest struct {
	RegistryURL string `json:"registryUrl,omitempty"`
	CWD         string `json:"cwd,omitempty"`
	Language    string `json:"language,omitempty"`
	Scale       string `json:"scale,omitempty"`
	Tag         string `json:"tag,omitempty"`
}

// kitListRecipesManifest carries top-level registry metadata in the list response.
type kitListRecipesManifest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Author      string `json:"author"`
	RegistryURL string `json:"registryUrl"`
}

// kitListRecipesResponse is the JSON response for EserAjanKitListRecipes.
type kitListRecipesResponse struct {
	Manifest *kitListRecipesManifest `json:"manifest,omitempty"`
	Recipes  []kitfx.Recipe          `json:"recipes,omitempty"`
	Error    string                  `json:"error,omitempty"`
}

// kitApplyRecipeRequest is the JSON request for EserAjanKitApplyRecipe.
type kitApplyRecipeRequest struct {
	RecipeName   string            `json:"recipeName"`
	RegistryURL  string            `json:"registryUrl,omitempty"`
	CWD          string            `json:"cwd,omitempty"`
	Force        bool              `json:"force,omitempty"`
	SkipExisting bool              `json:"skipExisting,omitempty"`
	DryRun       bool              `json:"dryRun,omitempty"`
	Verbose      bool              `json:"verbose,omitempty"`
	Variables    map[string]string `json:"variables,omitempty"`
}

// kitApplyRecipeResponse is the JSON response for EserAjanKitApplyRecipe.
type kitApplyRecipeResponse struct {
	Recipes []kitApplyRecipeResult `json:"recipes,omitempty"`
	Error   string                 `json:"error,omitempty"`
}

// kitApplyRecipeResult mirrors kitfx.NamedApplyResult for JSON serialization.
type kitApplyRecipeResult struct {
	Name           string   `json:"name"`
	Written        []string `json:"written,omitempty"`
	Skipped        []string `json:"skipped,omitempty"`
	Total          int      `json:"total"`
	PostInstallRan []string `json:"postInstallRan,omitempty"`
	// PostInstallFailed lists the post-install commands that could not start,
	// exited with a non-zero status or timed out; PostInstallRan includes them.
	PostInstallFailed []string `json:"postInstallFailed,omitempty"`
}

// newKitApplyRecipeResults converts the recipes of an applied chain to their
// wire form.
func newKitApplyRecipeResults(recipes []kitfx.NamedApplyResult) []kitApplyRecipeResult {
	results := make([]kitApplyRecipeResult, 0, len(recipes))
	for _, nr := range recipes {
		results = append(results, kitApplyRecipeResult{
			Name:              nr.Name,
			Written:           nr.Result.Written,
			Skipped:           nr.Result.Skipped,
			Total:             nr.Result.Total,
			PostInstallRan:    nr.Result.PostInstallRan,
			PostInstallFailed: nr.Result.PostInstallFailed,
		})
	}

	return results
}

// bridgeKitListRecipes fetches a registry manifest and returns all recipe metadata.
func bridgeKitListRecipes(requestJSON string) string {
	var req kitListRecipesRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(kitListRecipesResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	cwd := req.CWD
	if cwd == "" {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			return marshalResponse(kitListRecipesResponse{Error: "cannot determine cwd: " + err.Error()}) //nolint:exhaustruct
		}
	}

	manifest, err := kitfx.FetchRegistry(context.Background(), cwd, req.RegistryURL)
	if err != nil {
		return marshalResponse(kitListRecipesResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	recipes := kitfx.FilterRecipes(manifest.Recipes, kitfx.FilterOptions{
		Language: req.Language,
		Scale:    req.Scale,
		Tag:      req.Tag,
	})

	return marshalResponse(kitListRecipesResponse{
		Manifest: &kitListRecipesManifest{
			Name:        manifest.Name,
			Description: manifest.Description,
			Author:      manifest.Author,
			RegistryURL: manifest.RegistryURL,
		},
		Recipes: recipes,
	})
}

// bridgeKitApplyRecipe resolves and applies a recipe dependency chain.
func bridgeKitApplyRecipe(requestJSON string) string {
	var req kitApplyRecipeRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	if req.RecipeName == "" {
		return marshalResponse(kitApplyRecipeResponse{Error: "recipeName is required"}) //nolint:exhaustruct
	}

	cwd := req.CWD
	if cwd == "" {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			return marshalResponse(kitApplyRecipeResponse{Error: "cannot determine cwd: " + err.Error()}) //nolint:exhaustruct
		}
	}

	manifest, err := kitfx.FetchRegistry(context.Background(), cwd, req.RegistryURL)
	if err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	chainResult, err := kitfx.ApplyRecipeChain(context.Background(), req.RecipeName, manifest, bridgeKitOptions(manifest, kitfx.ApplyOptions{
		CWD:          cwd,
		RegistryURL:  req.RegistryURL,
		Force:        req.Force,
		SkipExisting: req.SkipExisting,
		DryRun:       req.DryRun,
		Verbose:      req.Verbose,
		Variables:    req.Variables,
	}))
	if err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(kitApplyRecipeResponse{Recipes: newKitApplyRecipeResults(chainResult.Recipes)}) //nolint:exhaustruct
}

// kitCloneRecipeRequest is the JSON request for EserAjanKitCloneRecipe.
type kitCloneRecipeRequest struct {
	Specifier    string            `json:"specifier"`
	CWD          string            `json:"cwd,omitempty"`
	ProjectName  string            `json:"projectName,omitempty"`
	DryRun       bool              `json:"dryRun,omitempty"`
	Force        bool              `json:"force,omitempty"`
	SkipExisting bool              `json:"skipExisting,omitempty"`
	Verbose      bool              `json:"verbose,omitempty"`
	Variables    map[string]string `json:"variables,omitempty"`
}

// kitNewProjectRequest is the JSON request for EserAjanKitNewProject.
type kitNewProjectRequest struct {
	TemplateName   string            `json:"templateName"`
	ProjectName    string            `json:"projectName"`
	TargetDir      string            `json:"targetDir"`
	RegistrySource string            `json:"registrySource,omitempty"`
	Variables      map[string]string `json:"variables,omitempty"`
}

// kitUpdateRecipeRequest is the JSON request for EserAjanKitUpdateRecipe.
type kitUpdateRecipeRequest struct {
	RecipeName     string `json:"recipeName"`
	CWD            string `json:"cwd,omitempty"`
	RegistrySource string `json:"registrySource,omitempty"`
	DryRun         bool   `json:"dryRun,omitempty"`
	Verbose        bool   `json:"verbose,omitempty"`
}

// bridgeKitCloneRecipe fetches a recipe registry from a GitHub repo specifier
// and applies the first recipe (or chain) to cwd.
func bridgeKitCloneRecipe(requestJSON string) string {
	var req kitCloneRecipeRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	if req.Specifier == "" {
		return marshalResponse(kitApplyRecipeResponse{Error: "specifier is required"}) //nolint:exhaustruct
	}

	resolved := kitfx.ResolveSpecifier(req.Specifier)
	if resolved.Kind != "repo" {
		return marshalResponse(kitApplyRecipeResponse{Error: "specifier must be a GitHub repo (e.g. gh:owner/repo#ref)"}) //nolint:exhaustruct
	}

	manifest, err := kitfx.FetchRegistryFromRepo(context.Background(), resolved.Owner, resolved.Repo, resolved.Ref)
	if err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	if len(manifest.Recipes) == 0 {
		return marshalResponse(kitApplyRecipeResponse{Error: "no recipes found in registry"}) //nolint:exhaustruct
	}

	cwd := req.CWD
	if cwd == "" {
		cwd, err = os.Getwd()
		if err != nil {
			return marshalResponse(kitApplyRecipeResponse{Error: "cannot determine cwd: " + err.Error()}) //nolint:exhaustruct
		}
	}

	targetDir := cwd
	if req.ProjectName != "" {
		targetDir = cwd + "/" + req.ProjectName
		if mkErr := os.MkdirAll(targetDir, 0o755); mkErr != nil { //nolint:gosec
			return marshalResponse(kitApplyRecipeResponse{Error: "cannot create project dir: " + mkErr.Error()}) //nolint:exhaustruct
		}
	}

	vars := req.Variables
	if req.ProjectName != "" {
		if vars == nil {
			vars = map[string]string{}
		}

		if _, set := vars["project_name"]; !set {
			vars["project_name"] = req.ProjectName
		}
	}

	chainResult, err := kitfx.ApplyRecipeChain(context.Background(), manifest.Recipes[0].Name, manifest, bridgeKitOptions(manifest, kitfx.ApplyOptions{
		CWD:          targetDir,
		RegistryURL:  manifest.RegistryURL,
		Force:        req.Force,
		SkipExisting: req.SkipExisting,
		DryRun:       req.DryRun,
		Verbose:      req.Verbose,
		Variables:    vars,
	}))
	if err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(kitApplyRecipeResponse{Recipes: newKitApplyRecipeResults(chainResult.Recipes)}) //nolint:exhaustruct
}

// bridgeKitNewProject scaffolds a new project from a registry template.
func bridgeKitNewProject(requestJSON string) string {
	var req kitNewProjectRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	if req.TemplateName == "" {
		return marshalResponse(kitApplyRecipeResponse{Error: "templateName is required"}) //nolint:exhaustruct
	}

	if req.TargetDir == "" {
		return marshalResponse(kitApplyRecipeResponse{Error: "targetDir is required"}) //nolint:exhaustruct
	}

	cwd := req.TargetDir
	manifest, err := kitfx.FetchRegistry(context.Background(), cwd, req.RegistrySource)
	if err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	found := false
	for _, r := range manifest.Recipes {
		if r.Name == req.TemplateName {
			found = true

			break
		}
	}

	if !found {
		available := make([]string, 0, len(manifest.Recipes))
		for _, r := range manifest.Recipes {
			available = append(available, r.Name)
		}

		return marshalResponse(kitApplyRecipeResponse{ //nolint:exhaustruct
			Error: "template '" + req.TemplateName + "' not found; available: " + strings.Join(available, ", "),
		})
	}

	if mkErr := os.MkdirAll(req.TargetDir, 0o755); mkErr != nil { //nolint:gosec
		return marshalResponse(kitApplyRecipeResponse{Error: "cannot create target dir: " + mkErr.Error()}) //nolint:exhaustruct
	}

	vars := req.Variables
	if vars == nil {
		vars = map[string]string{}
	}

	if _, set := vars["project_name"]; !set && req.ProjectName != "" {
		vars["project_name"] = req.ProjectName
	}

	chainResult, err := kitfx.ApplyRecipeChain(context.Background(), req.TemplateName, manifest, bridgeKitOptions(manifest, kitfx.ApplyOptions{
		CWD:         req.TargetDir,
		RegistryURL: manifest.RegistryURL,
		Force:       true,
		Variables:   vars,
	}))
	if err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(kitApplyRecipeResponse{Recipes: newKitApplyRecipeResults(chainResult.Recipes)}) //nolint:exhaustruct
}

// bridgeKitUpdateRecipe re-applies a recipe chain to an existing project (force mode).
func bridgeKitUpdateRecipe(requestJSON string) string {
	var req kitUpdateRecipeRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	if req.RecipeName == "" {
		return marshalResponse(kitApplyRecipeResponse{Error: "recipeName is required"}) //nolint:exhaustruct
	}

	cwd := req.CWD
	if cwd == "" {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			return marshalResponse(kitApplyRecipeResponse{Error: "cannot determine cwd: " + err.Error()}) //nolint:exhaustruct
		}
	}

	manifest, err := kitfx.FetchRegistry(context.Background(), cwd, req.RegistrySource)
	if err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	found := false
	for _, r := range manifest.Recipes {
		if r.Name == req.RecipeName {
			found = true

			break
		}
	}

	if !found {
		return marshalResponse(kitApplyRecipeResponse{ //nolint:exhaustruct
			Error: "recipe '" + req.RecipeName + "' not found. Run `eser kit list` to see available recipes.",
		})
	}

	chainResult, err := kitfx.ApplyRecipeChain(context.Background(), req.RecipeName, manifest, bridgeKitOptions(manifest, kitfx.ApplyOptions{
		CWD:         cwd,
		RegistryURL: manifest.RegistryURL,
		Force:       true,
		DryRun:      req.DryRun,
		Verbose:     req.Verbose,
	}))
	if err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(kitApplyRecipeResponse{Recipes: newKitApplyRecipeResults(chainResult.Recipes)}) //nolint:exhaustruct
}

// bridgeKitOptions adds what `eser kit` (cmd/eser/kit.go) sets for every
// apply: file sources resolve against the manifest's registryUrl, as the
// TypeScript kit fetches them, conflicts are warned about and skipped,
// undeclared variables are dropped, and the first failed post-install command
// stops the run. The engine's output is discarded; the TypeScript handler
// prints its own lines from the result.
func bridgeKitOptions(manifest *kitfx.RegistryManifest, opts kitfx.ApplyOptions) kitfx.ApplyOptions { //nolint:gocritic // hugeParam: built once per call
	opts.SourceBase = manifest.RegistryURL
	opts.SkipConflicts = true
	opts.StrictVariables = true
	opts.StopOnPostInstallFailure = true

	return opts
}

func init() {
	register("kitListRecipes", bridgeKitListRecipes)
	register("kitApplyRecipe", bridgeKitApplyRecipe)
	register("kitCloneRecipe", bridgeKitCloneRecipe)
	register("kitNewProject", bridgeKitNewProject)
	register("kitUpdateRecipe", bridgeKitUpdateRecipe)
}
