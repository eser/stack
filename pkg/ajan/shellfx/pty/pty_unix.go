// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows && !wasip1

package pty

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

func platformSpawn(ctx context.Context, opts SpawnOptions) (*platform, error) { //nolint:gocritic // hugeParam: existing signature, written before this check was enabled
	master, slave, err := openPTY(opts.Cols, opts.Rows)
	if err != nil {
		return nil, err
	}

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

// platformResize sets the window size through the master's raw connection,
// which holds the fd open for the call: the master is closed by watcherLoop
// when the child exits, and a resize racing that close must not reach a
// closed or reused fd number.
func platformResize(p *platform, cols, rows int) error {
	conn, err := p.master.SyscallConn()
	if err != nil {
		return fmt.Errorf("resize pty: %w", err)
	}

	var ioctlErr error

	controlErr := conn.Control(func(fd uintptr) {
		ioctlErr = unix.IoctlSetWinsize(int(fd), unix.TIOCSWINSZ, &unix.Winsize{ //nolint:gosec // G115: fds and terminal sizes are far below the limits
			Row: uint16(rows),
			Col: uint16(cols),
		})
	})
	if controlErr != nil {
		return fmt.Errorf("resize pty: %w", controlErr)
	}

	if ioctlErr != nil {
		return fmt.Errorf("resize pty to %dx%d: %w", cols, rows, ioctlErr)
	}

	return nil
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
		if exitErr, ok := errors.AsType[*exec.ExitError](err); ok {
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
