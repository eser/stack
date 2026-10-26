// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The route tests of the TypeScript server.test.ts and server-log.test.ts.

var requestIDPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`) //nolint:gochecknoglobals // test fixture

func TestGetStateAnswersTheDashboardState(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)

	empty := decode(t, f.call(t, http.MethodGet, "/api/state", "", nil))
	assert.Equal(t, []any{}, empty["specs"])
	assert.Contains(t, empty, "currentUser")
	assert.Contains(t, empty, "recentEvents")

	writeSpecState(t, f.root, "test-web", noskillsfx.PhaseDiscovery)

	recorder := f.call(t, http.MethodGet, "/api/state", "", nil)
	assert.Equal(t, contentTypeJSON, recorder.Header().Get("Content-Type"))

	specs, _ := decode(t, recorder)["specs"].([]any)
	require.Len(t, specs, 1)

	spec, _ := specs[0].(map[string]any)
	assert.Equal(t, "test-web", spec["name"])
}

func TestDashboardPageListsTheSpecs(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)
	writeSpecState(t, f.root, "listed", noskillsfx.PhaseDiscovery)

	recorder := f.call(t, http.MethodGet, "/", "", nil)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "<!DOCTYPE html>")
	assert.Contains(t, recorder.Body.String(), "Specs")
	assert.Contains(t, recorder.Body.String(), `href="/spec/listed"`)
}

func TestSpecPage(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)
	writeSpecState(t, f.root, "detail-test", noskillsfx.PhaseDiscovery)
	require.NoError(t, os.WriteFile(filepath.Join(f.root, ".eser", "specs", "detail-test", "spec.md"),
		[]byte("# detail-test\n\nBody <text>\n"), 0o600))

	recorder := f.call(t, http.MethodGet, "/spec/detail-test", "", nil)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "detail-test")
	assert.Contains(t, recorder.Body.String(), "Test spec for detail-test")
	assert.Contains(t, recorder.Body.String(), "Body &lt;text&gt;")
	// The spec page carries the token too, so its buttons work.
	assert.Contains(t, recorder.Body.String(), `<meta name="noskills-token"`)

	// The name is the decoded path segment.
	writeSpecState(t, f.root, "with space", noskillsfx.PhaseDiscovery)
	decoded := f.call(t, http.MethodGet, "/spec/with%20space", "", nil)
	require.Equal(t, http.StatusOK, decoded.Code)
	assert.Contains(t, decoded.Body.String(), "<h1>with space ")

	// A name must be one directory, even when a nested one exists.
	require.NoError(t, os.MkdirAll(filepath.Join(f.root, ".eser", "specs", "a", "b"), 0o750))

	for _, target := range []string{"/spec/nonexistent", "/spec/a/b", "/spec/a%2Fb", "/spec/a%5Cb"} {
		missing := f.call(t, http.MethodGet, target, "", nil)
		assert.Equal(t, http.StatusNotFound, missing.Code, target)
	}

	// A dot segment is cleaned away by a redirect before any route runs.
	assert.Equal(t, http.StatusTemporaryRedirect, f.call(t, http.MethodGet, "/spec/..", "", nil).Code)
}

func TestUnknownRoutesAnswer404(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)

	for _, target := range []string{"/nowhere", "/api/spec/x/other", "/static/missing.js", "/static/../server.go"} {
		recorder := f.call(t, http.MethodGet, target, "", nil)
		assert.Contains(t, []int{http.StatusNotFound, http.StatusTemporaryRedirect}, recorder.Code, target)
	}

	assert.Equal(t, "Not found", f.call(t, http.MethodGet, "/nowhere", "", nil).Body.String())
	// A known path with another method falls through to 404, as in the
	// TypeScript router.
	assert.Equal(t, http.StatusNotFound, f.post(t, "/api/state", "{}").Code)
}

func TestApproveChangesThePhaseAndWritesAnEvent(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)
	writeSpecState(t, f.root, "approve-web", noskillsfx.PhaseSpecProposal)

	recorder := f.post(t, "/api/spec/approve-web/approve", `{"user":{"name":"Tester","email":"t@test.com"}}`)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	assert.JSONEq(t, `{"ok":true}`, recorder.Body.String())

	phase, _ := noskillsfx.ReadSpecStateObject(f.root, "approve-web", nil).Get("phase")
	assert.Equal(t, noskillsfx.PhaseSpecApproved, phase)

	events := noskillsfx.ReadDashboardEvents(f.root, 0, "")
	require.NotEmpty(t, events)

	eventType, _ := events[0].Get("type")
	assert.Equal(t, "phase-change", eventType)
}

func TestNoteIsAdded(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)
	writeSpecState(t, f.root, "note-web", noskillsfx.PhaseDiscovery)

	recorder := f.post(t, "/api/spec/note-web/note", `{"text":"Important note from web"}`)

	assert.JSONEq(t, `{"ok":true}`, recorder.Body.String())
}

func TestActionNoticeReachesTheSpecTabWithoutControlCharacters(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)
	writeSpecState(t, f.root, "notify-web", noskillsfx.PhaseDiscovery)

	created := f.post(t, "/api/tab", `{"spec":"notify-web"}`)
	require.Equal(t, http.StatusOK, created.Code, created.Body.String())

	recorder := f.post(t, "/api/spec/notify-web/note",
		`{"text":"hello","user":{"name":"Eve\r/exit\u001b[2J","email":"eve@example.com"}}`)

	assert.JSONEq(t, `{"ok":true}`, recorder.Body.String())
	assert.Equal(t, []string{"\n[noskills: spec notify-web note by Eve/exit[2J]\n"}, f.host.written())
}

func TestStartIsAnUnknownAction(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)
	writeSpecState(t, f.root, "start-web", noskillsfx.PhaseSpecApproved)

	recorder := f.post(t, "/api/spec/start-web/start", "{}")

	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.JSONEq(t, `{"ok":false,"error":"Unknown action: start"}`, recorder.Body.String())

	phase, _ := noskillsfx.ReadSpecStateObject(f.root, "start-web", nil).Get("phase")
	assert.Equal(t, noskillsfx.PhaseSpecApproved, phase)
	assert.Empty(t, f.logs.records(t))
}

func TestEverySpecPageButtonIsAnActionTheAPIHandles(t *testing.T) {
	t.Parallel()

	for _, phase := range []string{noskillsfx.PhaseSpecProposal, noskillsfx.PhaseSpecApproved, noskillsfx.PhaseExecuting} {
		t.Run(phase, func(t *testing.T) {
			t.Parallel()

			f := newDashboardFixture(t)
			writeSpecState(t, f.root, "page-actions", phase)

			page := f.call(t, http.MethodGet, "/spec/page-actions", "", nil).Body.String()
			actions := dataActions(page)
			require.NotEmpty(t, actions)

			for _, action := range actions {
				body := decode(t, f.post(t, "/api/spec/page-actions/"+action,
					`{"text":"from the spec page","mentionId":"mention-1"}`))
				assert.NotEqual(t, "Unknown action: "+action, body["error"])
			}
		})
	}
}

func TestFailedActionIsLoggedUnderItsRequestID(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)

	// No such spec: a fault the action caught, not a refusal it decided on.
	recorder := f.post(t, "/api/spec/missing-spec/approve", "{}")
	body := decode(t, recorder)

	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Equal(t, false, body["ok"])
	assert.Equal(t, "Action could not be completed", body["error"])
	assert.NotContains(t, body, "detail")

	requestID, _ := body["requestId"].(string)
	assert.Regexp(t, requestIDPattern, requestID)

	records := f.logs.records(t)
	require.Len(t, records, 1, f.logs.String())

	record := records[0]
	assert.Equal(t, "ERROR", record["level"])
	assert.Equal(t, "Action could not be completed", record["msg"])
	assert.Equal(t, requestID, record["request_id"])
	assert.Equal(t, http.MethodPost, record["method"])
	assert.Equal(t, "/api/spec/missing-spec/approve", record["path"])
	assert.Equal(t, "missing-spec", record["spec"])
	assert.Equal(t, "approve", record["action"])
	// The detail the response leaves out: why the action failed.
	assert.Contains(t, f.logs.String(), "Spec 'missing-spec' not found")
	assert.NotContains(t, f.logs.String(), dashboardTestToken)
}

func TestDebugErrorsAddTheCauseToTheResponse(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t, func(config *DashboardConfig) { config.DebugErrors = true })

	body := decode(t, f.post(t, "/api/spec/missing-spec/approve", "{}"))

	assert.Contains(t, body["detail"], "Spec 'missing-spec' not found")
}

func TestRejectionIsAnsweredWithoutALogRecord(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)
	writeSpecState(t, f.root, "early-complete", noskillsfx.PhaseSpecProposal)

	recorder := f.post(t, "/api/spec/early-complete/complete", "{}")

	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.JSONEq(t, `{"ok":false,"error":"Cannot complete in phase: SPEC_PROPOSAL"}`, recorder.Body.String())
	assert.Empty(t, f.logs.records(t))
}

func TestFaultBoundaryLogsAPanicAndAnswers500(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)

	panicking := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("state.json unreadable at /home/someone")
	})

	recorder := httptest.NewRecorder()
	f.d.serveRequest(panicking, recorder,
		httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/mux?token=secret-token-value", nil))

	body := decode(t, recorder)

	assert.Equal(t, http.StatusInternalServerError, recorder.Code)
	assert.Equal(t, "Request could not be completed", body["error"])
	assert.NotContains(t, recorder.Body.String(), "/home/someone")

	requestID, _ := body["requestId"].(string)
	assert.Regexp(t, requestIDPattern, requestID)

	records := f.logs.records(t)
	require.Len(t, records, 1)
	assert.Equal(t, requestID, records[0]["request_id"])
	assert.Equal(t, "/mux", records[0]["path"])
	assert.NotContains(t, f.logs.String(), "secret-token-value")
}

func TestEachRequestGetsItsOwnID(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)

	first := decode(t, f.post(t, "/api/spec/missing/approve", "{}"))["requestId"]
	second := decode(t, f.post(t, "/api/spec/missing/approve", "{}"))["requestId"]

	assert.NotEqual(t, first, second)
}

func TestTabManagement(t *testing.T) {
	t.Parallel()

	t.Run("no tab at first", func(t *testing.T) {
		t.Parallel()

		f := newDashboardFixture(t)
		assert.JSONEq(t, `[]`, f.call(t, http.MethodGet, "/api/tabs", "", nil).Body.String())
	})

	t.Run("a free tab", func(t *testing.T) {
		t.Parallel()

		f := newDashboardFixture(t)
		body := decode(t, f.post(t, "/api/tab", "{}"))

		assert.Equal(t, true, body["ok"])
		assert.IsType(t, "", body["tabId"])
		assert.Nil(t, body["specName"])

		sessions := noskillsfx.ListSessions(f.root)
		require.Len(t, sessions, 1)
		assert.Equal(t, noskillsfx.SessionModeFree, sessions[0].Mode)
		assert.Equal(t, "web", sessions[0].Tool)
	})

	t.Run("a spec that is not a string is ignored", func(t *testing.T) {
		t.Parallel()

		f := newDashboardFixture(t)
		body := decode(t, f.post(t, "/api/tab", `{"spec":42}`))

		assert.Equal(t, true, body["ok"])
		assert.Nil(t, body["specName"])
	})

	t.Run("a tab bound to a spec", func(t *testing.T) {
		t.Parallel()

		f := newDashboardFixture(t)
		writeSpecState(t, f.root, "my-feature", noskillsfx.PhaseDiscovery)

		body := decode(t, f.post(t, "/api/tab", `{"spec":"my-feature"}`))
		assert.Equal(t, "my-feature", body["specName"])

		sessions := noskillsfx.ListSessions(f.root)
		require.Len(t, sessions, 1)
		require.NotNil(t, sessions[0].Phase)
		assert.Equal(t, noskillsfx.PhaseDiscovery, *sessions[0].Phase)

		listed := f.call(t, http.MethodGet, "/api/tabs", "", nil).Body.String()
		assert.JSONEq(t, `[{"id":"`+body["tabId"].(string)+`","specName":"my-feature"}]`, listed) //nolint:forcetypeassert // checked above
	})

	t.Run("closing a tab removes it and its session", func(t *testing.T) {
		t.Parallel()

		f := newDashboardFixture(t)
		tabID, _ := decode(t, f.post(t, "/api/tab", "{}"))["tabId"].(string)

		closed := f.call(t, http.MethodDelete, "/api/tab/"+tabID, "", map[string]string{DashboardTokenHeader: dashboardTestToken})
		assert.JSONEq(t, `{"ok":true}`, closed.Body.String())

		assert.JSONEq(t, `[]`, f.call(t, http.MethodGet, "/api/tabs", "", nil).Body.String())
		assert.Empty(t, noskillsfx.ListSessions(f.root))
	})
}

func TestSpecLedgerAndSummary(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)

	assert.JSONEq(t, `{"ok":true,"spec":"none","records":[],"summary":null}`,
		f.call(t, http.MethodGet, "/api/spec/none/ledger", "", nil).Body.String())
	assert.JSONEq(t, `{"ok":true,"spec":"none","summary":null}`,
		f.call(t, http.MethodGet, "/api/spec/none/summary", "", nil).Body.String())

	ledger := noskillsfx.NewPaths(f.root).LedgerFile("kept")
	require.NoError(t, os.MkdirAll(filepath.Dir(ledger), 0o750))
	require.NoError(t, os.WriteFile(ledger, []byte(`{"id":"d-1"}`+"\n"), 0o600))

	assert.JSONEq(t, `{"ok":true,"spec":"kept","records":[{"id":"d-1"}],"summary":null}`,
		f.call(t, http.MethodGet, "/api/spec/kept/ledger", "", nil).Body.String())
}

func TestStaticFiles(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)

	cases := []struct {
		target, contentType, contains string
	}{
		{target: "/static/style.css", contentType: "text/css", contains: "--bg"},
		{target: "/static/client.js", contentType: "application/javascript", contains: "EventSource"},
		{target: "/static/mux-render.js", contentType: "application/javascript", contains: "MuxRender"},
		{target: "/static/mux-remote.js", contentType: "application/javascript", contains: "startRemoteMux"},
		{target: "/static/sw-register.js", contentType: "application/javascript", contains: "serviceWorker"},
		{target: "/static/icons/icon.svg", contentType: "image/svg+xml", contains: "<svg"},
		{target: "/sw.js", contentType: "application/javascript", contains: "showNotification"},
		{target: "/manifest.json", contentType: "application/json", contains: `"start_url"`},
	}

	for _, tc := range cases {
		recorder := f.call(t, http.MethodGet, tc.target, "", nil)

		assert.Equal(t, http.StatusOK, recorder.Code, tc.target)
		assert.Equal(t, tc.contentType, recorder.Header().Get("Content-Type"), tc.target)
		assert.Contains(t, recorder.Body.String(), tc.contains, tc.target)
	}
}
