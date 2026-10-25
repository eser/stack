// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"time"
)

// Sessions bind one coding-tool instance to a spec or to free mode, so
// several instances can work on one project (persistence.ts Sessions and
// commands/session.ts). Each is .eser/.state/sessions/<id>.json, and the
// file name is its identity. The files are read as JSON values, so a
// rewrite keeps every field it does not change.

// sessionStaleAfter is STALE_THRESHOLD_MS.
const sessionStaleAfter = 2 * time.Hour

// SessionMode is the mode a session was started in.
type SessionMode = string

// The modes a session file holds. `session start --auto` resolves to one
// of them; the TypeScript CLI never writes an auto mode.
const (
	SessionModeFree SessionMode = "free"
	SessionModeSpec SessionMode = "spec"
)

// Session is the Session record of persistence.ts. Spec and Phase are nil
// for JSON null; ProjectRoot "" leaves the optional field out.
type Session struct {
	ID    string
	Spec  *string
	Mode  SessionMode
	Phase *string
	// Pid is the owning process, or 0 when none is known; `session start`
	// writes 0, as the process that runs it exits before the session is used.
	Pid          int
	StartedAt    string
	LastActiveAt string
	Tool         string
	ProjectRoot  string
}

// object is the session as the TypeScript CLI writes it, in its key order.
func (s *Session) object() *JSObject {
	o := JSObjectOf(
		"id", s.ID,
		"spec", stringOrNull(s.Spec),
		"mode", s.Mode,
		"phase", stringOrNull(s.Phase),
		"pid", float64(s.Pid),
		"startedAt", s.StartedAt,
		"lastActiveAt", s.LastActiveAt,
		"tool", s.Tool,
	)

	if s.ProjectRoot != "" {
		o.set("projectRoot", s.ProjectRoot)
	}

	return o
}

func stringOrNull(s *string) any {
	if s == nil {
		return nil
	}

	return *s
}

func stringPointer(o *JSObject, key string) *string {
	if value, ok := o.strOK(key); ok {
		return &value
	}

	return nil
}

func sessionOf(o *JSObject) Session {
	return Session{
		ID:           o.str("id"),
		Spec:         stringPointer(o, "spec"),
		Mode:         o.str("mode"),
		Phase:        stringPointer(o, "phase"),
		Pid:          int(o.num("pid")),
		StartedAt:    o.str("startedAt"),
		LastActiveAt: o.str("lastActiveAt"),
		Tool:         o.str("tool"),
		ProjectRoot:  o.str("projectRoot"),
	}
}

// GenerateSessionID is generateSessionId: 8 lowercase hex characters from
// a CSPRNG.
func GenerateSessionID() (string, error) {
	buf := make([]byte, 4)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate a session id: %w", err)
	}

	return fmt.Sprintf("%08x", buf), nil
}

// ErrInvalidSessionID is returned when a session id could name a path outside
// the sessions directory.
var ErrInvalidSessionID = errors.New("invalid session id")

// ValidSessionID is isValidSessionId: 1-64 characters from [A-Za-z0-9_-],
// so no '.', '/' or '\' can leave the sessions directory.
func ValidSessionID(id string) bool {
	return sessionIDPattern.MatchString(id)
}

func sessionPath(root, id string) string {
	return filepath.Join(root, sessionsDir, id+".json")
}

// CreateSession is createSession: it writes the session file, two-space
// JSON and a newline, atomically.
func CreateSession(root string, session *Session) error {
	if !ValidSessionID(session.ID) {
		return fmt.Errorf("create session %q: %w", session.ID, ErrInvalidSessionID)
	}

	if err := os.MkdirAll(filepath.Join(root, sessionsDir), 0o750); err != nil {
		return fmt.Errorf("create the sessions directory: %w", err)
	}

	if err := writeFileAtomic(sessionPath(root, session.ID), stateJSON(session.object()), stateFilePerm); err != nil {
		return fmt.Errorf("write session %s: %w", session.ID, err)
	}

	return nil
}

// ReadSession is readSession: the session of a valid id whose file parses
// and names the same id, or nil.
func ReadSession(root, sessionID string) *Session {
	o := ReadHookSession(root, sessionID)
	if o == nil {
		return nil
	}

	session := sessionOf(o)

	return &session
}

// ListSessions is listSessions: every session ListHookSessions reads, in
// name order.
func ListSessions(root string) []Session {
	objects := ListHookSessions(root)
	sessions := make([]Session, 0, len(objects))

	for _, o := range objects {
		sessions = append(sessions, sessionOf(o))
	}

	return sessions
}

// DeleteSession is deleteSession: false for an id that is not valid or a
// file that cannot be removed.
func DeleteSession(root, sessionID string) bool {
	if !ValidSessionID(sessionID) {
		return false
	}

	return os.Remove(sessionPath(root, sessionID)) == nil
}

// UpdateSessionPhase is updateSessionPhase: the session's phase and
// lastActiveAt change and every other field stays. A session that cannot
// be read is left alone.
func UpdateSessionPhase(root, sessionID, phase string, now time.Time) error {
	session := ReadHookSession(root, sessionID)
	if session == nil {
		return nil
	}

	updated := session.with("phase", phase, "lastActiveAt", ISOTime(now))

	if err := writeFileAtomic(sessionPath(root, sessionID), stateJSON(updated), stateFilePerm); err != nil {
		return fmt.Errorf("update session %s: %w", sessionID, err)
	}

	return nil
}

// sessionIdleMs is sessionIdleMs: the milliseconds from lastActiveAt to
// now, and false when the file holds no readable time there (a value that
// is not a string, or a string that is not a date).
func sessionIdleMs(session *JSObject, now time.Time) (float64, bool) {
	value, ok := session.strOK("lastActiveAt")
	if !ok {
		return 0, false
	}

	t, ok := parseISODate(value)
	if !ok {
		return 0, false
	}

	return float64(now.UnixMilli() - t.UnixMilli()), true
}

// sessionObjectStale is isSessionStale: idle for more than two hours, or
// with no readable lastActiveAt, so gc removes it.
func sessionObjectStale(session *JSObject, now time.Time) bool {
	idle, ok := sessionIdleMs(session, now)

	return !ok || idle > float64(sessionStaleAfter.Milliseconds())
}

// IsSessionStale is isSessionStale: more than two hours since
// LastActiveAt at now, or a LastActiveAt that is not a date.
func IsSessionStale(session *Session, now time.Time) bool {
	return sessionObjectStale(session.object(), now)
}

// GcStaleSessions is gcStaleSessions: it deletes the stale sessions and
// returns their ids, in name order.
func GcStaleSessions(root string, now time.Time) []string {
	removed := []string{}

	for _, session := range ListHookSessions(root) {
		if !sessionObjectStale(session, now) {
			continue
		}

		id := session.str("id")
		DeleteSession(root, id)

		removed = append(removed, id)
	}

	return removed
}

// SessionLine is one row of `session list`.
type SessionLine struct {
	ID string
	// Mode is "free", or "spec:" and the spec ("?" for none).
	Mode string
	// Phase is the phase, or an em dash for none.
	Phase string
	// Age is "<n>min ago" under an hour, "<n>h ago" otherwise, and
	// "unknown" for a session with no readable time.
	Age   string
	Stale bool
}

// SessionLines are the rows of `session list`, in name order.
func SessionLines(root string, now time.Time) []SessionLine {
	sessions := ListHookSessions(root)
	lines := make([]SessionLine, 0, len(sessions))

	for _, session := range sessions {
		mode := "free"
		if session.str("mode") != SessionModeFree {
			mode = "spec:?"
			if !session.isNullish("spec") {
				mode = "spec:" + jsString(session.getOr("spec"))
			}
		}

		phase := "—"
		if !session.isNullish("phase") {
			phase = jsString(session.getOr("phase"))
		}

		lines = append(lines, SessionLine{
			ID:    session.str("id"),
			Mode:  mode,
			Phase: phase,
			Age:   sessionAgeLabel(sessionIdleMs(session, now)),
			Stale: sessionObjectStale(session, now),
		})
	}

	return lines
}

// sessionAgeLabel is idleLabel, the list's time label for an idle time in
// milliseconds.
func sessionAgeLabel(idleMs float64, readable bool) string {
	if !readable {
		return "unknown"
	}

	mins := math.Floor(idleMs / 60000)
	if mins < 60 {
		return jsNumberString(mins) + "min ago"
	}

	return jsNumberString(math.Floor(mins/60)) + "h ago"
}
