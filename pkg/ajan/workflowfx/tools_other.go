//go:build !unix && !windows

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx

import "os/exec"

// setupCancelKill is a no-op on platforms with neither POSIX process groups nor
// taskkill (e.g. wasip1, js). These targets can't spawn child processes, so
// there is no process tree to tear down on cancellation.
func setupCancelKill(_ *exec.Cmd) {}
