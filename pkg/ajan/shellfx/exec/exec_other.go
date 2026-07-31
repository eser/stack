// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build wasip1

package exec

import "os/exec"

// setProcessGroup is a no-op: wasip1 has no process groups.
func setProcessGroup(_ *exec.Cmd) {}

// killProcessGroup is a no-op: wasip1 cannot spawn processes, so there is
// nothing to signal. Close falls back to context cancellation.
func killProcessGroup(_ *exec.Cmd) {}
