// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

// binaryExtensions are copied byte for byte in whole-repo mode, without
// variable substitution; the TypeScript kit's BINARY_EXTENSIONS.
var binaryExtensions = []string{
	"png", "jpg", "jpeg", "gif", "ico", "webp", "svg", "woff", "woff2", "ttf", "eot", "otf",
	"zip", "tar", "gz", "bz2", "xz", "7z", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
	"exe", "dll", "so", "dylib", "mp3", "mp4", "avi", "mov", "webm",
}

// alwaysIgnored are left out of every whole-repo copy.
var alwaysIgnored = []string{".git", "recipe.json", "eser-registry.json"}

// IsBinaryFile reports whether path has one of the extensions whole-repo
// mode copies without substitution, ignoring case.
func IsBinaryFile(path string) bool {
	lower := strings.ToLower(path)

	return slices.ContainsFunc(binaryExtensions, func(ext string) bool {
		return strings.HasSuffix(lower, "."+ext)
	})
}

// ErrInvalidSpecifier is returned for a whole-repo specifier that does not
// name a GitHub repository.
var ErrInvalidSpecifier = errors.New("the specifier does not name a GitHub repository; use owner/repo or gh:owner/repo[/subpath][#ref]")

// applyWholeRepo downloads the repository tarball that opts.Specifier names,
// extracts it within the limits, and copies every file the ignore patterns
// keep, with {{.var}} substituted in paths and in text files.
func (run *applyRun) applyWholeRepo(ctx context.Context) error {
	opts := run.opts

	spec := ResolveSpecifier(opts.Specifier)
	if spec.Kind != "repo" {
		return fmt.Errorf("apply recipe %s: %w: %q", run.name, ErrInvalidSpecifier, opts.Specifier)
	}

	ref := spec.Ref
	if ref == "" {
		ref = DefaultRef
	}

	tempDir, err := os.MkdirTemp("", "kit-clone-")
	if err != nil {
		return fmt.Errorf("apply recipe %s: create a temporary directory: %w", run.name, err)
	}

	// Best-effort cleanup; a failure here must not hide the result or error.
	defer func() { _ = os.RemoveAll(tempDir) }()

	if err := run.downloadRepo(ctx, &spec, ref, tempDir); err != nil {
		return err
	}

	ignore := slices.Concat(alwaysIgnored, run.recipe.Ignore)

	err = filepath.WalkDir(tempDir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		if entry.IsDir() {
			return nil
		}

		rel, err := filepath.Rel(tempDir, path)
		if err != nil {
			return fmt.Errorf("relative path of %q: %w", path, err)
		}

		return run.copyRepoFile(path, filepath.ToSlash(rel), ignore)
	})
	if err != nil {
		return err //nolint:wrapcheck // copyRepoFile names the recipe and the file
	}

	run.result.Total = len(run.result.Written) + len(run.result.Skipped)

	return nil
}

func (run *applyRun) downloadRepo(ctx context.Context, spec *ResolvedSpecifier, ref, dir string) error {
	opts := run.opts
	tarball := fmt.Sprintf("%s/%s/%s/tar.gz/%s", run.fetch.github.Codeload, spec.Owner, spec.Repo, ref)

	body, cancel, err := run.fetch.open(ctx, tarball, "", tarballHTTPTimeout)
	if err != nil {
		hint := "retry later, or check that the repository and ref exist"
		if requestErr, ok := errors.AsType[*RequestError](err); ok && requestErr.Status == 404 { //nolint:mnd // HTTP 404
			hint = fmt.Sprintf("check that the repository %s/%s and the ref %s exist", spec.Owner, spec.Repo, ref)
		}

		return fmt.Errorf("apply recipe %s: download %s; no files were written: %s: %w", run.name, opts.Specifier, hint, err)
	}
	defer cancel()

	// The body is read in full or abandoned on error; a failed close loses nothing.
	defer func() { _ = body.Close() }()

	err = ExtractTarball(body, dir, ExtractOptions{
		StripComponents: 1,
		Subpath:         spec.Subpath,
		MaxBytes:        opts.MaxBytes,
		MaxEntries:      opts.MaxEntries,
	})
	if err != nil {
		return fmt.Errorf("apply recipe %s: extract %s; no files were written: %w", run.name, opts.Specifier, err)
	}

	return nil
}

func (run *applyRun) copyRepoFile(sourcePath, rel string, ignore []string) error {
	opts := run.opts

	if ShouldIgnore(rel, ignore) {
		return nil
	}

	targetRel := SubstituteInPath(rel, run.vars)
	if !IsPathSafe(opts.CWD, filepath.FromSlash(targetRel)) {
		return nil
	}

	targetAbs := filepath.Join(opts.CWD, filepath.FromSlash(targetRel))

	if exists(targetAbs) && !opts.Force {
		if opts.SkipExisting {
			if opts.Verbose {
				_, _ = fmt.Fprintf(run.stdout, "  [skip] %s (already exists)\n", targetRel)
			}
		} else {
			_, _ = fmt.Fprintf(run.stderr, "  Warning: %s already exists. Use --force to overwrite or --skip-existing to skip.\n", targetRel)
		}

		run.result.Skipped = append(run.result.Skipped, targetRel)

		return nil
	}

	if opts.DryRun {
		_, _ = fmt.Fprintf(run.stdout, "  [dry-run] would write %s\n", targetRel)

		run.result.Written = append(run.result.Written, targetRel)

		return nil
	}

	if opts.Verbose {
		_, _ = fmt.Fprintf(run.stdout, "  [write] %s\n", targetRel)
	}

	data, err := os.ReadFile(sourcePath) //nolint:gosec // G304: a file this run extracted
	if err == nil {
		if !IsBinaryFile(rel) {
			data = []byte(SubstituteVariables(string(data), run.vars))
		}

		err = writeFile(targetAbs, string(data))
	}

	if err != nil {
		return fmt.Errorf("apply recipe %s: copy %s to %s; %s: %w", run.name, rel, targetRel, leftover(run.result.Written), err)
	}

	run.result.Written = append(run.result.Written, targetRel)

	return nil
}
