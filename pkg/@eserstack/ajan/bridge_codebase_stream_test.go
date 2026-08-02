// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"encoding/json"
	"testing"
)

// handleResp is the shared wire type for stream create responses.
type handleResp struct {
	Handle string `json:"handle"`
	Error  string `json:"error"`
}

func parseHandle(t *testing.T, raw string) string {
	t.Helper()

	var resp handleResp
	if err := json.Unmarshal([]byte(raw), &resp); err != nil {
		t.Fatalf("parseHandle: unmarshal error: %v (raw=%q)", err, raw)
	}

	if resp.Error != "" {
		t.Fatalf("parseHandle: bridge returned error: %s", resp.Error)
	}

	if resp.Handle == "" {
		t.Fatalf("parseHandle: empty handle (raw=%q)", raw)
	}

	return resp.Handle
}

// TestCodebaseWalkStreamDrainNoLeak verifies that fully draining 1000 walk
// streams leaves zero handles in the map.
func TestCodebaseWalkStreamDrainNoLeak(t *testing.T) {
	const iterations = 1000

	for range iterations {
		raw := bridgeCodebaseWalkFilesStreamCreate(`{"dir":".", "gitAware":false}`)
		handle := parseHandle(t, raw)

		for {
			item := bridgeCodebaseWalkFilesStreamRead(handle)
			if item == "null" {
				break
			}
		}
	}

	codebaseWalkStreamMu.RLock()
	n := len(codebaseWalkStreamHandles)
	codebaseWalkStreamMu.RUnlock()

	if n != 0 {
		t.Errorf("walk stream drain: leaked %d handle(s) after %d iterations", n, iterations)
	}
}

// TestCodebaseWalkStreamCloseNoLeak verifies that force-closing 1000 walk
// streams leaves zero handles in the map.
func TestCodebaseWalkStreamCloseNoLeak(t *testing.T) {
	const iterations = 1000

	for range iterations {
		raw := bridgeCodebaseWalkFilesStreamCreate(`{"dir":".", "gitAware":false}`)
		handle := parseHandle(t, raw)
		bridgeCodebaseWalkFilesStreamClose(handle)
	}

	codebaseWalkStreamMu.RLock()
	n := len(codebaseWalkStreamHandles)
	codebaseWalkStreamMu.RUnlock()

	if n != 0 {
		t.Errorf("walk stream close: leaked %d handle(s) after %d iterations", n, iterations)
	}
}

// TestCodebaseValidateStreamDrainNoLeak verifies that fully draining 1000
// validate streams leaves zero handles in the map.
// Scoped to "eof" and "bom" validators to avoid expensive regex validators
// (e.g. secrets) that can stack-overflow on large files in this package.
func TestCodebaseValidateStreamDrainNoLeak(t *testing.T) {
	const iterations = 1000

	for range iterations {
		raw := bridgeCodebaseValidateFilesStreamCreate(
			`{"dir":".", "validators":["eof","bom"], "gitAware":false}`,
		)
		handle := parseHandle(t, raw)

		for {
			item := bridgeCodebaseValidateFilesStreamRead(handle)
			if item == "null" {
				break
			}
		}
	}

	codebaseValidateStreamMu.RLock()
	n := len(codebaseValidateStreamHandles)
	codebaseValidateStreamMu.RUnlock()

	if n != 0 {
		t.Errorf("validate stream drain: leaked %d handle(s) after %d iterations", n, iterations)
	}
}

// TestCodebaseValidateStreamCloseNoLeak verifies that force-closing 1000
// validate streams leaves zero handles in the map.
// Scoped to "eof" and "bom" validators to avoid expensive regex validators
// (e.g. secrets) that can stack-overflow on large files in this package.
func TestCodebaseValidateStreamCloseNoLeak(t *testing.T) {
	const iterations = 1000

	for range iterations {
		raw := bridgeCodebaseValidateFilesStreamCreate(
			`{"dir":".", "validators":["eof","bom"], "gitAware":false}`,
		)
		handle := parseHandle(t, raw)
		bridgeCodebaseValidateFilesStreamClose(handle)
	}

	codebaseValidateStreamMu.RLock()
	n := len(codebaseValidateStreamHandles)
	codebaseValidateStreamMu.RUnlock()

	if n != 0 {
		t.Errorf("validate stream close: leaked %d handle(s) after %d iterations", n, iterations)
	}
}
