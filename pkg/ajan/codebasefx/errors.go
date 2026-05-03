// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import "errors"

// Sentinel errors for the codebasefx package.
var (
	ErrGitNotFound       = errors.New("git binary not found in PATH")
	ErrNotAGitRepo       = errors.New("not a git repository")
	ErrNoTags            = errors.New("no tags found in repository")
	ErrInvalidVersion    = errors.New("invalid semver version")
	ErrUnknownCommand    = errors.New("unknown version command")
	ErrInvalidCommitMsg  = errors.New("commit message does not follow conventional commit format")
	ErrChangelogNotFound = errors.New("CHANGELOG.md not found")
	ErrNoCommits         = errors.New("no commits found in range")
)
