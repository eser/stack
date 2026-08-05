package noskillsserverfx

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// ACP session lifecycle: opening a session, and remembering which agent-side
// conversation it is so a later attach can resume it.

// openSession creates or loads the ACP session.
//
// When the caller names no session to resume, the one this session used last is
// tried. That is not second-guessing the caller: the daemon passes "" because
// it has no way to know the agent's own id, and continuity today is faked by
// replaying the ledger into a fresh agent that has never seen the conversation.
// An explicit resume from the caller still wins.
func (w *acpWorker) openSession(
	ctx context.Context,
	cwd, resume string,
) (*acpfx.Session, error) {
	if resume == "" {
		resume = w.rememberedAgentSession()
	}

	if resume != "" && w.client.AgentCapabilities().LoadSession {
		session, err := w.client.LoadSession(ctx, &acpfx.LoadSessionRequest{ //nolint:exhaustruct
			SessionID: resume,
			Cwd:       cwd,
		})
		if err == nil {
			return session, nil
		}

		// A resume that cannot be honoured must not lose the turn: fall through
		// to a fresh session, which is exactly what the SDK path always did.
		w.logger.Warn("acp session/load failed, starting fresh", "resume", resume, "err", err)
	}

	session, err := w.client.NewSession(ctx, &acpfx.NewSessionRequest{ //nolint:exhaustruct
		Cwd: cwd,
	})
	if err != nil {
		return nil, fmt.Errorf("acp session/new: %w", err)
	}

	return session, nil
}

// acpResumePath is where a session's agent-side id is remembered.
//
// Beside the ledger and keyed the same way, because (project root, session id)
// is exactly the identity of "which agent conversation is this".
//
// Returns "" for a session id that is not a safe filename component. The daemon
// takes sid straight off the request path (/attach/{slug}/{sid}), so it is
// attacker-influenced, and this path is joined and then written to. Rejecting
// here rather than sanitising keeps the check one comparison rather than an
// escaping scheme with its own edge cases.
func acpResumePath(dataDir, projectRoot, sid string) string {
	if !isSafeSessionID(sid) {
		return ""
	}

	return filepath.Join(sessionDir(dataDir, projectRoot), sid+".acp")
}

// isSafeSessionID reports whether sid may be used as a filename component.
//
// Session ids the daemon issues are ULIDs -- upper-case letters and digits --
// so this is not a restriction on anything legitimate. It is here because sid
// arrives from the network and ends up in a filesystem path.
func isSafeSessionID(sid string) bool {
	if sid == "" || len(sid) > maxSessionIDLen {
		return false
	}

	for _, char := range sid {
		switch {
		case char >= 'a' && char <= 'z',
			char >= 'A' && char <= 'Z',
			char >= '0' && char <= '9',
			char == '-', char == '_':
		default:
			return false
		}
	}

	return true
}

// maxSessionIDLen bounds a session id. A ULID is 26 characters; this leaves
// generous room without allowing a path component of unbounded length.
const maxSessionIDLen = 128

// rememberAgentSession records the agent's session id for a later resume.
//
// Failures are logged and swallowed: not being able to resume next time is a
// lost convenience, and refusing to run the session over it would trade a
// working agent for a bookkeeping problem.
func (w *acpWorker) rememberAgentSession(agentSessionID string) {
	if w.dataDir == "" || agentSessionID == "" {
		return
	}

	path := acpResumePath(w.dataDir, w.root, w.sessionID)
	if path == "" {
		w.logger.Warn("acp worker: unsafe session id, not remembering", "session", w.sessionID)

		return
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		w.logger.Warn("acp worker: cannot create session dir", "err", err)

		return
	}

	// #nosec G703 -- path is sessionDir(dataDir, root) joined with a session id
	// that isSafeSessionID has restricted to [A-Za-z0-9_-], so no component of
	// it can traverse.
	if err := os.WriteFile(path, []byte(agentSessionID), 0o600); err != nil {
		w.logger.Warn("acp worker: cannot remember agent session", "err", err)
	}
}

// rememberedAgentSession reads back what rememberAgentSession stored.
func (w *acpWorker) rememberedAgentSession() string {
	if w.dataDir == "" {
		return ""
	}

	path := acpResumePath(w.dataDir, w.root, w.sessionID)
	if path == "" {
		return ""
	}

	//nolint:gosec // path components are restricted by isSafeSessionID; see acpResumePath
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}

	return strings.TrimSpace(string(data))
}
