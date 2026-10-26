//go:build windows

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx

import (
	"os/exec"
	"strconv"
	"time"
)

// setupCancelKill makes context cancellation terminate the command and its whole
// child-process tree. Windows has no POSIX process groups, so on cancel we run
// `taskkill /T /F /PID <pid>`, which force-kills the process and all of its
// descendants — otherwise killing the `sh` parent can leave a long-running child
// (e.g. sleep) alive and holding the output pipe.
//
// WaitDelay guarantees Wait() returns promptly after the kill even if a child
// still holds the output pipe.
func setupCancelKill(cmd *exec.Cmd) {
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return nil
		}

		kill := exec.Command(
			"taskkill", "/T", "/F", "/PID", strconv.Itoa(cmd.Process.Pid),
		)

		return kill.Run()
	}
	cmd.WaitDelay = 2 * time.Second
}
