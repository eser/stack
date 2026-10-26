// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

// namingTodosExtensions are the source files ValidateNamingAndTodos reads.
var namingTodosExtensions = map[string]bool{
	".ts": true, ".tsx": true, ".mts": true, ".cts": true,
	".js": true, ".jsx": true, ".mjs": true, ".cjs": true,
}

// declarationKeywords introduce a name that the naming check reads: the
// identifier right after one of them, when the keyword is not a property
// name (preceded by a dot).
var declarationKeywords = map[string]bool{
	"const": true, "let": true, "var": true, "function": true,
	"class": true, "interface": true, "type": true, "enum": true,
}

var (
	// camelOrPascal matches camelCase and PascalCase names, with optional
	// leading or trailing underscores or dollar signs.
	camelOrPascal = regexp.MustCompile(`^[_$]*[A-Za-z][A-Za-z0-9]*[_$]*$`)
	// screamingCase matches SCREAMING_SNAKE_CASE constant names.
	screamingCase = regexp.MustCompile(`^[_$]*[A-Z][A-Z0-9_]*$`)
	// todoMarker finds a TODO or FIXME word and what follows it.
	todoMarker = regexp.MustCompile(`\b(TODO|FIXME)\b(\(TASK-[0-9]+\))?`)
)

// ParseAllowNames reads the allowNames option: a list of declared names the
// naming check accepts, such as protocol keys. A missing option is an empty
// list; anything but a list of strings is an error.
func ParseAllowNames(raw any) ([]string, error) {
	switch v := raw.(type) {
	case nil:
		return nil, nil
	case []string:
		return v, nil
	case []any:
		names := make([]string, 0, len(v))

		for _, entry := range v {
			name, ok := entry.(string)
			if !ok {
				return nil, fmt.Errorf("allowNames option has an entry of type %T; expected a string", entry)
			}

			names = append(names, name)
		}

		return names, nil
	default:
		return nil, fmt.Errorf("allowNames option has type %T; expected a list of strings", raw)
	}
}

// ValidateNamingAndTodos checks JavaScript and TypeScript source for two rules
// oxlint does not cover (decision-34):
//
//   - a declared name (after const, let, var, function, class, interface,
//     type or enum) is camelCase, PascalCase or SCREAMING_SNAKE_CASE, or is in
//     allowNames;
//   - every TODO and FIXME in a comment carries a task tag, as in
//     TODO(TASK-123) (decision-21).
//
// Text inside string, template and regular expression literals is never
// read, so prompt text that mentions TODO passes.
func ValidateNamingAndTodos(allowNames []string) ValidatorFunc {
	allowed := make(map[string]bool, len(allowNames))
	for _, name := range allowNames {
		allowed[name] = true
	}

	return func(path string, content []byte) []ValidatorIssue {
		if !namingTodosExtensions[strings.ToLower(filepath.Ext(path))] {
			return nil
		}

		tokens := lexTS(content)

		var issues []ValidatorIssue

		for i, tok := range tokens {
			switch tok.Kind {
			case tsComment:
				issues = append(issues, untaggedTodos(path, tok)...)
			case tsIdent:
				name, ok := declaredName(tokens, i)
				if !ok || allowed[name.Text] || isAllowedName(name.Text) {
					continue
				}

				issues = append(issues, ValidatorIssue{
					Severity: "error",
					File:     path,
					Line:     name.Line,
					Message: fmt.Sprintf(
						"%q is not camelCase, PascalCase or SCREAMING_SNAKE_CASE; rename it",
						name.Text,
					),
					Fixed: false,
				})
			case tsString, tsTemplate, tsRegex, tsNumber, tsPunct:
			}
		}

		return issues
	}
}

// declaredName returns the name that the declaration keyword at tokens[i]
// introduces, if tokens[i] is such a keyword.
func declaredName(tokens []tsToken, i int) (tsToken, bool) {
	keyword := tokens[i].Text
	if !declarationKeywords[keyword] {
		return tsToken{}, false //nolint:exhaustruct
	}

	if prev := significant(tokens, i, -1); prev >= 0 && tokens[prev].Text == "." {
		return tsToken{}, false //nolint:exhaustruct
	}

	next := significant(tokens, i, 1)
	if next >= 0 && keyword == "function" && tokens[next].Text == "*" {
		next = significant(tokens, next, 1)
	}

	if next < 0 || tokens[next].Kind != tsIdent || declarationKeywords[tokens[next].Text] {
		return tsToken{}, false //nolint:exhaustruct
	}

	// "type" is also an ordinary identifier; a type alias declaration names
	// its alias and then has "=" or type parameters.
	if keyword == "type" {
		after := significant(tokens, next, 1)
		if after < 0 || (tokens[after].Text != "=" && tokens[after].Text != "<") {
			return tsToken{}, false //nolint:exhaustruct
		}
	}

	return tokens[next], true
}

// significant returns the index of the nearest non-comment token before
// (step -1) or after (step 1) tokens[i], or -1 when there is none.
func significant(tokens []tsToken, i, step int) int {
	for j := i + step; j >= 0 && j < len(tokens); j += step {
		if tokens[j].Kind != tsComment {
			return j
		}
	}

	return -1
}

func isAllowedName(name string) bool {
	// A name of only underscores or dollar signs, such as "_" for an unused
	// value, has no case to check.
	if strings.Trim(name, "_$") == "" {
		return true
	}

	return camelOrPascal.MatchString(name) || screamingCase.MatchString(name)
}

// untaggedTodos reports each TODO or FIXME in a comment that has no task tag.
func untaggedTodos(path string, tok tsToken) []ValidatorIssue {
	var issues []ValidatorIssue

	for offset, lineText := range strings.Split(tok.Text, "\n") {
		for _, m := range todoMarker.FindAllStringSubmatch(lineText, -1) {
			if m[2] != "" {
				continue
			}

			issues = append(issues, ValidatorIssue{
				Severity: "error",
				File:     path,
				Line:     tok.Line + offset,
				Message: fmt.Sprintf(
					"%s without a task tag; write %s(TASK-<number>) with the backlog task that tracks it",
					m[1], m[1],
				),
				Fixed: false,
			})
		}
	}

	return issues
}
