package noskillsserverfx

import (
	"crypto/rand"
	"fmt"
	"net/http"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/oklog/ulid/v2"
)

// ── Session REST handlers ─────────────────────────────────────────────────────

type sessionSummary struct {
	SID  string `json:"sid"`
	Slug string `json:"slug"`
	Root string `json:"root"`
}

type listSessionsResponse struct {
	Sessions []sessionSummary `json:"sessions"`
}

func (s *Server) handleListSessions(ctx *httpfx.Context) httpfx.Result {
	slug := ctx.Request.PathValue("slug")

	if _, ok := s.projectPath(slug); !ok {
		return ctx.Results.Error(
			http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("project %q not found", slug)), //nolint:err113
		)
	}

	entries := s.sessions.ListBySlug(slug)
	result := make([]sessionSummary, 0, len(entries))

	for _, entry := range entries {
		result = append(result, sessionSummary{
			SID:  entry.SID,
			Slug: entry.Slug,
			Root: entry.Root,
		})
	}

	return ctx.Results.JSON(&listSessionsResponse{Sessions: result})
}

type createSessionRequest struct {
	ResumeFrom string `json:"resumeFrom,omitempty"`
	// Kind selects the worker flavour the client will attach with: "agent"
	// (default, served by the ACP worker; "acp" is an accepted synonym) or "mux"
	// (terminal multiplexer). The daemon stores no per-session state here, so the
	// client must pass the same kind as ?kind= on /attach; it is echoed back for
	// convenience.
	Kind string `json:"kind,omitempty"`
}

type createSessionResponse struct {
	SessionID string `json:"sessionId"`
	Kind      string `json:"kind,omitempty"`
}

func (s *Server) handleCreateSession(ctx *httpfx.Context) httpfx.Result {
	slug := ctx.Request.PathValue("slug")

	if _, ok := s.projectPath(slug); !ok {
		return ctx.Results.Error(
			http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("project %q not found", slug)), //nolint:err113
		)
	}

	var req createSessionRequest

	_ = ctx.ParseJSONBody(&req)

	sid := req.ResumeFrom
	if sid == "" {
		sid = newSessionID()
	}

	// Record the worker flavour now so the worker spawned on first attach matches,
	// independent of the attach query string.
	s.sessions.RecordKind(slug, sid, req.Kind)

	return ctx.Results.JSON(&createSessionResponse{SessionID: sid, Kind: req.Kind})
}

// newSessionID generates a ULID-based session ID.
func newSessionID() string {
	return ulid.MustNew(ulid.Now(), rand.Reader).String()
}
