// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows && !wasip1

package processfx

import (
	"os/exec"
	"syscall"
)

func setProcessGroup(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{} //nolint:exhaustruct
	}

	cmd.SysProcAttr.Setpgid = true
}

func killProcessGroup(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}

	// A negative pid targets the whole process group created by
	// setProcessGroup.
	if err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL); err == nil {
		return nil
	}

	// The group signal fails if setProcessGroup did not take effect; fall back
	// to the direct child so cancellation still does something.
	return syscall.Kill(cmd.Process.Pid, syscall.SIGKILL) //nolint:wrapcheck
}
