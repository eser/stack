// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build wasip1

package pty

import (
	"context"
	"errors"
)

// errUnsupported is returned by every operation on platforms without a PTY
// (WASM / command mode). The TypeScript side treats a spawn error as "FFI PTY
// unavailable" and falls back to the script-based implementation.
var errUnsupported = errors.New("pty not supported on this platform")

type platform struct{}

func platformSpawn(_ context.Context, _ SpawnOptions) (*platform, error) {
	return nil, errUnsupported
}

func platformRead(_ *platform, _ []byte) (int, error) { return 0, errUnsupported }

func platformWrite(_ *platform, _ []byte) (int, error) { return 0, errUnsupported }

func platformResize(_ *platform, _, _ int) error { return errUnsupported }

func platformKill(_ *platform, _ string) error { return errUnsupported }

func platformWaitProcess(_ *platform) int { return -1 }

func platformAfterExit(_ *platform) {}

func platformPid(_ *platform) int { return -1 }

func platformCleanup(_ *platform) {}
