// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build linux

package pty

import (
	"fmt"
	"os"
	"strconv"

	"golang.org/x/sys/unix"
)

// openPTY opens a master and slave pair: unlockpt and ptsname as the kernel
// implements them, through TIOCSPTLCK and TIOCGPTN.
func openPTY(cols, rows int) (*os.File, *os.File, error) {
	master, fd, err := openMaster()
	if err != nil {
		return nil, nil, err
	}

	if err := unix.IoctlSetPointerInt(fd, unix.TIOCSPTLCK, 0); err != nil {
		_ = master.Close() // the pair is unusable; the ioctl error is the one to report

		return nil, nil, fmt.Errorf("unlock the pty: %w", err)
	}

	number, err := unix.IoctlGetUint32(fd, unix.TIOCGPTN)
	if err != nil {
		_ = master.Close() // as above

		return nil, nil, fmt.Errorf("read the pty number: %w", err)
	}

	return openSlave(master, "/dev/pts/"+strconv.FormatUint(uint64(number), 10), cols, rows)
}
