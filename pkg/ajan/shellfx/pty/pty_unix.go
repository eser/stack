// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows && !wasip1

package pty

/*
#cgo linux LDFLAGS: -lutil
#include <stdlib.h>
#include <sys/ioctl.h>
#include <termios.h>
#if defined(__APPLE__)
#include <util.h>
#else
#include <pty.h>
#endif

// go_openpty opens a master/slave PTY pair, optionally seeding the window size.
// Returns 0 on success and writes the fds to *amaster / *aslave.
static int go_openpty(int *amaster, int *aslave, int cols, int rows) {
    struct winsize ws;
    ws.ws_row = (unsigned short)rows;
    ws.ws_col = (unsigned short)cols;
    ws.ws_xpixel = 0;
    ws.ws_ypixel = 0;

    return openpty(amaster, aslave, NULL, NULL,
        (cols > 0 && rows > 0) ? &ws : NULL);
}
*/
import "C"

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"syscall"

	"golang.org/x/sys/unix"
)

type platform struct {
	master *os.File
	cmd    *exec.Cmd
}

func platformSpawn(ctx context.Context, opts SpawnOptions) (*platform, error) {
	var masterFd, slaveFd C.int

	if C.go_openpty(&masterFd, &slaveFd, C.int(opts.Cols), C.int(opts.Rows)) != 0 {
		return nil, errors.New("openpty failed")
	}

	master := os.NewFile(uintptr(masterFd), "pty-master")
	slave := os.NewFile(uintptr(slaveFd), "pty-slave")

	cmd := exec.CommandContext(ctx, opts.Command, opts.Args...)
	if opts.Cwd != "" {
		cmd.Dir = opts.Cwd
	}

	if len(opts.Env) > 0 {
		cmd.Env = opts.Env
	}

	// The slave becomes the child's stdin/stdout/stderr (fds 0/1/2) and its
	// controlling terminal (Setsid + Setctty with Ctty defaulting to fd 0).
	cmd.Stdin = slave
	cmd.Stdout = slave
	cmd.Stderr = slave
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid:  true,
		Setctty: true,
	}

	if err := cmd.Start(); err != nil {
		_ = master.Close()
		_ = slave.Close()

		return nil, fmt.Errorf("pty start: %w", err)
	}

	// Close the slave in the parent; otherwise the master never sees EOF when
	// the child exits and the exit code would never resolve.
	_ = slave.Close()

	return &platform{master: master, cmd: cmd}, nil
}

func platformRead(p *platform, buf []byte) (int, error) {
	return p.master.Read(buf)
}

func platformWrite(p *platform, data []byte) (int, error) {
	return p.master.Write(data)
}

func platformResize(p *platform, cols, rows int) error {
	return unix.IoctlSetWinsize(int(p.master.Fd()), unix.TIOCSWINSZ, &unix.Winsize{
		Row: uint16(rows),
		Col: uint16(cols),
	})
}

func platformKill(p *platform, signal string) error {
	if p.cmd.Process == nil {
		return nil
	}

	sig := syscall.SIGTERM
	if signal == "SIGKILL" {
		sig = syscall.SIGKILL
	}

	// Negative pid signals the whole process group (Setsid made the child a
	// session/group leader), so the shell's children die too.
	if err := syscall.Kill(-p.cmd.Process.Pid, sig); err != nil {
		// Fall back to signalling just the child if the group send fails.
		return syscall.Kill(p.cmd.Process.Pid, sig)
	}

	return nil
}

func platformWaitProcess(p *platform) int {
	code := 0
	if err := p.cmd.Wait(); err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			code = exitErr.ExitCode()
		} else {
			code = -1
		}
	}

	return code
}

// platformAfterExit is a no-op on Unix: once the child's fds close, the master
// reaches EOF on its own, so readerLoop drains the tail and returns.
func platformAfterExit(_ *platform) {}

func platformPid(p *platform) int {
	if p.cmd.Process == nil {
		return -1
	}

	return p.cmd.Process.Pid
}

// platformCleanup closes the master after the reader has exited.
func platformCleanup(p *platform) {
	_ = p.master.Close()
}
