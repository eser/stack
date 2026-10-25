// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"fmt"
	"regexp"
	"strings"
)

// conventionalPattern matches: type(scope)!: subject
// Groups: 1=type, 2=scope (with parens), 3=breaking (!), 4=subject
var conventionalPattern = regexp.MustCompile(`^(\w+)(\([^)]+\))?(!)?: *(.+)$`)

// takeSuffixPattern strips "(take II)" / "(take 2)" trailing labels.
var takeSuffixPattern = regexp.MustCompile(`\s+\(take\s+[IVXivx\d]+\)\s*$`)

// commitMsgTypes are the default types ValidateCommitMsg accepts, as in the
// TypeScript validator (pkg/@eserstack/codebase/validate-commit-msg.ts).
var commitMsgTypes = []string{"ci", "chore", "docs", "feat", "fix", "perf", "refactor", "revert", "test"} //nolint:gochecknoglobals

// commitMsgPattern matches a commit subject: type(scope)!: subject, with one to
// five spaces after the colon.
var commitMsgPattern = regexp.MustCompile(`^(\w+)(?:\(([^)]+)\))?!?:\s{1,5}.+$`) //nolint:gochecknoglobals

// DefaultCommitMsgOptions are the defaults of the TypeScript validator: the
// wildcard scope and multiple scopes are allowed, a scope is optional, and the
// types are commitMsgTypes.
func DefaultCommitMsgOptions() CommitMsgOptions {
	return CommitMsgOptions{AllowAsterisk: true, AllowMultipleScopes: true, ForceScope: false, Types: nil}
}

// ValidateCommitMsg checks the first line of a commit message against the
// conventional commit format, with the rules and messages of the TypeScript
// validator: a merge commit ("Merge ...") passes; the type must be one of
// opts.Types (commitMsgTypes when empty); ForceScope requires a scope; the
// wildcard scope "*" needs AllowAsterisk; a comma-separated scope needs
// AllowMultipleScopes and no empty part. Start from DefaultCommitMsgOptions
// for the TypeScript defaults.
func ValidateCommitMsg(message string, opts CommitMsgOptions) CommitMsgResult {
	firstLine, _, _ := strings.Cut(message, "\n")
	firstLine = strings.TrimSpace(firstLine)

	if firstLine == "" {
		return CommitMsgResult{Valid: false, Issues: []string{"commit message is empty"}}
	}

	if strings.HasPrefix(firstLine, "Merge ") {
		return CommitMsgResult{Valid: true, Issues: nil}
	}

	m := commitMsgPattern.FindStringSubmatch(firstLine)
	if m == nil {
		return CommitMsgResult{
			Valid:  false,
			Issues: []string{fmt.Sprintf(`invalid format: expected "type(scope): message", got: "%s"`, firstLine)},
		}
	}

	commitType := strings.ToLower(m[1])
	scope := m[2]

	types := opts.Types
	if len(types) == 0 {
		types = commitMsgTypes
	}

	types = uniqueStrings(types)

	var issues []string

	if !contains(types, commitType) {
		issues = append(issues, fmt.Sprintf(`invalid type "%s". Must be one of: %s`, commitType, strings.Join(types, ", ")))
	}

	if opts.ForceScope && strings.TrimSpace(scope) == "" {
		issues = append(issues, "scope is required: use type(scope): message")
	}

	if strings.TrimSpace(scope) != "" {
		if scope == "*" && !opts.AllowAsterisk {
			issues = append(issues, `wildcard scope "*" is not allowed (allowAsterisk is false)`)
		}

		if strings.Contains(scope, ",") {
			if !opts.AllowMultipleScopes {
				issues = append(issues, "multiple scopes are not allowed (allowMultipleScopes is false)")
			} else if hasEmptyScope(scope) {
				issues = append(issues, "invalid scope: each comma-separated scope must be non-empty")
			}
		}
	}

	return CommitMsgResult{Valid: len(issues) == 0, Issues: issues}
}

func hasEmptyScope(scope string) bool {
	for part := range strings.SplitSeq(scope, ",") {
		if strings.TrimSpace(part) == "" {
			return true
		}
	}

	return false
}

func uniqueStrings(values []string) []string {
	out := make([]string, 0, len(values))

	for _, v := range values {
		if !contains(out, v) {
			out = append(out, v)
		}
	}

	return out
}

// ParseConventionalCommit parses a single commit subject into a ConventionalCommit.
// Returns (nil, false) when the message does not match the format.
func ParseConventionalCommit(subject, hash string) (*ConventionalCommit, bool) {
	subject = StripTakeSuffix(strings.TrimSpace(subject))

	m := conventionalPattern.FindStringSubmatch(subject)
	if m == nil {
		return nil, false
	}

	return &ConventionalCommit{
		Type:     m[1],
		Scope:    strings.Trim(m[2], "()"),
		Breaking: m[3] == "!",
		Message:  strings.TrimSpace(m[4]),
		Hash:     hash,
	}, true
}

// ParseConventionalCommits filters and parses a slice of git commits.
// Non-conventional commits are silently skipped.
func ParseConventionalCommits(commits []Commit) []ConventionalCommit {
	var out []ConventionalCommit

	for _, c := range commits {
		cc, ok := ParseConventionalCommit(c.Subject, c.Hash)
		if ok {
			out = append(out, *cc)
		}
	}

	return out
}

// DeduplicateCommits removes commits whose stripped message is already present.
// Strips "(take N)" suffixes before comparing so incremental WIP commits collapse.
func DeduplicateCommits(commits []ConventionalCommit) []ConventionalCommit {
	seen := make(map[string]bool, len(commits))
	out := make([]ConventionalCommit, 0, len(commits))

	for _, c := range commits {
		key := c.Type + ":" + StripTakeSuffix(c.Message)
		if !seen[key] {
			seen[key] = true
			out = append(out, c)
		}
	}

	return out
}

// StripTakeSuffix removes "(take II)" / "(take 2)" suffixes used for incremental WIP.
func StripTakeSuffix(message string) string {
	return strings.TrimSpace(takeSuffixPattern.ReplaceAllString(message, ""))
}

// --- helpers ---

func contains(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}

	return false
}
