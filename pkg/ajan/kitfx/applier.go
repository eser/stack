// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path"
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

// ErrFileExists is returned for a file target that already exists when
// neither Force, SkipExisting nor SkipConflicts is set.
var ErrFileExists = errors.New("file already exists")

// ErrGitHubProviderBase is returned for a github-provider file when the
// source base names no GitHub repository.
var ErrGitHubProviderBase = errors.New(`provider "github" needs a registryUrl on GitHub`)

// IsPathSafe reports whether target, resolved relative to cwd, stays within
// cwd. An absolute target is not safe, as in the TypeScript kit.
func IsPathSafe(cwd, target string) bool {
	if filepath.IsAbs(target) || strings.HasPrefix(target, "/") {
		return false
	}

	abs := filepath.Join(cwd, target)
	// Ensure cwd ends with separator so "cwd-evil" is not confused with "cwd/".
	safe := filepath.Clean(cwd) + string(filepath.Separator)

	return strings.HasPrefix(abs+string(filepath.Separator), safe)
}

// PostInstallError is a post-install command that could not start, exited
// with a non-zero status or ran past the post-install timeout, returned when
// ApplyOptions.StopOnPostInstallFailure is set. The recipe's files are
// written at that point.
type PostInstallError struct {
	Command string
	// ExitCode is the exit status, or -1 when the command did not start or
	// was stopped at the timeout.
	ExitCode int
	// Timeout is set when the command ran past it.
	Timeout time.Duration
	Err     error
}

func (e *PostInstallError) Error() string {
	var detail string

	switch {
	case e.Timeout > 0:
		detail = fmt.Sprintf("no exit within %v; raise the post-install timeout if it needs longer", e.Timeout)
	case e.ExitCode < 0:
		detail = "it did not start; check that the program is installed and on PATH"
	default:
		detail = fmt.Sprintf("exit code %d; fix the problem in its output above, then run it by hand", e.ExitCode)
	}

	return fmt.Sprintf("run post-install command %q: %s", e.Command, detail)
}

func (e *PostInstallError) Unwrap() error { return e.Err }

// applyRun is one ApplyRecipe call: its options with the defaults filled in.
type applyRun struct {
	opts    ApplyOptions
	recipe  *Recipe
	name    string
	vars    map[string]string
	stdout  io.Writer
	stderr  io.Writer
	fetch   fetcher
	timeout time.Duration
	result  ApplyResult
}

// ApplyRecipe applies a single recipe to the project directory described by opts.
//
// Phases, as in the TypeScript kit's applier:
//  1. Variables — resolve them (see ApplyOptions.StrictVariables and Prompt)
//     and list them on Stderr.
//  2. Validate — path traversal check for every file target.
//  3. Conflict — detect existing file targets; honour Force, SkipExisting and
//     SkipConflicts.
//  4. Write — fetch and write each file (folder entries fetch-all then write).
//     A recipe without Files and with opts.Specifier copies the whole
//     repository from its tarball instead (see ApplyOptions.Specifier).
//  5. Post-install — run each post-install command in opts.CWD, unless
//     SkipPostInstall is set; a dry run lists them.
//
// ctx bounds the remote fetches and the post-install commands, and each
// post-install command is also bounded by opts.PostInstallTimeout.
func ApplyRecipe(ctx context.Context, recipe *Recipe, opts ApplyOptions) (ApplyResult, error) { //nolint:gocritic // hugeParam: the bridge calls this public API with a value
	timeout, err := postInstallTimeout(opts.PostInstallTimeout)
	if err != nil {
		return ApplyResult{}, err //nolint:exhaustruct
	}

	if opts.MaxBytes < 0 || opts.MaxEntries < 0 {
		return ApplyResult{}, fmt.Errorf( //nolint:exhaustruct
			"tarball limits MaxBytes %d and MaxEntries %d must not be negative: set positive values, or 0 for the defaults",
			opts.MaxBytes, opts.MaxEntries,
		)
	}

	run := &applyRun{ //nolint:exhaustruct
		opts:    opts,
		recipe:  recipe,
		name:    recipe.Name,
		stdout:  writerOrDiscard(opts.Stdout),
		stderr:  writerOrDiscard(opts.Stderr),
		fetch:   newFetcher(opts.HTTPClient, opts.GitHub),
		timeout: timeout,
	}

	if run.name == "" {
		run.name = opts.Specifier
	}

	if run.name == "" {
		run.name = "<unnamed>"
	}

	// ── Phase 1: variables ──────────────────────────────────────────────────
	run.vars, err = ResolveRecipeVariables(ctx, recipe.Variables, opts.Variables, opts.Prompt, opts.StrictVariables, run.stderr)
	if err != nil {
		return run.result, fmt.Errorf("apply recipe %s: resolve variables: %w", run.name, err)
	}

	PrintVariablesApplied(run.stderr, run.vars)

	if recipe.Files == nil && opts.Specifier != "" {
		if err := run.applyWholeRepo(ctx); err != nil {
			return run.result, err
		}
	} else if err := run.applyFiles(ctx); err != nil {
		return run.result, err
	}

	// ── Phase 5: post-install commands ──────────────────────────────────────
	if !opts.SkipPostInstall {
		if err := runPostInstallCommands(ctx, recipe.PostInstall, &run.opts, timeout, run.stdout, &run.result); err != nil {
			return run.result, err
		}
	}

	return run.result, nil
}

func (run *applyRun) applyFiles(ctx context.Context) error {
	opts := run.opts

	// ── Phase 2: path-traversal validation ─────────────────────────────────
	for _, f := range run.recipe.Files {
		if !IsPathSafe(opts.CWD, f.Target) {
			return fmt.Errorf("apply recipe %s: target %q: %w; the recipe needs a fix from its author", run.name, f.Target, ErrPathTraversal)
		}
	}

	// ── Phase 3: conflict detection ─────────────────────────────────────────
	skippedSet := make(map[string]bool)

	if !opts.Force && !opts.SkipExisting {
		for _, f := range run.recipe.Files {
			if f.Kind == RecipeFileKindFolder || !exists(filepath.Join(opts.CWD, f.Target)) {
				continue
			}

			switch {
			case !opts.SkipConflicts:
				return fmt.Errorf("%w: %q (use --force to overwrite or --skip-existing to skip)", ErrFileExists, f.Target)
			case opts.DryRun:
				_, _ = fmt.Fprintf(run.stdout, "  [conflict] %s (already exists)\n", f.Target)
			default:
				_, _ = fmt.Fprintf(run.stderr, "  Warning: %s already exists. Use --force to overwrite or --skip-existing to skip.\n", f.Target)

				run.result.Skipped = append(run.result.Skipped, f.Target)
				run.result.Total++
				skippedSet[f.Target] = true
			}
		}
	}

	// ── Phase 4: fetch + write ──────────────────────────────────────────────
	for _, f := range run.recipe.Files {
		if skippedSet[f.Target] {
			continue
		}

		var err error

		what := ""
		if f.Kind == RecipeFileKindFolder {
			what = "folder "
			err = run.applyFolder(ctx, &f)
		} else {
			err = run.applyFile(ctx, &f)
		}

		if err != nil {
			return fmt.Errorf("apply recipe %s: copy %s%s to %s; %s: %w", run.name, what, f.Source, f.Target, leftover(run.result.Written), err)
		}
	}

	return nil
}

// leftover says what a failed apply leaves behind.
func leftover(written []string) string {
	if len(written) == 0 {
		return "no files were written"
	}

	return fmt.Sprintf("%d file(s) written before it stay in place; once the cause below is fixed, rerun with --force to overwrite them", len(written))
}

func exists(path string) bool {
	_, err := os.Stat(path)

	return err == nil
}

// ApplyRecipeChain resolves the full dependency chain for recipeName and applies
// each recipe in dependency order.
func ApplyRecipeChain(
	ctx context.Context,
	recipeName string,
	manifest *RegistryManifest,
	opts ApplyOptions, //nolint:gocritic // hugeParam: the bridge calls this public API with a value
) (ApplyChainResult, error) {
	chain, err := ResolveRequires(recipeName, manifest.Recipes)
	if err != nil {
		return ApplyChainResult{}, fmt.Errorf("resolving recipe chain for %q: %w", recipeName, err)
	}

	var chainResult ApplyChainResult

	for _, recipe := range chain {
		if opts.Verbose {
			_, _ = fmt.Fprintf(writerOrDiscard(opts.Stdout), "\nApplying recipe: %s\n", recipe.Name)
		}

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

// usesLegacySource reports whether f is fetched the pre-SourceBase way: every
// source without a SourceBase, and a github-provider source under a gh:
// RegistryURL.
func (run *applyRun) usesLegacySource(f *RecipeFile) bool {
	if run.opts.SourceBase == "" {
		return true
	}

	return f.Provider == RecipeFileProviderGitHub && ResolveSpecifier(run.opts.RegistryURL).Kind == "repo"
}

// sourceBase is the base f's source resolves against: SourceBase, or, for a
// github-provider file, the root of the repository SourceBase names on the
// raw host (Raw/owner/repo/ref), as the TypeScript sourceBaseFor does, so a
// registry kept in a subfolder can point at any file of its repository.
func (run *applyRun) sourceBase(f *RecipeFile) (string, error) {
	if f.Provider != RecipeFileProviderGitHub {
		return run.opts.SourceBase, nil
	}

	raw := run.opts.GitHub.withDefaults().Raw

	if rest, ok := strings.CutPrefix(run.opts.SourceBase, raw+"/"); ok {
		parts := strings.SplitN(rest, "/", 4) //nolint:mnd // owner, repo, ref and the rest
		if len(parts) >= 3 && parts[0] != "" && parts[1] != "" && parts[2] != "" {
			return raw + "/" + strings.Join(parts[:3], "/"), nil
		}
	}

	return "", fmt.Errorf("%w (%s/<owner>/<repo>/<ref> or gh:owner/repo), not %s", ErrGitHubProviderBase, raw, run.opts.SourceBase)
}

func (run *applyRun) applyFile(ctx context.Context, f *RecipeFile) error {
	opts := run.opts
	dest := filepath.Join(opts.CWD, f.Target)

	if opts.SkipExisting && exists(dest) {
		if opts.Verbose {
			_, _ = fmt.Fprintf(run.stdout, "  [skip] %s (already exists)\n", f.Target)
		}

		run.result.Skipped = append(run.result.Skipped, f.Target)
		run.result.Total++

		return nil
	}

	if opts.DryRun {
		_, _ = fmt.Fprintf(run.stdout, "  [dry-run] would write %s\n", f.Target)

		run.result.Written = append(run.result.Written, f.Target)
		run.result.Total++

		return nil
	}

	if opts.Verbose {
		_, _ = fmt.Fprintf(run.stdout, "  [write] %s\n", f.Target)
	}

	var content string

	if run.usesLegacySource(f) {
		fetched, err := FetchRecipeFile(ctx, f, run.recipe, opts.RegistryURL)
		if err != nil {
			return fmt.Errorf("fetching %q: %w", f.Source, err)
		}

		content = fetched
	} else {
		base, err := run.sourceBase(f)
		if err != nil {
			return err
		}

		fetched, err := run.fetch.fetchSource(ctx, base, f.Source)
		if err != nil {
			return err
		}

		content = string(fetched)
	}

	if err := writeFile(dest, SubstituteVariables(content, run.vars)); err != nil {
		return fmt.Errorf("writing %q: %w", dest, err)
	}

	run.result.Written = append(run.result.Written, f.Target)
	run.result.Total++

	return nil
}

func (run *applyRun) applyFolder(ctx context.Context, f *RecipeFile) error {
	opts := run.opts

	// Fetch all files first for atomicity — do not write until all downloads succeed.
	var fetched []FetchedFile

	var err error

	if run.usesLegacySource(f) {
		fetched, err = FetchRecipeFolder(ctx, f, run.recipe, opts.RegistryURL)
	} else {
		var base string

		base, err = run.sourceBase(f)
		if err == nil {
			fetched, err = run.fetch.fetchSourceFolder(ctx, base, f.Source)
		}
	}

	if err != nil {
		return fmt.Errorf("fetching folder %q: %w", f.Source, err)
	}

	targets := make([]string, len(fetched))

	for i, ff := range fetched {
		targets[i] = path.Join(filepath.ToSlash(f.Target), filepath.ToSlash(ff.Path))
		if !IsPathSafe(opts.CWD, targets[i]) {
			return fmt.Errorf("target %q: %w; the recipe needs a fix from its author", targets[i], ErrPathTraversal)
		}
	}

	for i, ff := range fetched {
		target := targets[i]
		dest := filepath.Join(opts.CWD, filepath.FromSlash(target))

		if opts.SkipExisting && exists(dest) {
			run.result.Skipped = append(run.result.Skipped, target)
			run.result.Total++

			continue
		}

		if opts.DryRun {
			_, _ = fmt.Fprintf(run.stdout, "  [dry-run] would write %s\n", target)
		} else {
			if opts.Verbose {
				_, _ = fmt.Fprintf(run.stdout, "  [write] %s\n", target)
			}

			if err := writeFile(dest, SubstituteVariables(ff.Content, run.vars)); err != nil {
				return fmt.Errorf("writing %q: %w", dest, err)
			}
		}

		run.result.Written = append(run.result.Written, target)
		run.result.Total++
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
func postInstallLogger(opts *ApplyOptions) *logfx.Logger {
	if opts.Logger != nil {
		return opts.Logger
	}

	if opts.Verbose {
		return logfx.NewLogger(logfx.WithWriter(os.Stderr), logfx.WithPrettyMode(true))
	}

	return nil
}

// runPostInstallCommands runs the recipe's post-install commands in order; a
// dry run only lists them. A failed command ends the phase with a
// *PostInstallError when opts.StopOnPostInstallFailure is set. Otherwise it
// is non-fatal: it is listed in result.PostInstallFailed and its cause is
// logged once, here, where it is handled. A cancelled ctx ends the phase with
// an error that says how far it got.
func runPostInstallCommands(
	ctx context.Context,
	commands []string,
	opts *ApplyOptions,
	timeout time.Duration,
	stdout io.Writer,
	result *ApplyResult,
) error {
	logger := postInstallLogger(opts)

	for i, command := range commands {
		if opts.DryRun {
			_, _ = fmt.Fprintf(stdout, "  [dry-run] would run: %s\n", command)

			result.PostInstallRan = append(result.PostInstallRan, command)

			continue
		}

		if err := ctx.Err(); err != nil {
			return fmt.Errorf("post-install stopped after %d of %d commands: %w", i, len(commands), err)
		}

		if opts.Verbose {
			_, _ = fmt.Fprintf(stdout, "  [post-install] %s\n", command)
		}

		result.PostInstallRan = append(result.PostInstallRan, command)

		err := runPostInstall(ctx, command, opts.CWD, timeout, opts.Stdout, opts.Stderr)
		if err == nil {
			continue
		}

		// The caller gave up while the command ran: that ends the phase and
		// is not a failure of the command itself.
		if ctxErr := ctx.Err(); ctxErr != nil {
			return fmt.Errorf("post-install stopped after %d of %d commands: %w", i, len(commands), ctxErr)
		}

		result.PostInstallFailed = append(result.PostInstallFailed, command)

		if opts.StopOnPostInstallFailure {
			return newPostInstallError(command, timeout, err)
		}

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

// newPostInstallError classifies the error of runPostInstall.
func newPostInstallError(command string, timeout time.Duration, err error) *PostInstallError {
	postErr := &PostInstallError{Command: command, ExitCode: -1, Timeout: 0, Err: err}

	if exitErr, ok := errors.AsType[*exec.ExitError](err); ok {
		postErr.ExitCode = exitErr.ExitCode()
	}

	if errors.Is(err, context.DeadlineExceeded) {
		postErr.ExitCode = -1
		postErr.Timeout = timeout
	}

	return postErr
}

// runPostInstall runs one post-install command in cwd, bounded by timeout and
// by ctx, with its output on stdout and stderr (nil discards it). An empty
// command is a no-op.
func runPostInstall(ctx context.Context, command, cwd string, timeout time.Duration, stdout, stderr io.Writer) error {
	parts := strings.Fields(command)
	if len(parts) == 0 {
		return nil
	}

	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, parts[0], parts[1:]...) //nolint:gosec // post-install commands come from the recipe the caller chose to apply
	cmd.Dir = cwd
	cmd.Stdout = stdout
	cmd.Stderr = stderr
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
