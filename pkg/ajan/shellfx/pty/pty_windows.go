// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build windows

package pty

import (
	"context"
	"fmt"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

type platform struct {
	hpc          windows.Handle // pseudoconsole (HPCON)
	inWrite      windows.Handle // parent writes child stdin here
	outRead      windows.Handle // parent reads child stdout here
	procHandle   windows.Handle
	threadHandle windows.Handle
	pid          int

	mu         sync.Mutex // guards proc-handle terminate/close
	procClosed bool
}

func platformSpawn(_ context.Context, opts SpawnOptions) (*platform, error) {
	var inRead, inWrite, outRead, outWrite windows.Handle

	if err := windows.CreatePipe(&inRead, &inWrite, nil, 0); err != nil {
		return nil, fmt.Errorf("pty create input pipe: %w", err)
	}

	if err := windows.CreatePipe(&outRead, &outWrite, nil, 0); err != nil {
		_ = windows.CloseHandle(inRead)
		_ = windows.CloseHandle(inWrite)

		return nil, fmt.Errorf("pty create output pipe: %w", err)
	}

	cols, rows := opts.Cols, opts.Rows
	if cols <= 0 {
		cols = 80
	}

	if rows <= 0 {
		rows = 24
	}

	var hpc windows.Handle

	err := windows.CreatePseudoConsole(
		windows.Coord{X: int16(cols), Y: int16(rows)},
		inRead, outWrite, 0, &hpc,
	)
	if err != nil {
		_ = windows.CloseHandle(inRead)
		_ = windows.CloseHandle(inWrite)
		_ = windows.CloseHandle(outRead)
		_ = windows.CloseHandle(outWrite)

		return nil, fmt.Errorf("create pseudoconsole: %w", err)
	}

	// The ConPTY duplicated the child-side ends; drop the parent's copies.
	_ = windows.CloseHandle(inRead)
	_ = windows.CloseHandle(outWrite)

	attrList, err := windows.NewProcThreadAttributeList(1)
	if err != nil {
		windows.ClosePseudoConsole(hpc)
		_ = windows.CloseHandle(inWrite)
		_ = windows.CloseHandle(outRead)

		return nil, fmt.Errorf("alloc attribute list: %w", err)
	}
	defer attrList.Delete()

	// PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE requires lpValue to be the HPCON
	// handle value itself (not a pointer to it), so the uintptr→Pointer
	// conversion is intentional and correct here.
	if err := attrList.Update(
		windows.PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
		unsafe.Pointer(hpc), unsafe.Sizeof(hpc), //nolint:govet
	); err != nil {
		windows.ClosePseudoConsole(hpc)
		_ = windows.CloseHandle(inWrite)
		_ = windows.CloseHandle(outRead)

		return nil, fmt.Errorf("set pseudoconsole attribute: %w", err)
	}

	cmdLine, err := windows.UTF16PtrFromString(
		windows.ComposeCommandLine(append([]string{opts.Command}, opts.Args...)),
	)
	if err != nil {
		windows.ClosePseudoConsole(hpc)
		_ = windows.CloseHandle(inWrite)
		_ = windows.CloseHandle(outRead)

		return nil, fmt.Errorf("compose command line: %w", err)
	}

	var cwd *uint16
	if opts.Cwd != "" {
		if cwd, err = windows.UTF16PtrFromString(opts.Cwd); err != nil {
			windows.ClosePseudoConsole(hpc)
			_ = windows.CloseHandle(inWrite)
			_ = windows.CloseHandle(outRead)

			return nil, fmt.Errorf("encode cwd: %w", err)
		}
	}

	envBlock, err := createEnvBlock(opts.Env)
	if err != nil {
		windows.ClosePseudoConsole(hpc)
		_ = windows.CloseHandle(inWrite)
		_ = windows.CloseHandle(outRead)

		return nil, fmt.Errorf("encode env: %w", err)
	}

	si := new(windows.StartupInfoEx)
	si.StartupInfo.Cb = uint32(unsafe.Sizeof(*si))
	si.ProcThreadAttributeList = attrList.List()

	pi := new(windows.ProcessInformation)

	flags := uint32(windows.EXTENDED_STARTUPINFO_PRESENT | windows.CREATE_UNICODE_ENVIRONMENT)

	if err := windows.CreateProcess(
		nil, cmdLine, nil, nil, false, flags, envBlock, cwd, &si.StartupInfo, pi,
	); err != nil {
		windows.ClosePseudoConsole(hpc)
		_ = windows.CloseHandle(inWrite)
		_ = windows.CloseHandle(outRead)

		return nil, fmt.Errorf("create process: %w", err)
	}

	return &platform{
		hpc:          hpc,
		inWrite:      inWrite,
		outRead:      outRead,
		procHandle:   pi.Process,
		threadHandle: pi.Thread,
		pid:          int(pi.ProcessId),
	}, nil
}

// createEnvBlock builds a double-NUL-terminated UTF-16 environment block, or nil
// to inherit the parent environment.
func createEnvBlock(env []string) (*uint16, error) {
	if len(env) == 0 {
		return nil, nil //nolint:nilnil
	}

	var block []uint16

	for _, entry := range env {
		if entry == "" {
			continue
		}

		u, err := windows.UTF16FromString(entry) // includes trailing NUL
		if err != nil {
			return nil, err
		}

		block = append(block, u...)
	}

	block = append(block, 0) // final terminating NUL

	return &block[0], nil
}

func platformRead(p *platform, buf []byte) (int, error) {
	var done uint32

	err := windows.ReadFile(p.outRead, buf, &done, nil)

	return int(done), err
}

func platformWrite(p *platform, data []byte) (int, error) {
	var done uint32

	err := windows.WriteFile(p.inWrite, data, &done, nil)

	return int(done), err
}

func platformResize(p *platform, cols, rows int) error {
	return windows.ResizePseudoConsole(p.hpc, windows.Coord{X: int16(cols), Y: int16(rows)})
}

func platformKill(p *platform, _ string) error {
	// Windows has no POSIX signals; terminate unconditionally.
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.procClosed {
		return nil
	}

	return windows.TerminateProcess(p.procHandle, 1)
}

func platformWaitProcess(p *platform) int {
	_, _ = windows.WaitForSingleObject(p.procHandle, windows.INFINITE)

	var code uint32

	_ = windows.GetExitCodeProcess(p.procHandle, &code)

	return int(code)
}

// platformAfterExit closes the pseudoconsole so the output pipe reaches EOF and
// readerLoop can drain the tail and return. ConPTY keeps the output write end
// open until the console is closed — even after the child exits — so without
// this the reader would block forever on natural exit. It closes the console's
// internal write end, not our outRead handle, so the still-blocked reader is
// unblocked safely rather than having its handle yanked out from under it.
func platformAfterExit(p *platform) {
	windows.ClosePseudoConsole(p.hpc)
}

func platformPid(p *platform) int {
	return p.pid
}

// platformCleanup closes the process/pipe handles. Called from watcherLoop only
// after the reader goroutine has exited, so no handle is closed while a
// ReadFile/WriteFile is in flight on it.
func platformCleanup(p *platform) {
	p.mu.Lock()
	p.procClosed = true
	p.mu.Unlock()

	_ = windows.CloseHandle(p.procHandle)
	_ = windows.CloseHandle(p.threadHandle)
	_ = windows.CloseHandle(p.outRead)
	_ = windows.CloseHandle(p.inWrite)
}
