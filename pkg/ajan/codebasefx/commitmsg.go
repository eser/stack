// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"fmt"
	"regexp"
	"strings"
)

// defaultConventionalTypes are the types recognised by conventional commits.
var defaultConventionalTypes = []string{
	"feat", "fix", "docs", "style", "refactor",
	"perf", "test", "build", "ci", "chore", "revert",
}

// conventionalPattern matches: type(scope)!: subject
// Groups: 1=type, 2=scope (with parens), 3=breaking (!), 4=subject
var conventionalPattern = regexp.MustCompile(`^(\w+)(\([^)]+\))?(!)?: *(.+)$`)

// takeSuffixPattern strips "(take II)" / "(take 2)" trailing labels.
var takeSuffixPattern = regexp.MustCompile(`\s+\(take\s+[IVXivx\d]+\)\s*$`)

// ValidateCommitMsg validates a message against the conventional commit spec.
// Returns a CommitMsgResult with Valid=false and explanatory Issues on failure.
func ValidateCommitMsg(message string, opts CommitMsgOptions) CommitMsgResult {
	message = strings.TrimSpace(message)
	result := CommitMsgResult{Valid: true}

	if message == "" {
		return CommitMsgResult{
			Valid:  false,
			Issues: []string{"commit message must not be empty"},
		}
	}

	// Allow "*" as a wildcard (useful in pre-commit hooks that skip validation)
	if opts.AllowAsterisk && message == "*" {
		return result
	}

	m := conventionalPattern.FindStringSubmatch(message)
	if m == nil {
		result.Valid = false
		result.Issues = append(result.Issues,
			fmt.Sprintf("does not match conventional commit format <type>(<scope>): <subject>; got: %q", message))

		return result
	}

	commitType := m[1]
	scope := strings.Trim(m[2], "()")
	// m[3] is the breaking-change "!"

	// Validate type
	allowed := opts.Types
	if len(allowed) == 0 {
		allowed = defaultConventionalTypes
	}

	if !contains(allowed, commitType) {
		result.Valid = false
		result.Issues = append(result.Issues,
			fmt.Sprintf("unknown type %q; allowed: %s", commitType, strings.Join(allowed, ", ")))
	}

	// Scope rules
	if opts.ForceScope && scope == "" {
		result.Valid = false
		result.Issues = append(result.Issues, "scope is required")
	}

	if !opts.AllowMultipleScopes && strings.Contains(scope, ",") {
		result.Valid = false
		result.Issues = append(result.Issues, "multiple scopes are not allowed; use a single scope")
	}

	return result
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
