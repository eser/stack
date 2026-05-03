// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// ErrPathTraversal is returned when a recipe target would escape the CWD.
var ErrPathTraversal = errors.New("path traversal detected in recipe target")

// IsPathSafe reports whether targetPath, resolved relative to cwd, stays within cwd.
func IsPathSafe(cwd, target string) bool {
	abs := filepath.Join(cwd, target)
	// Ensure cwd ends with separator so "cwd-evil" is not confused with "cwd/".
	safe := filepath.Clean(cwd) + string(filepath.Separator)

	return strings.HasPrefix(abs+string(filepath.Separator), safe)
}

// ApplyRecipe applies a single recipe to the project directory described by opts.
//
// Four phases:
//  1. Validate — path traversal check for every file target.
//  2. Conflict — detect existing files; honour SkipExisting / Force flags.
//  3. Write — fetch and write each file (folder entries fetch-all then write).
//  4. Post-install — run each post-install command in opts.CWD.
func ApplyRecipe(recipe *Recipe, opts ApplyOptions) (ApplyResult, error) {
	var result ApplyResult

	// ── Phase 1: path-traversal validation ─────────────────────────────────
	for _, f := range recipe.Files {
		if !IsPathSafe(opts.CWD, f.Target) {
			return result, fmt.Errorf("%w: %q", ErrPathTraversal, f.Target)
		}
	}

	// ── Phase 2: conflict detection ─────────────────────────────────────────
	if !opts.Force {
		for _, f := range recipe.Files {
			dest := filepath.Join(opts.CWD, f.Target)
			if _, err := os.Stat(dest); err == nil {
				if opts.SkipExisting {
					result.Skipped = append(result.Skipped, f.Target)
					result.Total++

					continue
				}

				return result, fmt.Errorf("file already exists: %q (use --force to overwrite or --skip-existing to skip)", f.Target)
			}
		}
	}

	// Build a set of already-skipped targets to avoid re-processing in phase 3.
	skippedSet := make(map[string]bool, len(result.Skipped))
	for _, s := range result.Skipped {
		skippedSet[s] = true
	}

	// Resolve variables (merge recipe defaults with explicit overrides).
	vars := ResolveVariables(recipe, opts.Variables)

	// ── Phase 3: fetch + write ──────────────────────────────────────────────
	for _, f := range recipe.Files {
		if skippedSet[f.Target] {
			continue
		}

		if f.Kind == RecipeFileKindFolder {
			if err := applyFolder(&f, recipe, opts, vars, &result); err != nil {
				return result, err
			}
		} else {
			if err := applyFile(&f, recipe, opts, vars, &result); err != nil {
				return result, err
			}
		}
	}

	// ── Phase 4: post-install commands ──────────────────────────────────────
	if !opts.DryRun {
		for _, cmd := range recipe.PostInstall {
			if err := runPostInstall(cmd, opts.CWD); err != nil {
				// Non-fatal — record and continue.
				if opts.Verbose {
					_, _ = fmt.Fprintf(os.Stderr, "post-install %q: %v\n", cmd, err)
				}
			}

			result.PostInstallRan = append(result.PostInstallRan, cmd)
		}
	}

	return result, nil
}

// ApplyRecipeChain resolves the full dependency chain for recipeName and applies
// each recipe in dependency order.
func ApplyRecipeChain(recipeName string, manifest *RegistryManifest, opts ApplyOptions) (ApplyChainResult, error) {
	chain, err := ResolveRequires(recipeName, manifest.Recipes)
	if err != nil {
		return ApplyChainResult{}, fmt.Errorf("resolving recipe chain for %q: %w", recipeName, err)
	}

	var chainResult ApplyChainResult

	for _, recipe := range chain {
		r := recipe // local copy for closure safety
		res, err := ApplyRecipe(&r, opts)
		if err != nil {
			return chainResult, fmt.Errorf("applying recipe %q: %w", recipe.Name, err)
		}

		chainResult.Recipes = append(chainResult.Recipes, NamedApplyResult{
			Name:   recipe.Name,
			Result: res,
		})
	}

	return chainResult, nil
}

// --- helpers ---

func applyFile(f *RecipeFile, recipe *Recipe, opts ApplyOptions, vars map[string]string, result *ApplyResult) error {
	content, err := FetchRecipeFile(f, recipe, opts.RegistryURL)
	if err != nil {
		return fmt.Errorf("fetching %q: %w", f.Source, err)
	}

	content = SubstituteVariables(content, vars)
	dest := filepath.Join(opts.CWD, f.Target)

	if opts.DryRun {
		result.Written = append(result.Written, f.Target)
		result.Total++

		return nil
	}

	if err := writeFile(dest, content); err != nil {
		return fmt.Errorf("writing %q: %w", dest, err)
	}

	result.Written = append(result.Written, f.Target)
	result.Total++

	return nil
}

func applyFolder(f *RecipeFile, recipe *Recipe, opts ApplyOptions, vars map[string]string, result *ApplyResult) error {
	// Fetch all files first for atomicity — do not write until all downloads succeed.
	fetched, err := FetchRecipeFolder(f, recipe, opts.RegistryURL)
	if err != nil {
		return fmt.Errorf("fetching folder %q: %w", f.Source, err)
	}

	for _, ff := range fetched {
		content := SubstituteVariables(ff.Content, vars)
		target := filepath.Join(f.Target, ff.Path)

		if !IsPathSafe(opts.CWD, target) {
			return fmt.Errorf("%w: %q", ErrPathTraversal, target)
		}

		dest := filepath.Join(opts.CWD, target)

		if !opts.DryRun {
			if err := writeFile(dest, content); err != nil {
				return fmt.Errorf("writing %q: %w", dest, err)
			}
		}

		result.Written = append(result.Written, target)
		result.Total++
	}

	return nil
}

func writeFile(dest, content string) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil { //nolint:gosec
		return err
	}

	return os.WriteFile(dest, []byte(content), 0o644) //nolint:gosec
}

func runPostInstall(command, cwd string) error {
	parts := strings.Fields(command)
	if len(parts) == 0 {
		return nil
	}

	cmd := exec.Command(parts[0], parts[1:]...) //nolint:gosec
	cmd.Dir = cwd

	return cmd.Run()
}
