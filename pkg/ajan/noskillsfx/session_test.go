// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx_test

import (
	"regexp"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

func TestGenerateSessionID(t *testing.T) {
	t.Parallel()

	reHex := regexp.MustCompile(`^[0-9a-f]{8}$`)

	t.Run("returns 8-char lowercase hex", func(t *testing.T) {
		t.Parallel()
		id, err := noskillsfx.GenerateSessionID()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !reHex.MatchString(id) {
			t.Errorf("GenerateSessionID() = %q, want 8 lowercase hex chars", id)
		}
	})

	t.Run("generates unique IDs", func(t *testing.T) {
		t.Parallel()
		seen := make(map[string]bool, 20)
		for range 20 {
			id, err := noskillsfx.GenerateSessionID()
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if seen[id] {
				t.Errorf("duplicate session ID generated: %q", id)
			}
			seen[id] = true
		}
	})
}

func TestIsSessionStale(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name         string
		lastActiveAt string
		expected     bool
	}{
		{
			name:         "fresh session (1 hour ago) is not stale",
			lastActiveAt: time.Now().Add(-1 * time.Hour).UTC().Format(time.RFC3339),
			expected:     false,
		},
		{
			name:         "stale session (3 hours ago) is stale",
			lastActiveAt: time.Now().Add(-3 * time.Hour).UTC().Format(time.RFC3339),
			expected:     true,
		},
		{
			name:         "exactly 2 hours ago is stale (boundary inclusive)",
			lastActiveAt: time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339),
			expected:     true,
		},
		{
			name:         "unparseable timestamp is treated as stale",
			lastActiveAt: "not-a-date",
			expected:     true,
		},
		{
			name:         "empty timestamp is treated as stale",
			lastActiveAt: "",
			expected:     true,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			session := noskillsfx.Session{ //nolint:exhaustruct
				ID:           "test",
				LastActiveAt: tc.lastActiveAt,
			}
			got := noskillsfx.IsSessionStale(session)
			if got != tc.expected {
				t.Errorf("IsSessionStale() = %v, want %v (lastActiveAt=%q)", got, tc.expected, tc.lastActiveAt)
			}
		})
	}
}
