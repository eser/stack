// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/processfx"
)

// DefaultCommandTimeout bounds each post-install command and each dependency
// install command when the caller sets no bound of its own. It leaves room for
// a cold package install on a slow network and still ends a command that hangs.
const DefaultCommandTimeout = 10 * time.Minute

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
//
// ctx bounds the remote fetches and the post-install commands, and each
// post-install command is also bounded by opts.PostInstallTimeout.
func ApplyRecipe(ctx context.Context, recipe *Recipe, opts ApplyOptions) (ApplyResult, error) {
	var result ApplyResult

	timeout, err := postInstallTimeout(opts.PostInstallTimeout)
	if err != nil {
		return result, err
	}

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
			if err := applyFolder(ctx, &f, recipe, opts, vars, &result); err != nil {
				return result, err
			}
		} else {
			if err := applyFile(ctx, &f, recipe, opts, vars, &result); err != nil {
				return result, err
			}
		}
	}

	// ── Phase 4: post-install commands ──────────────────────────────────────
	if !opts.DryRun {
		if err := runPostInstallCommands(ctx, recipe.PostInstall, opts, timeout, &result); err != nil {
			return result, err
		}
	}

	return result, nil
}

// ApplyRecipeChain resolves the full dependency chain for recipeName and applies
// each recipe in dependency order.
func ApplyRecipeChain(
	ctx context.Context,
	recipeName string,
	manifest *RegistryManifest,
	opts ApplyOptions,
) (ApplyChainResult, error) {
	chain, err := ResolveRequires(recipeName, manifest.Recipes)
	if err != nil {
		return ApplyChainResult{}, fmt.Errorf("resolving recipe chain for %q: %w", recipeName, err)
	}

	var chainResult ApplyChainResult

	for _, recipe := range chain {
		r := recipe // local copy for closure safety
		res, err := ApplyRecipe(ctx, &r, opts)
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

func applyFile(
	ctx context.Context,
	f *RecipeFile,
	recipe *Recipe,
	opts ApplyOptions,
	vars map[string]string,
	result *ApplyResult,
) error {
	content, err := FetchRecipeFile(ctx, f, recipe, opts.RegistryURL)
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

func applyFolder(
	ctx context.Context,
	f *RecipeFile,
	recipe *Recipe,
	opts ApplyOptions,
	vars map[string]string,
	result *ApplyResult,
) error {
	// Fetch all files first for atomicity — do not write until all downloads succeed.
	fetched, err := FetchRecipeFolder(ctx, f, recipe, opts.RegistryURL)
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

// postInstallTimeout resolves ApplyOptions.PostInstallTimeout: zero selects
// DefaultCommandTimeout and a negative value is a caller error.
func postInstallTimeout(configured time.Duration) (time.Duration, error) {
	if configured < 0 {
		return 0, fmt.Errorf(
			"post-install timeout %v is negative: set a positive duration, or 0 for the default of %v",
			configured, DefaultCommandTimeout,
		)
	}

	if configured == 0 {
		return DefaultCommandTimeout, nil
	}

	return configured, nil
}

// postInstallLogger returns the logger that receives post-install failures:
// the caller's, a standard error logger when only Verbose is set, or nil when
// failures are recorded in the result alone.
func postInstallLogger(opts ApplyOptions) *logfx.Logger {
	if opts.Logger != nil {
		return opts.Logger
	}

	if opts.Verbose {
		return logfx.NewLogger(logfx.WithWriter(os.Stderr), logfx.WithPrettyMode(true))
	}

	return nil
}

// runPostInstallCommands runs the recipe's post-install commands in order. A
// failed command is non-fatal: it is listed in result.PostInstallFailed and its
// cause is logged once, here, where it is handled. A cancelled ctx ends the
// phase with an error that says how far it got.
func runPostInstallCommands(
	ctx context.Context,
	commands []string,
	opts ApplyOptions,
	timeout time.Duration,
	result *ApplyResult,
) error {
	logger := postInstallLogger(opts)

	for i, command := range commands {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("post-install stopped after %d of %d commands: %w", i, len(commands), err)
		}

		result.PostInstallRan = append(result.PostInstallRan, command)

		err := runPostInstall(ctx, command, opts.CWD, timeout)
		if err == nil {
			continue
		}

		// The caller gave up while the command ran: that ends the phase and
		// is not a failure of the command itself.
		if ctxErr := ctx.Err(); ctxErr != nil {
			return fmt.Errorf("post-install stopped after %d of %d commands: %w", i, len(commands), ctxErr)
		}

		result.PostInstallFailed = append(result.PostInstallFailed, command)

		if logger != nil {
			logger.WarnContext(
				ctx,
				"post-install command failed; the recipe was applied without it",
				slog.String("command", command),
				slog.String("cwd", opts.CWD),
				slog.String("error", err.Error()),
			)
		}
	}

	return nil
}

// runPostInstall runs one post-install command in cwd, bounded by timeout and
// by ctx. An empty command is a no-op.
func runPostInstall(ctx context.Context, command, cwd string, timeout time.Duration) error {
	parts := strings.Fields(command)
	if len(parts) == 0 {
		return nil
	}

	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, parts[0], parts[1:]...) //nolint:gosec // post-install commands come from the recipe the caller chose to apply
	cmd.Dir = cwd
	// On timeout, kill the command's whole process group, not only the
	// direct child, so nothing it started keeps running past the bound.
	processfx.HardenCommand(cmd)

	if err := cmd.Run(); err != nil {
		if ctx.Err() == nil && errors.Is(cmdCtx.Err(), context.DeadlineExceeded) {
			return fmt.Errorf(
				"run %q: no exit within %v (raise ApplyOptions.PostInstallTimeout if it needs longer): %w",
				command, timeout, context.DeadlineExceeded,
			)
		}

		return fmt.Errorf("run %q: %w", command, err)
	}

	return nil
}
