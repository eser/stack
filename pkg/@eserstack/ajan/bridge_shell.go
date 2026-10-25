// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/eser/stack/pkg/ajan/processfx"
	shellfxexec "github.com/eser/stack/pkg/ajan/shellfx/exec"
	shellfxpty "github.com/eser/stack/pkg/ajan/shellfx/pty"
	shelltui "github.com/eser/stack/pkg/ajan/shellfx/tui"
)

// Shell handles, guarded by handleMu.
var (
	execHandles        = make(map[string]*shellfxexec.ChildProcessHandle)
	ptyHandles         = make(map[string]*shellfxpty.Session)
	tuiKeypressHandles = make(map[string]*shelltui.KeypressReader)
)

// drainShellHandles snapshots and clears the child process, PTY and keypress
// registries, and closes each handle on release.
func drainShellHandles() shutdownStep {
	handleMu.Lock()

	execs := make([]*shellfxexec.ChildProcessHandle, 0, len(execHandles))
	for _, h := range execHandles {
		execs = append(execs, h)
	}

	ptys := make([]*shellfxpty.Session, 0, len(ptyHandles))
	for _, s := range ptyHandles {
		ptys = append(ptys, s)
	}

	keypresses := make([]*shelltui.KeypressReader, 0, len(tuiKeypressHandles))
	for _, r := range tuiKeypressHandles {
		keypresses = append(keypresses, r)
	}

	clear(execHandles)
	clear(ptyHandles)
	clear(tuiKeypressHandles)
	handleMu.Unlock()

	return shutdownStep{ //nolint:exhaustruct
		release: func() {
			for _, h := range execs {
				_ = h.Close()
			}

			for _, s := range ptys {
				_ = s.Close()
			}

			for _, r := range keypresses {
				r.Close()
			}
		},
	}
}

// ---------------------------------------------------------------------------
// Shell exec bridge
// ---------------------------------------------------------------------------

type shellExecRequest struct {
	Command string   `json:"command"`
	Args    []string `json:"args,omitempty"`
	Cwd     string   `json:"cwd,omitempty"`
	Env     []string `json:"env,omitempty"`
	Stdin   string   `json:"stdin,omitempty"`
	// Timeout is a Go duration string such as "30s". Empty means
	// defaultShellExecTimeout.
	Timeout string `json:"timeout,omitempty"`
}

type shellExecResponse struct {
	Stdout string `json:"stdout,omitempty"`
	Stderr string `json:"stderr,omitempty"`
	Code   int    `json:"code"`
	Error  string `json:"error,omitempty"`
}

// defaultShellExecTimeout bounds a bridgeShellExec command whose request sets
// no timeout, so a hung child cannot block the calling thread forever. A caller
// that runs a longer command sends a larger "timeout".
const defaultShellExecTimeout = 10 * time.Minute

// errShellExecTimeoutNotPositive rejects a zero or negative timeout: processfx
// reads zero as "no limit", and every bridged command has one.
var errShellExecTimeoutNotPositive = errors.New("timeout must be a positive duration")

// shellExecTimeout turns the request's timeout into a duration. An empty value
// gives defaultShellExecTimeout.
func shellExecTimeout(raw string) (time.Duration, error) {
	if raw == "" {
		return defaultShellExecTimeout, nil
	}

	d, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf(`parse timeout %q as a Go duration such as "30s": %w`, raw, err)
	}

	if d <= 0 {
		return 0, fmt.Errorf(`%w: got %q; send one such as "30s", or omit it for the %s default`,
			errShellExecTimeoutNotPositive, raw, defaultShellExecTimeout)
	}

	return d, nil
}

// bridgeShellExec executes a shell command and returns stdout/stderr/exit-code.
// The command stops after the request's timeout, or after
// defaultShellExecTimeout when the request sets none.
func bridgeShellExec(requestJSON string) string {
	var req shellExecRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(shellExecResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	timeout, err := shellExecTimeout(req.Timeout)
	if err != nil {
		return marshalResponse(shellExecResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	opts := processfx.ExecOptions{
		Cwd:     req.Cwd,
		Env:     req.Env,
		Timeout: timeout,
	}

	if req.Stdin != "" {
		opts.Stdin = []byte(req.Stdin)
	}

	// command + args form a complete argv (callers pre-wrap, e.g.
	// command "sh" with args ["-c", script]). Run executes it directly — using
	// Exec here would re-wrap into `sh -c "sh" -c script`, a nested no-op shell.
	result, err := processfx.Run(context.Background(), req.Command, req.Args, opts)
	if errors.Is(err, context.DeadlineExceeded) {
		return marshalResponse(shellExecResponse{ //nolint:exhaustruct
			Error: fmt.Sprintf(`%v: the command ran past its %s timeout; send a larger "timeout" to allow more time`,
				err, timeout),
		})
	}

	if err != nil {
		return marshalResponse(shellExecResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(shellExecResponse{
		Stdout: result.Stdout,
		Stderr: result.Stderr,
		Code:   result.Code,
	})
}

// ---------------------------------------------------------------------------
// Shell TUI bridge — keypress event source, raw mode, terminal size
// ---------------------------------------------------------------------------

type tuiKeypressCreateResponse struct {
	Handle string `json:"handle,omitempty"`
	Error  string `json:"error,omitempty"`
}

type tuiKeypressEventResponse struct {
	Name  string `json:"name"`
	Char  string `json:"char,omitempty"`
	Ctrl  bool   `json:"ctrl"`
	Meta  bool   `json:"meta"`
	Shift bool   `json:"shift"`
	Raw   string `json:"raw,omitempty"`
	Cols  int    `json:"cols,omitempty"`
	Rows  int    `json:"rows,omitempty"`
	Error string `json:"error,omitempty"`
}

type tuiSetStdinRawRequest struct {
	Enable bool `json:"enable"`
}

type tuiGetSizeResponse struct {
	Cols  int    `json:"cols"`
	Rows  int    `json:"rows"`
	Error string `json:"error,omitempty"`
}

// bridgeShellTuiKeypressCreate creates a keypress reader from os.Stdin
// and returns a handle for use with Read/Close.
func bridgeShellTuiKeypressCreate(_ string) string {
	handle := newHandle("tuikeypress")
	reader := shelltui.NewKeypressReader(context.Background(), os.Stdin)

	handleMu.Lock()
	tuiKeypressHandles[handle] = reader
	handleMu.Unlock()

	return marshalResponse(tuiKeypressCreateResponse{Handle: handle})
}

// bridgeShellTuiKeypressRead blocks until the next keypress event.
// Returns "null" when the reader is closed (§20 stream done sentinel).
func bridgeShellTuiKeypressRead(handle string) string {
	handleMu.RLock()
	reader, ok := tuiKeypressHandles[handle]
	handleMu.RUnlock()

	if !ok {
		return marshalError("handle not found: " + handle)
	}

	ev, alive := reader.Read()
	if !alive {
		return "null"
	}

	return marshalResponse(tuiKeypressEventResponse{
		Name:  ev.Name,
		Char:  ev.Char,
		Ctrl:  ev.Ctrl,
		Meta:  ev.Meta,
		Shift: ev.Shift,
		Raw:   ev.Raw,
		Cols:  ev.Cols,
		Rows:  ev.Rows,
	})
}

// bridgeShellTuiKeypressClose cancels and removes a keypress handle.
//
// Closing an unknown or already-closed handle succeeds: close is idempotent
// across every handle kind in this bridge.
//
//nolint:unparam // uniform string return is part of the exported C ABI
func bridgeShellTuiKeypressClose(handle string) string {
	handleMu.Lock()
	reader, ok := tuiKeypressHandles[handle]

	if ok {
		delete(tuiKeypressHandles, handle)
	}

	handleMu.Unlock()

	if !ok {
		return "{}"
	}

	reader.Close()

	return "{}"
}

// bridgeShellTuiSetStdinRaw enables or disables raw mode on os.Stdin.
func bridgeShellTuiSetStdinRaw(requestJSON string) string {
	var req tuiSetStdinRawRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request: " + err.Error())
	}

	if err := shelltui.SetStdinRaw(req.Enable); err != nil {
		return marshalError(err.Error())
	}

	return "{}"
}

// bridgeShellTuiGetSize returns the current terminal dimensions.
func bridgeShellTuiGetSize(_ string) string {
	size, err := shelltui.GetTerminalSize()
	if err != nil {
		return marshalError(err.Error())
	}

	return marshalResponse(tuiGetSizeResponse{Cols: size.Cols, Rows: size.Rows})
}

// ---------------------------------------------------------------------------
// Shell exec spawn bridge — bidirectional child process (§20 streaming)
// ---------------------------------------------------------------------------

type shellExecSpawnRequest struct {
	Command string   `json:"command"`
	Args    []string `json:"args,omitempty"`
	Cwd     string   `json:"cwd,omitempty"`
	Env     []string `json:"env,omitempty"`
}

type shellExecSpawnResponse struct {
	Handle string `json:"handle,omitempty"`
	Pid    int    `json:"pid,omitempty"`
	Error  string `json:"error,omitempty"`
}

type shellExecReadResponse struct {
	Stream string `json:"stream,omitempty"`
	Chunk  string `json:"chunk,omitempty"` // base64
	Error  string `json:"error,omitempty"`
}

type shellExecWriteRequest struct {
	Handle string `json:"handle"`
	Data   string `json:"data"` // base64
}

type shellExecCloseResponse struct {
	Code  int    `json:"code"`
	Error string `json:"error,omitempty"`
}

// bridgeShellExecSpawn starts a child process and returns a handle + pid.
func bridgeShellExecSpawn(requestJSON string) string {
	var req shellExecSpawnRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(shellExecSpawnResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	h, err := shellfxexec.SpawnChildProcess(shellfxexec.SpawnOptions{
		Command: req.Command,
		Args:    req.Args,
		Cwd:     req.Cwd,
		Env:     req.Env,
	})
	if err != nil {
		return marshalResponse(shellExecSpawnResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	handle := newHandle("exec")

	handleMu.Lock()
	execHandles[handle] = h
	handleMu.Unlock()

	return marshalResponse(shellExecSpawnResponse{Handle: handle, Pid: h.Pid()})
}

// bridgeShellExecRead returns the next output chunk. Returns "null" when done (§20).
func bridgeShellExecRead(handle string) string {
	handleMu.RLock()
	h := execHandles[handle]
	handleMu.RUnlock()

	if h == nil {
		return marshalResponse(shellExecReadResponse{Error: "unknown handle: " + handle}) //nolint:exhaustruct
	}

	chunk, ok := h.Read()
	if !ok {
		return "null"
	}

	return marshalResponse(shellExecReadResponse{
		Stream: chunk.Stream,
		Chunk:  shellfxexec.EncodeChunk(chunk.Data),
	})
}

// bridgeShellExecWrite sends base64-encoded data to the child process stdin.
func bridgeShellExecWrite(requestJSON string) string {
	var req shellExecWriteRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	handleMu.RLock()
	h := execHandles[req.Handle]
	handleMu.RUnlock()

	if h == nil {
		return marshalError("unknown handle: " + req.Handle)
	}

	data, err := shellfxexec.DecodeChunk(req.Data)
	if err != nil {
		return marshalError("invalid base64 data: " + err.Error())
	}

	if err := h.Write(data); err != nil {
		return marshalError("write failed: " + err.Error())
	}

	return "{}"
}

// bridgeShellExecClose terminates the process and removes the handle.
//
// Closing an unknown or already-closed handle succeeds with exit code 0: close
// is idempotent across every handle kind in this bridge.
func bridgeShellExecClose(handle string) string {
	handleMu.Lock()
	h := execHandles[handle]
	delete(execHandles, handle)
	handleMu.Unlock()

	if h == nil {
		return marshalResponse(shellExecCloseResponse{Code: 0}) //nolint:exhaustruct
	}

	code := h.Close()

	return marshalResponse(shellExecCloseResponse{Code: code})
}

// ---------------------------------------------------------------------------
// Shell PTY bridge (real pseudo-terminal)
// ---------------------------------------------------------------------------

type shellPtySpawnRequest struct {
	Command string   `json:"command"`
	Args    []string `json:"args,omitempty"`
	Cwd     string   `json:"cwd,omitempty"`
	Env     []string `json:"env,omitempty"`
	Cols    int      `json:"cols,omitempty"`
	Rows    int      `json:"rows,omitempty"`
}

type shellPtySpawnResponse struct {
	Handle string `json:"handle,omitempty"`
	Pid    int    `json:"pid,omitempty"`
	Error  string `json:"error,omitempty"`
}

type shellPtyReadResponse struct {
	Chunk string `json:"chunk,omitempty"` // base64; PTY merges stdout+stderr (no stream tag)
	Error string `json:"error,omitempty"`
}

type shellPtyWriteRequest struct {
	Handle string `json:"handle"`
	Data   string `json:"data"` // base64
}

type shellPtyResizeRequest struct {
	Handle string `json:"handle"`
	Cols   int    `json:"cols"`
	Rows   int    `json:"rows"`
}

type shellPtyKillRequest struct {
	Handle string `json:"handle"`
	Signal string `json:"signal,omitempty"`
}

type shellPtyCloseResponse struct {
	Code  int    `json:"code"`
	Error string `json:"error,omitempty"`
}

// bridgeShellPtySpawn starts a PTY child process and returns a handle + pid.
func bridgeShellPtySpawn(requestJSON string) string {
	var req shellPtySpawnRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(shellPtySpawnResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	s, err := shellfxpty.Spawn(shellfxpty.SpawnOptions{
		Command: req.Command,
		Args:    req.Args,
		Cwd:     req.Cwd,
		Env:     req.Env,
		Cols:    req.Cols,
		Rows:    req.Rows,
	})
	if err != nil {
		return marshalResponse(shellPtySpawnResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	handle := newHandle("pty")

	handleMu.Lock()
	ptyHandles[handle] = s
	handleMu.Unlock()

	return marshalResponse(shellPtySpawnResponse{Handle: handle, Pid: s.Pid()}) //nolint:exhaustruct
}

// bridgeShellPtyRead returns the next output chunk. Returns "null" when done (§20).
func bridgeShellPtyRead(handle string) string {
	handleMu.RLock()
	s := ptyHandles[handle]
	handleMu.RUnlock()

	if s == nil {
		return marshalResponse(shellPtyReadResponse{Error: "unknown handle: " + handle}) //nolint:exhaustruct
	}

	chunk, ok := s.Read()
	if !ok {
		return "null"
	}

	return marshalResponse(shellPtyReadResponse{Chunk: shellfxpty.EncodeChunk(chunk)}) //nolint:exhaustruct
}

// bridgeShellPtyWrite sends base64-encoded data to the PTY.
func bridgeShellPtyWrite(requestJSON string) string {
	var req shellPtyWriteRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	handleMu.RLock()
	s := ptyHandles[req.Handle]
	handleMu.RUnlock()

	if s == nil {
		return marshalError("unknown handle: " + req.Handle)
	}

	data, err := shellfxpty.DecodeChunk(req.Data)
	if err != nil {
		return marshalError("invalid base64 data: " + err.Error())
	}

	if err := s.Write(data); err != nil {
		return marshalError("write failed: " + err.Error())
	}

	return "{}"
}

// bridgeShellPtyResize updates the PTY window size.
func bridgeShellPtyResize(requestJSON string) string {
	var req shellPtyResizeRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	handleMu.RLock()
	s := ptyHandles[req.Handle]
	handleMu.RUnlock()

	if s == nil {
		return marshalError("unknown handle: " + req.Handle)
	}

	if err := s.Resize(req.Cols, req.Rows); err != nil {
		return marshalError("resize failed: " + err.Error())
	}

	return "{}"
}

// bridgeShellPtyKill signals the PTY child without removing the handle (the exit
// code still resolves via Close).
func bridgeShellPtyKill(requestJSON string) string {
	var req shellPtyKillRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	handleMu.RLock()
	s := ptyHandles[req.Handle]
	handleMu.RUnlock()

	if s == nil {
		return marshalError("unknown handle: " + req.Handle)
	}

	if err := s.Kill(req.Signal); err != nil {
		return marshalError("kill failed: " + err.Error())
	}

	return "{}"
}

// bridgeShellPtyClose terminates the PTY and removes the handle.
//
// Closing an unknown or already-closed handle succeeds with exit code 0: close
// is idempotent across every handle kind in this bridge.
func bridgeShellPtyClose(handle string) string {
	handleMu.Lock()
	s := ptyHandles[handle]
	delete(ptyHandles, handle)
	handleMu.Unlock()

	if s == nil {
		return marshalResponse(shellPtyCloseResponse{Code: 0}) //nolint:exhaustruct
	}

	code := s.Close()

	return marshalResponse(shellPtyCloseResponse{Code: code}) //nolint:exhaustruct
}

func init() {
	registerShutdownDrain(drainShellHandles)
	register("shellExec", []string{"requestJSON"}, func(a []string) string { return bridgeShellExec(a[0]) })
	register("shellTuiKeypressCreate", []string{"requestJSON"}, func(a []string) string { return bridgeShellTuiKeypressCreate(a[0]) })
	register("shellTuiKeypressRead", []string{"handle"}, func(a []string) string { return bridgeShellTuiKeypressRead(a[0]) })
	register("shellTuiKeypressClose", []string{"handle"}, func(a []string) string { return bridgeShellTuiKeypressClose(a[0]) })
	register("shellTuiSetStdinRaw", []string{"requestJSON"}, func(a []string) string { return bridgeShellTuiSetStdinRaw(a[0]) })
	register("shellTuiGetSize", []string{"requestJSON"}, func(a []string) string { return bridgeShellTuiGetSize(a[0]) })
	register("shellExecSpawn", []string{"requestJSON"}, func(a []string) string { return bridgeShellExecSpawn(a[0]) })
	register("shellExecRead", []string{"handle"}, func(a []string) string { return bridgeShellExecRead(a[0]) })
	register("shellExecWrite", []string{"requestJSON"}, func(a []string) string { return bridgeShellExecWrite(a[0]) })
	register("shellExecClose", []string{"handle"}, func(a []string) string { return bridgeShellExecClose(a[0]) })
	register("shellPtySpawn", []string{"requestJSON"}, func(a []string) string { return bridgeShellPtySpawn(a[0]) })
	register("shellPtyRead", []string{"handle"}, func(a []string) string { return bridgeShellPtyRead(a[0]) })
	register("shellPtyWrite", []string{"requestJSON"}, func(a []string) string { return bridgeShellPtyWrite(a[0]) })
	register("shellPtyResize", []string{"requestJSON"}, func(a []string) string { return bridgeShellPtyResize(a[0]) })
	register("shellPtyKill", []string{"requestJSON"}, func(a []string) string { return bridgeShellPtyKill(a[0]) })
	register("shellPtyClose", []string{"handle"}, func(a []string) string { return bridgeShellPtyClose(a[0]) })
}
