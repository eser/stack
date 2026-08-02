// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package collectorfx

import (
	"context"
	"fmt"
	"io/fs"
	"path/filepath"
	"regexp"
	"strings"
)

// jsExtensions are the file extensions treated as collectible JS/TS source files.
var jsExtensions = map[string]bool{
	".ts":  true,
	".tsx": true,
	".js":  true,
	".jsx": true,
	".mts": true,
	".cts": true,
	".mjs": true,
	".cjs": true,
}

// defaultIgnorePattern skips test files and private (_-prefixed) files.
// Matches the @eserstack/standards JS_TEST_FILE_PATTERN convention.
var defaultIgnorePattern = regexp.MustCompile(`(\.test\.|\.spec\.|_test\.|_spec\.)|/testdata/`)

// defaultExcludeDirs are directory names that are always skipped.
var defaultExcludeDirs = []string{
	"node_modules", ".git", "dist", "coverage", ".output", ".cache",
}

// WalkCollectableFiles walks opts.BaseDir and returns all JS/TS source files
// eligible for dynamic-import collection.
//
// Files are filtered by:
//   - jsExtensions whitelist
//   - opts.IgnoreFilePattern (regex on relative path); defaults to test-file pattern when empty
//
// The GlobFilter field is currently reserved for future use (path.Match filtering).
func WalkCollectableFiles(ctx context.Context, opts WalkOptions) ([]CollectableFile, error) {
	base := opts.BaseDir
	if base == "" {
		base = "."
	}

	base, err := filepath.Abs(base)
	if err != nil {
		return nil, fmt.Errorf("WalkCollectableFiles: %w", err)
	}

	// Compile ignore pattern.
	var ignore *regexp.Regexp

	if opts.IgnoreFilePattern != "" {
		ignore, err = regexp.Compile(opts.IgnoreFilePattern)
		if err != nil {
			return nil, fmt.Errorf("WalkCollectableFiles: %w: %w", ErrInvalidIgnorePattern, err)
		}
	} else {
		ignore = defaultIgnorePattern
	}

	var files []CollectableFile

	walkErr := filepath.WalkDir(base, func(abs string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable
		}

		if d.IsDir() {
			// Skip excluded directories.
			for _, excl := range defaultExcludeDirs {
				if d.Name() == excl {
					return filepath.SkipDir
				}
			}

			return nil
		}

		ext := strings.ToLower(filepath.Ext(abs))
		if !jsExtensions[ext] {
			return nil
		}

		rel, err := filepath.Rel(base, abs)
		if err != nil {
			return nil
		}

		rel = filepath.ToSlash(rel)

		if ignore != nil && ignore.MatchString(rel) {
			return nil
		}

		files = append(files, CollectableFile{
			RelPath: rel,
			AbsPath: abs,
		})

		return nil
	})

	if walkErr != nil {
		return nil, fmt.Errorf("WalkCollectableFiles: %w", walkErr)
	}

	// Respect context cancellation.
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	return files, nil
}
