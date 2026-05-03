// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// defaultExcludeSubstrings are path fragments that are always skipped.
var defaultExcludeSubstrings = []string{
	"node_modules",
	".git/",
	"/dist/",
	"/coverage/",
	"/.output/",
	"/temp/",
	"/.cache/",
}

// WalkSourceFiles discovers files under opts.Root.
// When opts.GitAware is true and git is available, it uses git ls-files
// to enumerate only tracked (and untracked-but-not-ignored) files.
// Falls back to a standard fs.WalkDir if git is unavailable.
func WalkSourceFiles(ctx context.Context, opts WalkOptions) ([]FileEntry, error) {
	root := opts.Root
	if root == "" {
		root = "."
	}

	root, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}

	if opts.GitAware {
		entries, err := walkViaGit(ctx, root, opts)
		if err == nil {
			return entries, nil
		}
		// fall through to fs walk if git fails
	}

	return walkViaFS(root, opts)
}

// walkViaGit uses git ls-files to enumerate tracked source files.
func walkViaGit(ctx context.Context, root string, opts WalkOptions) ([]FileEntry, error) {
	out, err := runGit(ctx, root, "ls-files", "--full-name", "-z")
	if err != nil {
		return nil, err
	}

	paths := strings.Split(out, "\x00")
	var entries []FileEntry

	for _, rel := range paths {
		rel = strings.TrimSpace(rel)
		if rel == "" {
			continue
		}

		abs := filepath.Join(root, rel)

		if shouldExclude(abs, opts.Exclude) {
			continue
		}

		if !matchesExtensions(rel, opts.Extensions) {
			continue
		}

		info, err := os.Lstat(abs)
		if err != nil {
			continue
		}

		entries = append(entries, FileEntry{
			Path:      abs,
			Name:      filepath.Base(rel),
			Size:      info.Size(),
			IsSymlink: info.Mode()&fs.ModeSymlink != 0,
		})
	}

	return entries, nil
}

// walkViaFS falls back to a standard recursive directory walk.
func walkViaFS(root string, opts WalkOptions) ([]FileEntry, error) {
	var entries []FileEntry

	if err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable entries
		}

		if d.IsDir() {
			if shouldExclude(path, opts.Exclude) || shouldExclude(path, defaultExcludeSubstrings) {
				return filepath.SkipDir
			}

			return nil
		}

		if shouldExclude(path, opts.Exclude) || shouldExclude(path, defaultExcludeSubstrings) {
			return nil
		}

		if !matchesExtensions(path, opts.Extensions) {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}

		entries = append(entries, FileEntry{
			Path:      path,
			Name:      d.Name(),
			Size:      info.Size(),
			IsSymlink: d.Type()&fs.ModeSymlink != 0,
		})

		return nil
	}); err != nil {
		return nil, err
	}

	return entries, nil
}

// shouldExclude returns true when path contains any of the given substrings.
func shouldExclude(path string, excludes []string) bool {
	for _, excl := range excludes {
		if strings.Contains(path, excl) {
			return true
		}
	}

	return false
}

// matchesExtensions returns true when extensions is nil/empty (all files pass)
// or when the file has one of the listed extensions.
func matchesExtensions(path string, extensions []string) bool {
	if len(extensions) == 0 {
		return true
	}

	ext := strings.ToLower(filepath.Ext(path))

	for _, e := range extensions {
		if strings.ToLower(e) == ext {
			return true
		}
	}

	return false
}
