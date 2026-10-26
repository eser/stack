// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build windows || wasip1

package tui

import "context"

// startSIGWINCH is a no-op on Windows and WASM — SIGWINCH is not available.
func (kr *KeypressReader) startSIGWINCH(_ context.Context) {}
