// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path"
	"strings"
	"unicode"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// The dashboard's JSON API and pages (routes/api.ts, routes/pages.ts). An
// action the dashboard refuses answers 400 with {ok: false, error}; a fault
// answers with a fixed message and the request id, and the cause goes to the
// log under that id.

// dashboardActionFault is the message of an action that failed on a fault.
const dashboardActionFault = "Action could not be completed"

// dashboardRequestFault is the message of a route that failed on a fault.
const dashboardRequestFault = "Request could not be completed"

// jsonObject is a JSON request body that is an object.
type jsonObject map[string]json.RawMessage

// readJSONObject is the object a JSON body holds; a body that is missing, too
// large, not JSON or not an object reads as {}.
func readJSONObject(w http.ResponseWriter, r *http.Request) jsonObject {
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, dashboardMaxBodyBytes))
	if err != nil {
		return jsonObject{}
	}

	var body jsonObject
	if json.Unmarshal(data, &body) != nil || body == nil {
		return jsonObject{}
	}

	return body
}

// stringField is a string field of the body, or "" when it is missing or
// not a string.
func (b jsonObject) stringField(key string) string {
	var value string
	if json.Unmarshal(b[key], &value) != nil {
		return ""
	}

	return value
}

// optionalString is a string field of the body, or nil when it is missing
// or not a string.
func (b jsonObject) optionalString(key string) *string {
	var value string
	if json.Unmarshal(b[key], &value) != nil {
		return nil
	}

	return &value
}

// userField is the acting user of the body: an object with a string name
// and a string email, or nil.
func (b jsonObject) userField() *noskillsfx.User {
	var user jsonObject
	if json.Unmarshal(b["user"], &user) != nil || user == nil {
		return nil
	}

	name := user.optionalString("name")
	email := user.optionalString("email")

	if name == nil || email == nil {
		return nil
	}

	return &noskillsfx.User{Name: *name, Email: *email}
}

// withoutControlCharacters drops the control characters of text, which is
// typed into an agent's terminal: a carriage return would submit and an
// escape start a sequence.
func withoutControlCharacters(text string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}

		return r
	}, text)
}

// validSpecName reports whether a spec name from a URL can name a directory
// under .eser/specs/ without leaving it.
func validSpecName(name string) bool {
	return name != "" && name != "." && name != ".." && !strings.ContainsAny(name, "/\\\x00")
}

// handleState is GET /api/state: the whole dashboard state.
func (d *Dashboard) handleState(w http.ResponseWriter, r *http.Request) {
	state := noskillsfx.GetDashboardState(r.Context(), d.env)
	writeJSON(w, http.StatusOK, &state)
}

// handleListTabs is GET /api/tabs: the open tabs.
func (d *Dashboard) handleListTabs(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, d.mux.listTabs())
}

// createTabResponse answers POST /api/tab.
type createTabResponse struct {
	OK       bool    `json:"ok"`
	TabID    string  `json:"tabId"`
	SpecName *string `json:"specName"`
}

// handleCreateTab is POST /api/tab: a tab running the coding agent, bound to
// the spec the body names when it names one as a string.
func (d *Dashboard) handleCreateTab(w http.ResponseWriter, r *http.Request) {
	spec := readJSONObject(w, r).optionalString("spec")

	tab, err := d.mux.createTab(r.Context(), spec)
	if err != nil {
		d.fault(w, r, dashboardRequestFault, http.StatusInternalServerError, err)

		return
	}

	writeJSON(w, http.StatusOK, createTabResponse{OK: true, TabID: tab.ID, SpecName: tab.SpecName})
}

// okResponse is {ok: true}.
type okResponse struct {
	OK bool `json:"ok"`
}

// handleCloseTab is DELETE /api/tab/{id}. An unknown id closes nothing.
func (d *Dashboard) handleCloseTab(w http.ResponseWriter, r *http.Request) {
	d.mux.closeTab(strings.TrimPrefix(r.URL.Path, "/api/tab/"))
	writeJSON(w, http.StatusOK, okResponse{OK: true})
}

// specLedgerResponse answers GET /api/spec/{name}/ledger.
type specLedgerResponse struct {
	OK      bool              `json:"ok"`
	Spec    string            `json:"spec"`
	Records []json.RawMessage `json:"records"`
	Summary json.RawMessage   `json:"summary"`
}

// specSummaryResponse answers GET /api/spec/{name}/summary.
type specSummaryResponse struct {
	OK      bool            `json:"ok"`
	Spec    string          `json:"spec"`
	Summary json.RawMessage `json:"summary"`
}

// handleSpecLedger is GET /api/spec/{name}/ledger: the decision ledger and
// its maturity summary. A spec without them has no records and a null
// summary, never a 404.
func (d *Dashboard) handleSpecLedger(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	records := []json.RawMessage{}

	var summary json.RawMessage

	if validSpecName(name) {
		read, err := noskillsfx.ReadLedgerRaw(d.root, name)
		if err != nil {
			d.fault(w, r, dashboardRequestFault, http.StatusInternalServerError, err)

			return
		}

		records = read
		summary = noskillsfx.ReadSummaryRaw(d.root, name)
	}

	writeJSON(w, http.StatusOK, specLedgerResponse{OK: true, Spec: name, Records: records, Summary: summary})
}

// handleSpecSummary is GET /api/spec/{name}/summary: the maturity summary
// alone, or null.
func (d *Dashboard) handleSpecSummary(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")

	var summary json.RawMessage
	if validSpecName(name) {
		summary = noskillsfx.ReadSummaryRaw(d.root, name)
	}

	writeJSON(w, http.StatusOK, specSummaryResponse{OK: true, Spec: name, Summary: summary})
}

// rejectionResponse is a refusal the dashboard decided on.
type rejectionResponse struct {
	OK    bool   `json:"ok"`
	Error string `json:"error"`
}

// runDashboardAction runs one action, reporting whether the name is known.
func (d *Dashboard) runDashboardAction(r *http.Request, spec, action string, body jsonObject) (bool, error) {
	ctx := r.Context()
	user := body.userField()

	switch action {
	case "approve":
		return true, noskillsfx.DashboardApprove(ctx, d.env, spec, user)
	case "note":
		return true, noskillsfx.DashboardAddNote(ctx, d.env, spec, body.stringField("text"), user)
	case "question":
		return true, noskillsfx.DashboardAddQuestion(ctx, d.env, spec, body.stringField("text"), user)
	case "signoff":
		return true, noskillsfx.DashboardSignoff(ctx, d.env, spec, user)
	case "reply":
		return true, noskillsfx.DashboardReplyMention(ctx, d.env, spec, body.stringField("mentionId"), body.stringField("text"), user)
	case "complete":
		return true, noskillsfx.DashboardComplete(ctx, d.env, spec, user)
	default:
		return false, nil
	}
}

// handleAction is POST /api/spec/{name}/{action}: approve, note, question,
// signoff, reply or complete. A success is typed into the agent tab bound to
// the spec, without moving the user's focus.
func (d *Dashboard) handleAction(w http.ResponseWriter, r *http.Request) {
	spec := r.PathValue("name")
	action := r.PathValue("action")
	body := readJSONObject(w, r)

	known, err := d.runDashboardAction(r, spec, action, body)

	switch {
	case !known:
		writeJSON(w, http.StatusBadRequest, rejectionResponse{OK: false, Error: "Unknown action: " + action})

		return
	case err != nil:
		// A refusal the action decided on tells the user what to do; any
		// other error may name host paths, so it stays in the log.
		if rejection, ok := noskillsfx.IsDashboardRejection(err); ok {
			writeJSON(w, http.StatusBadRequest, rejectionResponse{OK: false, Error: rejection.Message})

			return
		}

		d.fault(w, r, dashboardActionFault, http.StatusBadRequest, err, "spec", spec, "action", action)

		return
	}

	actor := "someone"
	if user := body.userField(); user != nil {
		actor = user.Name
	}

	// The URL's spec name is decoded, so it loses its control characters too.
	d.mux.notifySpec(spec,
		"\n[noskills: spec "+withoutControlCharacters(spec)+" "+action+" by "+withoutControlCharacters(actor)+"]\n")

	writeJSON(w, http.StatusOK, okResponse{OK: true})
}

// handleDashboardPage is GET /: the spec list, the pending mentions and the
// agent tabs.
func (d *Dashboard) handleDashboardPage(w http.ResponseWriter, r *http.Request) {
	state := noskillsfx.GetDashboardState(r.Context(), d.env)

	page, err := d.pages.renderDashboardPage(&state, d.mux.listTabs(), d.token)
	if err != nil {
		d.fault(w, r, dashboardRequestFault, http.StatusInternalServerError, err)

		return
	}

	writeHTML(w, page)
}

// handleSpecPage is GET /spec/{name}: the spec page, or 404 when the spec
// has no directory.
func (d *Dashboard) handleSpecPage(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/spec/")
	if !validSpecName(name) {
		writePlainText(w, http.StatusNotFound, "Spec not found")

		return
	}

	root, err := os.OpenRoot(d.root)
	if err != nil {
		d.fault(w, r, dashboardRequestFault, http.StatusInternalServerError, err)

		return
	}
	defer root.Close() //nolint:errcheck // read-only

	specDir := path.Join(".eser", "specs", name)
	if info, statErr := root.Stat(specDir); statErr != nil || !info.IsDir() {
		writePlainText(w, http.StatusNotFound, "Spec not found")

		return
	}

	content, readErr := root.ReadFile(path.Join(specDir, "spec.md"))
	if readErr != nil && !errors.Is(readErr, os.ErrNotExist) {
		d.fault(w, r, dashboardRequestFault, http.StatusInternalServerError, readErr)

		return
	}

	summary := noskillsfx.GetSpecSummary(d.env, name)

	page, err := d.pages.renderSpecPage(&summary, string(content), d.token)
	if err != nil {
		d.fault(w, r, dashboardRequestFault, http.StatusInternalServerError, err)

		return
	}

	writeHTML(w, page)
}
