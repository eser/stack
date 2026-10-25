// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build darwin

package pty

import (
	"bytes"
	"fmt"
	"os"
	"syscall"
	"unsafe"

	"golang.org/x/sys/unix"
)

// ptyNameSize is the buffer TIOCPTYGNAME fills: 128 bytes, NUL-terminated.
const ptyNameSize = 128

// openPTY opens a master and slave pair: grantpt, unlockpt and ptsname as
// macOS implements them, through TIOCPTYGRANT, TIOCPTYUNLK and TIOCPTYGNAME.
func openPTY(cols, rows int) (*os.File, *os.File, error) {
	master, fd, err := openMaster()
	if err != nil {
		return nil, nil, err
	}

	if err := unix.IoctlSetInt(fd, unix.TIOCPTYGRANT, 0); err != nil {
		_ = master.Close() // the pair is unusable; the ioctl error is the one to report

		return nil, nil, fmt.Errorf("grant the pty: %w", err)
	}

	if err := unix.IoctlSetInt(fd, unix.TIOCPTYUNLK, 0); err != nil {
		_ = master.Close() // as above

		return nil, nil, fmt.Errorf("unlock the pty: %w", err)
	}

	var name [ptyNameSize]byte

	// x/sys/unix has no helper for an ioctl that fills a buffer on darwin.
	_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, uintptr(fd), uintptr(unix.TIOCPTYGNAME), uintptr(unsafe.Pointer(&name[0]))) //nolint:gosec // G103: the kernel writes at most ptyNameSize bytes into name
	if errno != 0 {
		_ = master.Close() // as above

		return nil, nil, fmt.Errorf("read the pty name: %w", errno)
	}

	slaveName, _, _ := bytes.Cut(name[:], []byte{0})

	return openSlave(master, string(slaveName), cols, rows)
}
