// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build wasip1

package codebasefx

import (
	"context"
	"fmt"
)

// errNoGitOnWasip1 is what runGit returns on wasip1, which cannot start a
// process. A git-aware walk fails with it unless the caller passed the git
// listing (WalkOptions.GitFiles). Keeping os/exec out of this build keeps the
// WASM profile small (TASK-272, F2).
var errNoGitOnWasip1 = fmt.Errorf("%w on wasip1, which cannot start a process", ErrGitUnavailable)

func runGit(_ context.Context, _ string, _ ...string) (string, error) {
	return "", errNoGitOnWasip1
}

// GetCurrentBranch reports that git is unavailable, so callers fall back as
// they do when git is missing.
func GetCurrentBranch(_ context.Context, _ string) (string, error) {
	return "", errNoGitOnWasip1
}
