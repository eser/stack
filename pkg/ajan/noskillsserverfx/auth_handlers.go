package noskillsserverfx

import (
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
)

// ── Auth REST handlers ─────────────────────────────────────────────────────────

// POST /auth/setup — first-run only. Stores a hashed PIN.
// After setup, all protected routes require a Bearer token from /auth/login.

type setupPINRequest struct {
	PIN string `json:"pin"`
}

type setupPINResponse struct {
	OK bool `json:"ok"`
}

func (s *Server) handleSetupPIN(ctx *httpfx.Context) httpfx.Result {
	var req setupPINRequest
	if err := ctx.ParseJSONBody(&req); err != nil {
		return ctx.Results.BadRequest(httpfx.WithPlainText("invalid JSON body"))
	}

	if req.PIN == "" {
		return ctx.Results.BadRequest(httpfx.WithPlainText("pin is required"))
	}

	if err := s.authManager.SetupPIN(req.PIN); err != nil {
		return ctx.Results.Error(http.StatusConflict, httpfx.WithPlainText(err.Error()))
	}

	return ctx.Results.JSON(&setupPINResponse{OK: true})
}

// POST /auth/login — verifies PIN (rate-limited per IP) and issues a token.

type loginRequest struct {
	PIN string `json:"pin"`
}

type loginResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func (s *Server) handleLogin(ctx *httpfx.Context) httpfx.Result {
	var req loginRequest
	if err := ctx.ParseJSONBody(&req); err != nil {
		return ctx.Results.BadRequest(httpfx.WithPlainText("invalid JSON body"))
	}

	ip := resolveClientIP(ctx)

	tok, err := s.authManager.Login(ip, req.PIN)
	if err != nil {
		return ctx.Results.Unauthorized(httpfx.WithPlainText(err.Error()))
	}

	return ctx.Results.JSON(&loginResponse{
		Token:     tok.Value,
		ExpiresAt: tok.ExpiresAt,
	})
}

// POST /auth/logout — removes the token from the active store.

type logoutResponse struct {
	OK bool `json:"ok"`
}

func (s *Server) handleLogout(ctx *httpfx.Context) httpfx.Result {
	// Accept token from body OR Authorization header so CLI clients don't have
	// to re-encode the token as JSON.
	token := ctx.Request.URL.Query().Get("token")

	if token == "" {
		for _, h := range ctx.Request.Header["Authorization"] {
			if after, ok := strings.CutPrefix(h, "Bearer "); ok {
				token = after

				break
			}
		}
	}

	if token == "" {
		return ctx.Results.BadRequest(httpfx.WithPlainText("token is required"))
	}

	if err := s.authManager.Logout(token); err != nil {
		return ctx.Results.Error(http.StatusInternalServerError, httpfx.WithSanitizedError(err))
	}

	return ctx.Results.JSON(&logoutResponse{OK: true})
}

// resolveClientIP extracts the real client IP for rate-limiting.
// Prefers X-Forwarded-For and X-Real-IP over RemoteAddr (which may be a proxy).
func resolveClientIP(ctx *httpfx.Context) string {
	if xff := ctx.Request.Header.Get("X-Forwarded-For"); xff != "" {
		if idx := strings.Index(xff, ","); idx != -1 {
			return strings.TrimSpace(xff[:idx])
		}

		return strings.TrimSpace(xff)
	}

	if xri := ctx.Request.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}

	host, _, err := net.SplitHostPort(ctx.Request.RemoteAddr)
	if err != nil {
		return ctx.Request.RemoteAddr
	}

	return host
}
