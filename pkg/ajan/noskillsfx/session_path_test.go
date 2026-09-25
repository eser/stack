// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx_test

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

func TestValidSessionID(t *testing.T) {
	t.Parallel()

	for _, id := range []string{"a1b2c3d4", "session-a", "s_1"} {
		if !noskillsfx.ValidSessionID(id) {
			t.Errorf("ValidSessionID(%q) = false, want true", id)
		}
	}

	for _, id := range []string{"", "../victim", "a/b", `a\b`, "a.b", "..", string(make([]byte, 65))} {
		if noskillsfx.ValidSessionID(id) {
			t.Errorf("ValidSessionID(%q) = true, want false", id)
		}
	}
}

func TestGcStaleSessionsNeverDeletesOutsideSessionsDir(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	victim := filepath.Join(root, "victim.json")

	if err := os.WriteFile(victim, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}

	sessionsDir := noskillsfx.NewPaths(root).SessionsDir
	if err := os.MkdirAll(sessionsDir, 0o750); err != nil {
		t.Fatal(err)
	}

	planted := `{"id":"../../../victim","lastActiveAt":"2000-01-01T00:00:00Z","mode":"free","phase":"","tool":"x"}`
	if err := os.WriteFile(filepath.Join(sessionsDir, "planted.json"), []byte(planted), 0o600); err != nil {
		t.Fatal(err)
	}

	if _, err := noskillsfx.GcStaleSessions(root); err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(victim); err != nil {
		t.Fatalf("victim file was removed: %v", err)
	}

	if _, err := noskillsfx.DeleteSession(root, "../../../victim"); !errors.Is(err, noskillsfx.ErrInvalidSessionID) {
		t.Fatalf("DeleteSession traversal err = %v, want ErrInvalidSessionID", err)
	}

	if err := noskillsfx.CreateSession(root, noskillsfx.Session{ID: "../x"}); !errors.Is(err, noskillsfx.ErrInvalidSessionID) {
		t.Fatalf("CreateSession traversal err = %v, want ErrInvalidSessionID", err)
	}
}
