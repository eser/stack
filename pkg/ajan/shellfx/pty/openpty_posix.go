// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build linux || darwin

package pty

import (
	"fmt"
	"os"

	"golang.org/x/sys/unix"
)

// The pseudo-terminal pair is opened through system calls rather than libc's
// openpty, so the package builds with CGO_ENABLED=0, which is how the release
// binaries are compiled.

// ptyOpenFlags opens either end of a pair. O_NOCTTY keeps the daemon from
// taking the terminal as its own; O_CLOEXEC keeps the fds out of every child
// but the one they are handed to.
const ptyOpenFlags = unix.O_RDWR | unix.O_NOCTTY | unix.O_CLOEXEC

// openMaster opens a new pseudo-terminal master.
func openMaster() (*os.File, int, error) {
	fd, err := unix.Open("/dev/ptmx", ptyOpenFlags, 0)
	if err != nil {
		return nil, 0, fmt.Errorf("open /dev/ptmx: %w", err)
	}

	return os.NewFile(uintptr(fd), "pty-master"), fd, nil
}

// openSlave opens the slave end named name of master's pair and sets its
// window size when cols and rows are both positive. On failure it closes
// master too.
func openSlave(master *os.File, name string, cols, rows int) (*os.File, *os.File, error) {
	fd, err := unix.Open(name, ptyOpenFlags, 0)
	if err != nil {
		_ = master.Close() // the pair is unusable; the open error is the one to report

		return nil, nil, fmt.Errorf("open pty slave %s: %w", name, err)
	}

	slave := os.NewFile(uintptr(fd), "pty-slave")

	if cols > 0 && rows > 0 {
		size := &unix.Winsize{Row: uint16(rows), Col: uint16(cols)} //nolint:gosec // G115: terminal sizes are far below 65536
		if err := unix.IoctlSetWinsize(fd, unix.TIOCSWINSZ, size); err != nil {
			_ = slave.Close()  // as above
			_ = master.Close() // as above

			return nil, nil, fmt.Errorf("set the window size of %s to %dx%d: %w", name, cols, rows, err)
		}
	}

	return master, slave, nil
}
