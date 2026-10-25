// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows

package main

import (
	"errors"
	"syscall"
)

// isProcessAlive reports whether pid runs: signal 0 checks without
// delivering anything, and EPERM means the process belongs to another user.
func isProcessAlive(pid int) bool {
	if pid <= 0 {
		return false
	}

	err := syscall.Kill(pid, 0)

	return err == nil || errors.Is(err, syscall.EPERM)
}
