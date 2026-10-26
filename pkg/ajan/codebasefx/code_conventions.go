// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
)

// The rules ValidateCodeConventions reports, in the baseline's key order.
const (
	RuleNamespaceImport = "namespace-import"
	RuleOrDefault       = "or-default"
	RuleExportStar      = "export-star"
)

// CodeConventionRules are the rules of ValidateCodeConventions, in the order
// the baseline file lists them.
var CodeConventionRules = []string{RuleNamespaceImport, RuleOrDefault, RuleExportStar} //nolint:gochecknoglobals

// DefaultCodeConventionsBaseline is the baseline path relative to the root.
const DefaultCodeConventionsBaseline = ".eser/baselines/code-conventions.json"

// codeConventionsExtensions are the TypeScript port's JS_FILE_EXTENSIONS.
var codeConventionsExtensions = []string{".tsx", ".jsx", ".ts", ".js", ".mts", ".mjs", ".cts", ".cjs"} //nolint:gochecknoglobals

// codeConventionsIgnored are path prefixes that follow their own ecosystem's
// conventions or are scratch output.
var codeConventionsIgnored = []string{".eser/recipes/", "etc/temp/"} //nolint:gochecknoglobals

// codeConventionsWalkExcludes are the TypeScript walker's DEFAULT_EXCLUDES.
var codeConventionsWalkExcludes = regexp.MustCompile(`node_modules|\.git/|/dist/|etc/coverage|etc/temp|\.output/`) //nolint:gochecknoglobals

var (
	conventionImport       = regexp.MustCompile("(?m)^[ \\t]*import[ \\t]+(type[ \\t]+)?([^\"'`;]*?)[ \\t\\n]*from[ \\t]*[\"']([^\"']+)[\"']") //nolint:gochecknoglobals
	conventionRuntime      = regexp.MustCompile(`^\{\s*runtime\s*\}$`)                                                                         //nolint:gochecknoglobals
	conventionDefault      = regexp.MustCompile(`^[A-Za-z_$][\w$]*$`)                                                                          //nolint:gochecknoglobals
	conventionDefaultOnly  = regexp.MustCompile(`\.(?:module\.css|json)$`)                                                                     //nolint:gochecknoglobals
	conventionNamespace    = regexp.MustCompile(`^\*\s+as\s+\w+$`)                                                                             //nolint:gochecknoglobals
	conventionNamed        = regexp.MustCompile(`^\{([\s\S]*)\}$`)                                                                             //nolint:gochecknoglobals
	conventionOrDefault    = regexp.MustCompile("\\|\\|\\s*(?:[\"'`\\[{]|-?\\d|null\\b|undefined\\b|new\\s)")                                  //nolint:gochecknoglobals
	conventionExportStar   = regexp.MustCompile(`(?m)^[ \t]*export\s+(?:type\s+)?\*\s*from\s*["']([^"']+)["']`)                                //nolint:gochecknoglobals
	errBaselineNotJSON     = errors.New("baseline is not valid JSON")
	crossRuntimeSpecifier  = "@eserstack/standards/cross-runtime"
	orDefaultMessage       = "default value after `||` also replaces 0 and \"\"; use `??`, or an explicit check when an empty value must fall back too (javascript-practices: Explicit Checks)"
	namespaceImportMessage = "import from \"%s\" is not a namespace import; use `import * as name from \"%s\"` (javascript-practices: Imports)"
	exportStarMessage      = "`export * from \"%s\"` re-exports the whole module; export the names explicitly (`export { name } from \"%s\"`) or as a namespace (`export * as name from \"%s\"`) (javascript-practices: Avoid Re-exports)"
)

// CodeConventionViolation is one violation in a source file.
type CodeConventionViolation struct {
	Rule    string
	Line    int
	Message string
}

// CodeConventionsBaseline maps a rule to the allowed violation count per
// repository-relative path (with "/" separators).
type CodeConventionsBaseline map[string]map[string]int

// FindCodeConventionViolations reports the code convention violations in one
// TypeScript or JavaScript source, sorted by line. It is the Go port of
// pkg/@eserstack/codebase/validate-code-conventions.ts and reports the same
// violations with the same messages:
//
//   - namespace-import: an import that is not `import * as name`, except type
//     imports, `import { runtime }` from the cross-runtime module and the
//     default import of a JSON or CSS module;
//   - or-default: a literal default after `||`;
//   - export-star: `export * from` and `export type * from`.
//
// Matches that start in a comment, string or template text are skipped.
func FindCodeConventionViolations(content []byte) []CodeConventionViolation {
	masked := codeMask(content)

	var found []CodeConventionViolation

	for _, m := range conventionImport.FindAllSubmatchIndex(content, -1) {
		start := m[0] + bytes.Index(content[m[0]:m[1]], []byte("import"))
		if masked[start] || m[2] >= 0 {
			continue
		}

		clause := string(content[m[4]:m[5]])
		specifier := string(content[m[6]:m[7]])

		if isAllowedImport(clause, specifier) {
			continue
		}

		found = append(found, CodeConventionViolation{
			Rule:    RuleNamespaceImport,
			Line:    lineAt(content, start),
			Message: fmt.Sprintf(namespaceImportMessage, specifier, specifier),
		})
	}

	for _, m := range conventionOrDefault.FindAllIndex(content, -1) {
		if masked[m[0]] {
			continue
		}

		found = append(found, CodeConventionViolation{Rule: RuleOrDefault, Line: lineAt(content, m[0]), Message: orDefaultMessage})
	}

	for _, m := range conventionExportStar.FindAllSubmatchIndex(content, -1) {
		start := m[0] + bytes.Index(content[m[0]:m[1]], []byte("export"))
		if masked[start] {
			continue
		}

		specifier := string(content[m[2]:m[3]])
		found = append(found, CodeConventionViolation{
			Rule:    RuleExportStar,
			Line:    lineAt(content, start),
			Message: fmt.Sprintf(exportStarMessage, specifier, specifier, specifier),
		})
	}

	slices.SortStableFunc(found, func(a, b CodeConventionViolation) int { return a.Line - b.Line })

	return found
}

func isAllowedImport(clause, specifier string) bool {
	trimmed := strings.TrimSpace(clause)

	switch {
	case conventionNamespace.MatchString(trimmed):
		return true
	case conventionRuntime.MatchString(trimmed) && specifier == crossRuntimeSpecifier:
		return true
	case conventionDefault.MatchString(trimmed) && conventionDefaultOnly.MatchString(specifier):
		return true
	}

	// `import { type A, type B }` imports types only.
	named := conventionNamed.FindStringSubmatch(trimmed)
	if named == nil {
		return false
	}

	parts := 0

	for part := range strings.SplitSeq(named[1], ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		if !strings.HasPrefix(part, "type ") {
			return false
		}

		parts++
	}

	return parts > 0
}

// codeMask marks the bytes of content that are inside a comment, a string,
// template text or a regular expression literal, from the lexer's tokens.
func codeMask(content []byte) []bool {
	masked := make([]bool, len(content)+1)

	for _, tok := range lexTS(content) {
		switch tok.Kind {
		case tsComment, tsString, tsTemplate, tsRegex:
			for i := tok.Start; i < tok.Start+len(tok.Text) && i < len(content); i++ {
				masked[i] = true
			}
		case tsIdent, tsNumber, tsPunct:
		}
	}

	return masked
}

func lineAt(content []byte, offset int) int {
	return bytes.Count(content[:offset], []byte("\n")) + 1
}

func isCodeConventionsIgnored(relPath string) bool {
	for _, prefix := range codeConventionsIgnored {
		if strings.HasPrefix(relPath, prefix) {
			return true
		}
	}

	return false
}

func relativeSlashPath(root, path string) string {
	absRoot, rootErr := filepath.Abs(root)
	absPath, pathErr := filepath.Abs(path)

	if rootErr != nil || pathErr != nil {
		return filepath.ToSlash(path)
	}

	rel, err := filepath.Rel(absRoot, absPath)
	if err != nil {
		return filepath.ToSlash(path)
	}

	return filepath.ToSlash(rel)
}

// ValidateCodeConventions checks the files under root and fails a file only
// when it has more violations of a rule than the baseline allows; then every
// violation of that rule in the file is reported, with the counts when the
// baseline allows some.
func ValidateCodeConventions(root string, baseline CodeConventionsBaseline) ValidatorFunc {
	return func(path string, content []byte) []ValidatorIssue {
		if !slices.Contains(codeConventionsExtensions, strings.ToLower(filepath.Ext(path))) {
			return nil
		}

		if codeConventionsWalkExcludes.MatchString(filepath.ToSlash(path)) {
			return nil
		}

		relPath := relativeSlashPath(root, path)
		if isCodeConventionsIgnored(relPath) {
			return nil
		}

		byRule := make(map[string][]CodeConventionViolation)
		for _, v := range FindCodeConventionViolations(content) {
			byRule[v.Rule] = append(byRule[v.Rule], v)
		}

		var issues []ValidatorIssue

		for _, rule := range CodeConventionRules {
			found := byRule[rule]
			allowed := baseline[rule][relPath]

			if len(found) <= allowed {
				continue
			}

			for _, v := range found {
				message := v.Message
				if allowed > 0 {
					message = fmt.Sprintf("%s [%d in this file, baseline allows %d]", v.Message, len(found), allowed)
				}

				issues = append(issues, ValidatorIssue{Severity: "error", File: path, Line: v.Line, Message: message, Fixed: false})
			}
		}

		return issues
	}
}

// ReadCodeConventionsBaseline reads a baseline file; a missing file is an
// empty baseline.
func ReadCodeConventionsBaseline(path string) (CodeConventionsBaseline, error) {
	baseline := emptyCodeConventionsBaseline()

	data, err := os.ReadFile(path) //nolint:gosec // G304: the baseline path from the validator's options
	if errors.Is(err, os.ErrNotExist) {
		return baseline, nil
	}

	if err != nil {
		return nil, fmt.Errorf("read baseline %s: %w", path, err)
	}

	var parsed map[string]map[string]int
	if err := json.Unmarshal(data, &parsed); err != nil {
		return nil, fmt.Errorf("%w: %s (%w); regenerate it with --write-baseline", errBaselineNotJSON, path, err)
	}

	for rule, byFile := range parsed {
		baseline[rule] = byFile
	}

	return baseline, nil
}

func emptyCodeConventionsBaseline() CodeConventionsBaseline {
	baseline := make(CodeConventionsBaseline, len(CodeConventionRules))
	for _, rule := range CodeConventionRules {
		baseline[rule] = map[string]int{}
	}

	return baseline
}

// jsonQuote quotes s as JSON.stringify does: no HTML escaping.
func jsonQuote(s string) string {
	var b bytes.Buffer

	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(s) // a string always encodes

	return strings.TrimSuffix(b.String(), "\n")
}
