// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package codebasefx

// The baseline writer is native-only: its locale ordering needs the
// golang.org/x/text collation tables, which would push the WASM profile of
// the bridge past its size limit, and the bridge does not write baselines.

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"slices"

	"golang.org/x/text/collate"
	"golang.org/x/text/language"
)

// WriteCodeConventionsBaseline records every current violation under root as
// the new baseline in baselinePath (relative to root) and returns the total.
// The file is byte-identical to what the TypeScript --write-baseline writes:
// the rules in CodeConventionRules order, the paths in locale order (as
// String.prototype.localeCompare sorts them), two-space indentation and a
// final newline.
func WriteCodeConventionsBaseline(ctx context.Context, root, baselinePath string) (int, error) {
	files, err := WalkSourceFiles(ctx, WalkOptions{Root: root, Extensions: codeConventionsExtensions, GitAware: true}) //nolint:exhaustruct
	if err != nil {
		return 0, err
	}

	baseline := emptyCodeConventionsBaseline()
	total := 0

	for _, file := range files {
		if codeConventionsWalkExcludes.MatchString(filepath.ToSlash(file.Path)) {
			continue
		}

		relPath := relativeSlashPath(root, file.Path)
		if isCodeConventionsIgnored(relPath) {
			continue
		}

		content, err := os.ReadFile(file.Path)
		if err != nil {
			continue // the TypeScript walker skips files it cannot read too
		}

		for _, v := range FindCodeConventionViolations(content) {
			baseline[v.Rule][relPath]++
			total++
		}
	}

	target := baselinePath
	if !filepath.IsAbs(target) {
		target = filepath.Join(root, target)
	}

	if err := os.MkdirAll(filepath.Dir(target), 0o750); err != nil {
		return 0, fmt.Errorf("write baseline: %w", err)
	}

	if err := os.WriteFile(target, FormatCodeConventionsBaseline(baseline), 0o600); err != nil {
		return 0, fmt.Errorf("write baseline: %w", err)
	}

	return total, nil
}

// FormatCodeConventionsBaseline renders a baseline as the file's bytes.
func FormatCodeConventionsBaseline(baseline CodeConventionsBaseline) []byte {
	rules := slices.Clone(CodeConventionRules)

	for rule := range baseline {
		if !slices.Contains(rules, rule) {
			rules = append(rules, rule)
		}
	}

	collator := collate.New(language.Und)

	var b bytes.Buffer

	b.WriteString("{\n")

	for i, rule := range rules {
		paths := make([]string, 0, len(baseline[rule]))
		for path := range baseline[rule] {
			paths = append(paths, path)
		}

		slices.SortFunc(paths, collator.CompareString)

		b.WriteString("  " + jsonQuote(rule) + ": ")

		if len(paths) == 0 {
			b.WriteString("{}")
		} else {
			b.WriteString("{\n")

			for j, path := range paths {
				fmt.Fprintf(&b, "    %s: %d", jsonQuote(path), baseline[rule][path])

				if j < len(paths)-1 {
					b.WriteString(",")
				}

				b.WriteString("\n")
			}

			b.WriteString("  }")
		}

		if i < len(rules)-1 {
			b.WriteString(",")
		}

		b.WriteString("\n")
	}

	b.WriteString("}\n")

	return b.Bytes()
}
