// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package validatortools

import (
	"os"
	"path/filepath"

	"github.com/eser/stack/pkg/ajan/codebasefx"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// applyFixer runs fixer over the walked files and returns a mutation for each
// file it changes. The issues of a changed file are replaced with what the
// validator still finds in the fixed content, so a run that fixes every issue
// passes; a dry run keeps the issues, since nothing is written.
func applyFixer(
	files []codebasefx.FileEntry,
	validate codebasefx.ValidatorFunc,
	fixer codebasefx.FixerFunc,
	issues []codebasefx.ValidatorIssue,
	dryRun bool,
) ([]workflowfx.WorkflowFileMutation, []codebasefx.ValidatorIssue) {
	var mutations []workflowfx.WorkflowFileMutation

	remaining := make(map[string][]codebasefx.ValidatorIssue)

	for _, file := range files {
		if file.IsSymlink {
			continue
		}

		content, err := os.ReadFile(file.Path) //nolint:gosec // G304: a path from the file walk
		if err != nil {
			continue
		}

		fixed, ok := fixer(file.Path, content)
		if !ok {
			continue
		}

		mutations = append(mutations, workflowfx.WorkflowFileMutation{
			Path:       file.Path,
			OldContent: string(content),
			NewContent: string(fixed),
		})

		remaining[file.Path] = validate(file.Path, fixed)
	}

	if dryRun || len(mutations) == 0 {
		return mutations, issues
	}

	kept := make([]codebasefx.ValidatorIssue, 0, len(issues))

	for _, issue := range issues {
		if _, fixedFile := remaining[issue.File]; !fixedFile {
			kept = append(kept, issue)
		}
	}

	for _, mutation := range mutations {
		kept = append(kept, remaining[mutation.Path]...)
	}

	return mutations, kept
}

// onlyChanged keeps the walked files whose path relative to root is one of
// changed (the --changed run of `git diff --name-only HEAD`).
func onlyChanged(root string, files []codebasefx.FileEntry, changed []string) []codebasefx.FileEntry {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return files
	}

	wanted := make(map[string]bool, len(changed))
	for _, path := range changed {
		wanted[filepath.ToSlash(filepath.Join(absRoot, path))] = true
	}

	kept := make([]codebasefx.FileEntry, 0, len(changed))

	for _, file := range files {
		if wanted[filepath.ToSlash(file.Path)] {
			kept = append(kept, file)
		}
	}

	return kept
}
