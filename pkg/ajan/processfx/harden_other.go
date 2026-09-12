// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build wasip1

package processfx

import "os/exec"

// setProcessGroup is a no-op: wasip1 has no process groups.
func setProcessGroup(_ *exec.Cmd) {}

// killProcessGroup only ever sees a nil Process: wasip1 cannot spawn
// processes, so Start fails before Cancel could run. Kept symmetrical with the
// other platforms rather than panicking on an unreachable path.
func killProcessGroup(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}

	return cmd.Process.Kill() //nolint:wrapcheck
}
