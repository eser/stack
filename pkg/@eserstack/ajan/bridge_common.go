// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"
)

// Version is the current version of the eser-ajan library.
// Injected at build time via: go build -ldflags "-X main.Version=4.1.44"
// Falls back to "dev" if not set.
var Version = "dev"

// ---------------------------------------------------------------------------
// Lifecycle state
// ---------------------------------------------------------------------------

var (
	initialized bool
	initMu      sync.Mutex
)

// handleMu guards the AI, shell and tokenizer handle registries; handleSeq
// numbers every handle the bridge hands out.
var (
	handleMu  sync.RWMutex
	handleSeq int64
)

// aiHandleResponse is the generic AI response envelope.
//
// ErrorKind and ErrorStatus exist because an error used to cross this bridge as
// a bare sentence. TypeScript builds a typed hierarchy off the status (401 ->
// AuthFailedError, 429 -> RateLimitedError), so without them every failure
// arrived as an undifferentiated AiError and a caller could neither retry a
// rate limit nor re-authenticate.
//
// ErrorStatus is omitempty: a zero would be forwarded into a TypeScript
// constructor as a real value, and `0 ?? 429` is 0, so every typed error would
// end up reporting statusCode 0 instead of its class default.
type aiHandleResponse struct {
	Handle      string `json:"handle,omitempty"`
	Error       string `json:"error,omitempty"`
	ErrorKind   string `json:"errorKind,omitempty"`
	ErrorStatus int    `json:"errorStatus,omitempty"`
}

// ---------------------------------------------------------------------------
// Handle helpers
// ---------------------------------------------------------------------------

func newHandle(prefix string) string {
	id := atomic.AddInt64(&handleSeq, 1)
	return fmt.Sprintf("%s-%d", prefix, id)
}

func marshalResponse(v any) string {
	data, err := json.Marshal(v)
	if err != nil {
		return `{"error":"internal marshal error"}`
	}

	return string(data)
}

func errorResponse(msg string) string {
	return marshalResponse(aiHandleResponse{Error: msg}) //nolint:exhaustruct
}

func marshalError(msg string) string {
	return marshalResponse(struct {
		Error string `json:"error"`
	}{Error: msg})
}

// ---------------------------------------------------------------------------
// Lifecycle bridge functions
// ---------------------------------------------------------------------------

func bridgeVersion() string {
	return "eser-ajan version " + Version
}

func bridgeInit() int {
	initMu.Lock()
	defer initMu.Unlock()

	initialized = true

	return 0
}

func bridgeShutdown() {
	initMu.Lock()
	defer initMu.Unlock()

	if !initialized {
		return
	}

	initialized = false

	closeAllHandles()
}

// shutdownStep is what one handle registry gives back when closeAllHandles
// drains it. Every registry is drained first; then every cancel runs, then
// every wait, then every release, so no release blocks on work another
// registry has not stopped yet.
type shutdownStep struct {
	// cancel stops producers, so the waits below return.
	cancel func()
	// wait blocks until running work has finished.
	wait func()
	// release closes the resources behind the drained handles.
	release func()
}

// shutdownDrains holds one drain per handle registry. Each domain file adds its
// own from init(), so a build that leaves a domain out leaves out its drain too.
var shutdownDrains []func() shutdownStep

// registerShutdownDrain adds a drain to closeAllHandles. A drain snapshots its
// registry and clears it under the registry's lock, and returns the release
// work, which runs outside the lock: several release paths block (wg.Wait,
// process reap) and must not hold a registry mutex while they do.
func registerShutdownDrain(drain func() shutdownStep) {
	shutdownDrains = append(shutdownDrains, drain)
}

// closeAllHandles drains every handle registry and releases the resource behind
// each live handle.
//
// Handles are caller-owned during normal operation: every Create has a matching
// Close on the TypeScript side, and callers do release them. This is the
// backstop for a host that tears the library down without releasing everything
// first -- without it, child processes and PTY sessions survive shutdown.
func closeAllHandles() {
	steps := make([]shutdownStep, 0, len(shutdownDrains))
	for _, drain := range shutdownDrains {
		steps = append(steps, drain())
	}

	for _, step := range steps {
		if step.cancel != nil {
			step.cancel()
		}
	}

	for _, step := range steps {
		if step.wait != nil {
			step.wait()
		}
	}

	for _, step := range steps {
		if step.release != nil {
			step.release()
		}
	}
}

// bridgeDIResolve is a stub for future ajan bridge DI resolution.
func bridgeDIResolve(_ string) string {
	return "null"
}
