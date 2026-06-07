//go:build !windows

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx

import (
	"os/exec"
	"syscall"
	"time"
)

// setupCancelKill makes context cancellation terminate the command and every
// child process it spawned. The command is placed in its own process group, and
// on cancel the whole group is sent SIGKILL — so a `sh -c` wrapper that launched
// a long-running child (e.g. sleep) is fully torn down rather than orphaned.
//
// WaitDelay guarantees Wait() returns promptly after the kill even if a child
// still holds the output pipe.
func setupCancelKill(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return nil
		}

		// A negative PID targets the entire process group.
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}
	cmd.WaitDelay = 2 * time.Second
}
