// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build windows

package main

import "os"

// isProcessAlive reports whether pid runs; on Windows, FindProcess opens
// the process and fails when there is none.
func isProcessAlive(pid int) bool {
	if pid <= 0 {
		return false
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}

	_ = process.Release()

	return true
}
