// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build windows

package processfx

import "os/exec"

// Windows has no process groups in the POSIX sense. Killing a whole tree needs
// a Job Object, which is a larger change than this primitive; the child itself
// is still killed by Cmd.Cancel, matching the previous behaviour rather than
// silently claiming more.
func setProcessGroup(_ *exec.Cmd) {}

func killProcessGroup(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}

	return cmd.Process.Kill() //nolint:wrapcheck
}
