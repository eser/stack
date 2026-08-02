// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

// =============================================================================
// Session type
// =============================================================================

const sessionStaleDuration = 2 * time.Hour

// SessionMode is the mode in which a session was started.
type SessionMode = string

const (
	SessionModeFree SessionMode = "free"
	SessionModeSpec SessionMode = "spec"
	SessionModeAuto SessionMode = "auto"
)

// Session represents a running agent session bound to a spec (or free-running).
type Session struct {
	ID           string  `json:"id"`
	Spec         *string `json:"spec,omitempty"`
	Phase        string  `json:"phase"`
	Mode         string  `json:"mode"` // SessionMode
	LastActiveAt string  `json:"lastActiveAt"`
	ProjectRoot  *string `json:"projectRoot,omitempty"`
	Tool         string  `json:"tool"`
}

// =============================================================================
// Session ID generation
// =============================================================================

// GenerateSessionID returns an 8-character lowercase hex string using
// cryptographically random bytes — matches generateSessionId() in persistence.ts.
func GenerateSessionID() (string, error) {
	buf := make([]byte, 4)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generateSessionID: %w", err)
	}

	return fmt.Sprintf("%08x", buf), nil
}

// =============================================================================
// Session staleness
// =============================================================================

// IsSessionStale reports whether more than 2 hours have passed since
// session.LastActiveAt (mirrors isSessionStale() in persistence.ts).
func IsSessionStale(session Session) bool {
	last, err := time.Parse(time.RFC3339, session.LastActiveAt)
	if err != nil {
		return true // unparseable timestamps are treated as stale
	}

	return time.Since(last) > sessionStaleDuration
}

// =============================================================================
// Session CRUD
// =============================================================================

// CreateSession writes session to .eser/.state/sessions/<id>.json.
func CreateSession(root string, session Session) error {
	p := NewPaths(root)

	if err := os.MkdirAll(p.SessionsDir, 0o750); err != nil {
		return fmt.Errorf("createSession: mkdir: %w", err)
	}

	data, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return fmt.Errorf("createSession: marshal: %w", err)
	}

	path := p.SessionFile(session.ID)

	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil { //nolint:gosec
		return fmt.Errorf("createSession: write: %w", err)
	}

	return nil
}

// ReadSession reads a session by ID. Returns nil, nil when the file does not exist.
func ReadSession(root, sessionID string) (*Session, error) {
	p := NewPaths(root)
	data, err := os.ReadFile(p.SessionFile(sessionID))

	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}

		return nil, fmt.Errorf("readSession %s: %w", sessionID, err)
	}

	var s Session
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("readSession %s: parse: %w", sessionID, err)
	}

	return &s, nil
}

// ListSessions returns all sessions stored in the sessions directory.
// Corrupt files are silently skipped.
func ListSessions(root string) ([]Session, error) {
	p := NewPaths(root)
	entries, err := os.ReadDir(p.SessionsDir)

	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Session{}, nil
		}

		return nil, fmt.Errorf("listSessions: %w", err)
	}

	sessions := make([]Session, 0, len(entries))

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}

		id := strings.TrimSuffix(e.Name(), ".json")

		s, err := ReadSession(root, id)
		if err != nil || s == nil {
			continue // skip corrupt or missing files
		}

		sessions = append(sessions, *s)
	}

	return sessions, nil
}

// DeleteSession removes a session file. Returns false when the file does not exist.
func DeleteSession(root, sessionID string) (bool, error) {
	p := NewPaths(root)
	err := os.Remove(p.SessionFile(sessionID))

	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}

		return false, fmt.Errorf("deleteSession %s: %w", sessionID, err)
	}

	return true, nil
}

// UpdateSessionPhase reads the session, updates Phase and LastActiveAt, and
// writes it back. No-ops silently if the session does not exist.
func UpdateSessionPhase(root, sessionID, phase string) error {
	s, err := ReadSession(root, sessionID)
	if err != nil {
		return err
	}

	if s == nil {
		return nil
	}

	s.Phase = phase
	s.LastActiveAt = time.Now().UTC().Format(time.RFC3339)

	return CreateSession(root, *s)
}

// GcStaleSessions removes all sessions whose LastActiveAt is older than 2 hours.
// Returns the IDs of removed sessions.
func GcStaleSessions(root string) ([]string, error) {
	sessions, err := ListSessions(root)
	if err != nil {
		return nil, err
	}

	removed := make([]string, 0)

	for _, s := range sessions {
		if !IsSessionStale(s) {
			continue
		}

		if _, delErr := DeleteSession(root, s.ID); delErr != nil {
			return removed, delErr
		}

		removed = append(removed, s.ID)
	}

	return removed, nil
}
