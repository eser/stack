// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows && !wasip1

package exec

import (
	"os/exec"
	"syscall"
)

// setProcessGroup puts the child in its own process group so Close can signal
// the whole tree. Without it, exec.CommandContext only kills the direct child;
// any grandchild (`sh -c "... &"`) survives, keeps the inherited stdout/stderr
// write ends open, and the reader goroutines never see EOF.
func setProcessGroup(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{} //nolint:exhaustruct
	}

	cmd.SysProcAttr.Setpgid = true
}

// killProcessGroup SIGKILLs the child's entire process group, best effort.
func killProcessGroup(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}

	// Negative pid targets the process group created by setProcessGroup.
	if err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL); err == nil {
		return
	}

	// The group send can fail if setProcessGroup did not take effect; fall back
	// to signalling just the child.
	_ = syscall.Kill(cmd.Process.Pid, syscall.SIGKILL)
}
