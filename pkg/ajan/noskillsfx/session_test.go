// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx_test

import (
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

func TestGenerateSessionID(t *testing.T) {
	t.Parallel()

	reHex := regexp.MustCompile(`^[0-9a-f]{8}$`)
	seen := make(map[string]bool, 20)

	for range 20 {
		id, err := noskillsfx.GenerateSessionID()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if !reHex.MatchString(id) {
			t.Errorf("GenerateSessionID() = %q, want 8 lowercase hex chars", id)
		}

		if seen[id] {
			t.Errorf("duplicate session ID generated: %q", id)
		}

		seen[id] = true
	}
}

func TestIsSessionStale(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	iso := func(d time.Duration) string { return now.Add(-d).Format("2006-01-02T15:04:05.000Z") }

	cases := []struct {
		name         string
		lastActiveAt string
		want         bool
	}{
		{name: "one hour ago", lastActiveAt: iso(time.Hour), want: false},
		{name: "three hours ago", lastActiveAt: iso(3 * time.Hour), want: true},
		{name: "exactly two hours ago", lastActiveAt: iso(2 * time.Hour), want: false},
		{name: "just over two hours ago", lastActiveAt: iso(2*time.Hour + time.Millisecond), want: true},
		// A session with no readable time is stale, so gc removes it.
		{name: "not a date", lastActiveAt: "not-a-date", want: true},
		{name: "empty", lastActiveAt: "", want: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			session := &noskillsfx.Session{ID: "test", LastActiveAt: tc.lastActiveAt} //nolint:exhaustruct // only the time matters
			if got := noskillsfx.IsSessionStale(session, now); got != tc.want {
				t.Errorf("IsSessionStale(%q) = %v, want %v", tc.lastActiveAt, got, tc.want)
			}
		})
	}
}

func writeSessionFile(t *testing.T, root, name, content string) {
	t.Helper()

	dir := filepath.Join(root, ".eser", ".state", "sessions")
	if err := os.MkdirAll(dir, 0o750); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func readSessionFile(t *testing.T, root, id string) string {
	t.Helper()

	data, err := os.ReadFile(filepath.Join(root, ".eser", ".state", "sessions", id+".json")) //nolint:gosec // G304: the test's own temp dir
	if err != nil {
		t.Fatal(err)
	}

	return string(data)
}

func TestCreateSessionWritesTheTypeScriptRecord(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	session := &noskillsfx.Session{
		ID: "a1b2c3d4", Spec: nil, Mode: noskillsfx.SessionModeFree, Phase: nil, Pid: 0,
		StartedAt: "2026-01-01T00:00:00.000Z", LastActiveAt: "2026-01-01T00:00:00.000Z",
		Tool: "claude-code", ProjectRoot: "/work/<project>",
	}

	if err := noskillsfx.CreateSession(root, session); err != nil {
		t.Fatal(err)
	}

	want := `{
  "id": "a1b2c3d4",
  "spec": null,
  "mode": "free",
  "phase": null,
  "pid": 0,
  "startedAt": "2026-01-01T00:00:00.000Z",
  "lastActiveAt": "2026-01-01T00:00:00.000Z",
  "tool": "claude-code",
  "projectRoot": "/work/<project>"
}
`
	if got := readSessionFile(t, root, "a1b2c3d4"); got != want {
		t.Errorf("session file:\n%s\nwant:\n%s", got, want)
	}

	read := noskillsfx.ReadSession(root, "a1b2c3d4")
	if read == nil || read.Spec != nil || read.Phase != nil || read.ProjectRoot != "/work/<project>" {
		t.Errorf("ReadSession = %+v", read)
	}
}

func TestUpdateSessionPhaseKeepsTheOtherFields(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeSessionFile(t, root, "s1.json", `{"id":"s1","spec":"x","mode":"spec","phase":"DISCOVERY","pid":4242,`+
		`"startedAt":"2020-01-01T00:00:00.000Z","lastActiveAt":"2020-01-01T00:00:00.000Z","tool":"kiro","extra":true}`)

	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	if err := noskillsfx.UpdateSessionPhase(root, "s1", "EXECUTING", now); err != nil {
		t.Fatal(err)
	}

	want := `{
  "id": "s1",
  "spec": "x",
  "mode": "spec",
  "phase": "EXECUTING",
  "pid": 4242,
  "startedAt": "2020-01-01T00:00:00.000Z",
  "lastActiveAt": "2026-01-01T00:00:00.000Z",
  "tool": "kiro",
  "extra": true
}
`
	if got := readSessionFile(t, root, "s1"); got != want {
		t.Errorf("session file:\n%s\nwant:\n%s", got, want)
	}

	if err := noskillsfx.UpdateSessionPhase(root, "missing", "EXECUTING", now); err != nil {
		t.Errorf("a missing session: %v", err)
	}
}

func TestSessionLinesAndGc(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

	writeSessionFile(t, root, "a.json", `{"id":"a","spec":"login","mode":"spec","phase":"EXECUTING","lastActiveAt":"2026-01-01T11:55:00.000Z"}`)
	writeSessionFile(t, root, "b.json", `{"id":"b","spec":null,"mode":"free","phase":null,"lastActiveAt":"2026-01-01T08:30:00.000Z"}`)
	writeSessionFile(t, root, "c.json", `{"id":"c","mode":"spec","lastActiveAt":"garbage"}`)
	writeSessionFile(t, root, "d.json", `{"id":"d","mode":"spec","spec":null,"lastActiveAt":null}`)
	writeSessionFile(t, root, "e.json", `{"id":"other","mode":"free"}`)
	writeSessionFile(t, root, "f.json", `not json`)

	want := []noskillsfx.SessionLine{
		{ID: "a", Mode: "spec:login", Phase: "EXECUTING", Age: "5min ago", Stale: false},
		{ID: "b", Mode: "free", Phase: "—", Age: "3h ago", Stale: true},
		// No readable time, from a text and from null (which once read as
		// the epoch): unknown, and stale.
		{ID: "c", Mode: "spec:?", Phase: "—", Age: "unknown", Stale: true},
		{ID: "d", Mode: "spec:?", Phase: "—", Age: "unknown", Stale: true},
	}

	if got := noskillsfx.SessionLines(root, now); !slices.Equal(got, want) {
		t.Errorf("SessionLines =\n%+v\nwant\n%+v", got, want)
	}

	if removed := noskillsfx.GcStaleSessions(root, now); !slices.Equal(removed, []string{"b", "c", "d"}) {
		t.Errorf("GcStaleSessions = %v, want [b c d]", removed)
	}

	sessions := noskillsfx.ListSessions(root)
	ids := make([]string, 0, len(sessions))

	for _, s := range sessions {
		ids = append(ids, s.ID)
	}

	if !slices.Equal(ids, []string{"a"}) {
		t.Errorf("sessions after gc = %v, want [a]", ids)
	}
}
