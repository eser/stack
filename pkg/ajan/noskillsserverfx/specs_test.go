// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// specsServer is a Server with one registered project, "demo", at a fresh
// directory, and no PIN, so the routes answer without a token.
func specsServer(t *testing.T) (*Server, string) {
	t.Helper()

	project := t.TempDir()
	srv := New(&ServerConfig{DataDir: t.TempDir(), SelfSigned: true}, logfx.NewLogger()) //nolint:exhaustruct

	require.NoError(t, srv.saveDaemonState(DaemonState{Projects: map[string]string{"demo": project}}))

	return srv, project
}

func specCall(t *testing.T, srv *Server, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()

	recorder := httptest.NewRecorder()
	srv.Router().GetMux().ServeHTTP(recorder,
		httptest.NewRequestWithContext(t.Context(), method, path, strings.NewReader(body)))

	return recorder
}

// The spec endpoints run the noskillsfx lifecycle commands, so a spec made
// through them has the files and phases the noskills CLI gives it.
func TestSpecEndpointsRunTheLifecycle(t *testing.T) {
	t.Parallel()

	srv, project := specsServer(t)

	created := specCall(t, srv, http.MethodPost, "/api/projects/demo/specs",
		`{"description":"Add a settings page","name":"settings-page"}`)
	require.Equal(t, http.StatusOK, created.Code, created.Body.String())
	assert.JSONEq(t, `{"name":"settings-page","phase":"DISCOVERY"}`, created.Body.String())

	// The first spec initializes noskills; the global state stays IDLE and
	// the spec's own state is in DISCOVERY, as `noskills spec new` leaves them.
	phase, _ := noskillsfx.ReadHookState(project, nil).Get("phase")
	assert.Equal(t, noskillsfx.PhaseIdle, phase)
	assert.FileExists(t, filepath.Join(project, ".eser", "specs", "settings-page", "spec.md"))

	listed := specCall(t, srv, http.MethodGet, "/api/projects/demo/specs", "")
	require.Equal(t, http.StatusOK, listed.Code)
	assert.JSONEq(t, `[{"name":"settings-page","phase":"DISCOVERY"}]`, listed.Body.String())

	next := specCall(t, srv, http.MethodPost, "/api/projects/demo/specs/settings-page/next", "")
	require.Equal(t, http.StatusOK, next.Code, next.Body.String())

	var instruction map[string]any

	require.NoError(t, json.Unmarshal(next.Body.Bytes(), &instruction))
	assert.Equal(t, "DISCOVERY", instruction["phase"])

	mode := specCall(t, srv, http.MethodPost, "/api/projects/demo/specs/settings-page/next", `{"answer":"full"}`)
	require.Equal(t, http.StatusOK, mode.Code, mode.Body.String())

	premises := specCall(t, srv, http.MethodPost, "/api/projects/demo/specs/settings-page/next",
		`{"answer":"{\"premises\":[{\"text\":\"Users change settings today by email\",\"agreed\":true}]}"}`)
	require.Equal(t, http.StatusOK, premises.Code, premises.Body.String())

	// A discovery answer under 20 characters is refused, as the CLI refuses it.
	short := specCall(t, srv, http.MethodPost, "/api/projects/demo/specs/settings-page/next", `{"answer":"too short"}`)
	assert.Equal(t, http.StatusUnprocessableEntity, short.Code, short.Body.String())

	approve := specCall(t, srv, http.MethodPost, "/api/projects/demo/specs/settings-page/approve", "")
	assert.Equal(t, http.StatusConflict, approve.Code, approve.Body.String())

	// block, like `noskills block`, works only while executing.
	blocked := specCall(t, srv, http.MethodPost, "/api/projects/demo/specs/settings-page/block", `{"reason":"waiting on design"}`)
	assert.Equal(t, http.StatusConflict, blocked.Code, blocked.Body.String())
	assert.JSONEq(t, `{"error":"Cannot block in phase: DISCOVERY"}`, blocked.Body.String())
}

func TestSpecEndpointsRefuse(t *testing.T) {
	t.Parallel()

	srv, project := specsServer(t)

	tests := []struct {
		name, method, path, body string
		status                   int
	}{
		{"unknown project", http.MethodGet, "/api/projects/nope/specs", "", http.StatusNotFound},
		{"no description", http.MethodPost, "/api/projects/demo/specs", `{"name":"x"}`, http.StatusBadRequest},
		{"reserved name", http.MethodPost, "/api/projects/demo/specs", `{"description":"d","name":"list"}`, http.StatusConflict},
		{"unknown spec", http.MethodPost, "/api/projects/demo/specs/missing/next", "", http.StatusNotFound},
		{"unknown action", http.MethodPost, "/api/projects/demo/specs/missing/explode", "", http.StatusBadRequest},
	}

	for _, tt := range tests {
		got := specCall(t, srv, tt.method, tt.path, tt.body)
		assert.Equal(t, tt.status, got.Code, "%s: %s", tt.name, got.Body.String())
	}

	// A refused name leaves no spec directory behind.
	_, err := os.Stat(filepath.Join(project, ".eser", "specs", "list"))
	assert.True(t, os.IsNotExist(err))
}
