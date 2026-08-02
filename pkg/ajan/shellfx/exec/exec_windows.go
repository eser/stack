// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build windows

package exec

import "os/exec"

// setProcessGroup is a no-op on Windows. Job objects are the equivalent
// primitive, but exec.Cmd exposes no hook for attaching one, so Close relies on
// killProcessGroup's taskkill fallback plus WaitDelay instead.
func setProcessGroup(_ *exec.Cmd) {}

// killProcessGroup terminates the child. Windows has no process-group signal,
// so grandchildren are handled by the WaitDelay backstop in Close rather than
// here.
func killProcessGroup(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}

	_ = cmd.Process.Kill()
}
