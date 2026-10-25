// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"net/http"
	"regexp"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The checks of the TypeScript layout.test.ts and of the template tests in
// server.test.ts, on the Go templates.

func renderTestDashboard(t *testing.T, state *noskillsfx.DashboardState, tabs []dashboardTab) string {
	t.Helper()

	pages, err := parseDashboardTemplates()
	require.NoError(t, err)

	page, err := pages.renderDashboardPage(state, tabs, "x")
	require.NoError(t, err)

	return string(page)
}

func emptyDashboardState() *noskillsfx.DashboardState {
	return &noskillsfx.DashboardState{ //nolint:exhaustruct
		Specs: []noskillsfx.SpecSummary{}, PendingMentions: []noskillsfx.DashboardMention{},
	}
}

func TestPagesLoadNoThirdPartyFiles(t *testing.T) {
	t.Parallel()

	pages, err := parseDashboardTemplates()
	require.NoError(t, err)

	spec := noskillsfx.SpecSummary{Name: "upload", Slug: "upload", Phase: noskillsfx.PhaseExecuting} //nolint:exhaustruct

	specPage, err := pages.renderSpecPage(&spec, "", "x")
	require.NoError(t, err)

	for name, page := range map[string]string{
		"dashboard": renderTestDashboard(t, emptyDashboardState(), nil),
		"spec":      string(specPage),
	} {
		tags := regexp.MustCompile(`<(?:script|link)\b[^>]*>`).FindAllString(page, -1)
		require.NotEmpty(t, tags, name)

		for _, tag := range tags {
			source := regexp.MustCompile(`(?:src|href)="([^"]+)"`).FindStringSubmatch(tag)
			require.NotNil(t, source, "%s: %s", name, tag)
			assert.True(t, strings.HasPrefix(source[1], "/") && !strings.HasPrefix(source[1], "//"),
				"%s loads %s from another origin", name, source[1])
		}

		assert.NotContains(t, page, "xterm", name)
		assert.NotContains(t, page, "jsdelivr", name)
		assert.NotContains(t, page, "integrity=", name)
	}
}

func TestPagesHaveNoInlineScriptOrStyle(t *testing.T) {
	t.Parallel()

	spec := noskillsfx.SpecSummary{Name: "upload", Slug: "upload", Phase: noskillsfx.PhaseExecuting} //nolint:exhaustruct
	state := emptyDashboardState()
	state.Specs = []noskillsfx.SpecSummary{spec}

	page := renderTestDashboard(t, state, nil)

	for _, tag := range regexp.MustCompile(`<script\b[^>]*>`).FindAllString(page, -1) {
		assert.Contains(t, tag, "src=", "an inline script would need unsafe-inline")
	}

	// The CSP's style-src has no 'unsafe-inline', which style attributes
	// and <style> elements would need.
	assert.NotRegexp(t, regexp.MustCompile(`\sstyle=`), page)
	assert.NotContains(t, page, "<style")
}

func TestHTMLResponsesCarryTheCSP(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)
	recorder := f.call(t, http.MethodGet, "/", "", nil)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, contentTypeHTML, recorder.Header().Get("Content-Type"))

	policy := recorder.Header().Get("Content-Security-Policy")
	directives := map[string]string{}

	for directive := range strings.SplitSeq(policy, "; ") {
		name, _, _ := strings.Cut(directive, " ")
		directives[name] = directive
	}

	assert.Equal(t, "default-src 'self'", directives["default-src"])
	assert.Equal(t, "script-src 'self'", directives["script-src"])
	assert.Equal(t, "style-src 'self'", directives["style-src"])
	assert.Equal(t, "img-src 'self'", directives["img-src"])
	assert.Equal(t, "connect-src 'self' ws://localhost:3000 ws://127.0.0.1:3000 ws://[::1]:3000", directives["connect-src"])
	assert.Equal(t, "object-src 'none'", directives["object-src"])
	assert.Equal(t, "frame-ancestors 'none'", directives["frame-ancestors"])
	assert.NotContains(t, policy, "jsdelivr")
	assert.NotContains(t, policy, "unsafe-inline")

	assert.Equal(t, "nosniff", recorder.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, "DENY", recorder.Header().Get("X-Frame-Options"))
}

func TestDashboardTemplateRendersTheLayout(t *testing.T) {
	t.Parallel()

	page := renderTestDashboard(t, emptyDashboardState(), nil)

	for _, part := range []string{"<!DOCTYPE html>", "spec-list", "sidebar", "tab-bar", `id="terminal-container"`,
		"No specs yet. Create one from the terminal.", `<script src="/static/mux-render.js"></script>`} {
		assert.Contains(t, page, part)
	}

	assert.NotContains(t, page, "pending-section")
}

func TestPhaseBadgeTones(t *testing.T) {
	t.Parallel()

	assert.Equal(t, phaseBadgeView{Tone: "executing", Label: "EXECUTING"}, phaseBadge(noskillsfx.PhaseExecuting))
	assert.Equal(t, phaseBadgeView{Tone: "discovery", Label: "REFINEMENT"}, phaseBadge(noskillsfx.PhaseDiscoveryRefinement))
	assert.Equal(t, phaseBadgeView{Tone: "proposal", Label: "PROPOSAL"}, phaseBadge(noskillsfx.PhaseSpecProposal))
	assert.Equal(t, phaseBadgeView{Tone: "blocked", Label: "BLOCKED"}, phaseBadge(noskillsfx.PhaseBlocked))
	assert.Equal(t, phaseBadgeView{Tone: "other", Label: "SOMETHING"}, phaseBadge("SOMETHING"))

	spec := noskillsfx.SpecSummary{Name: "upload", Slug: "upload", Phase: noskillsfx.PhaseExecuting} //nolint:exhaustruct
	state := emptyDashboardState()
	state.Specs = []noskillsfx.SpecSummary{spec}

	page := renderTestDashboard(t, state, nil)
	assert.Contains(t, page, `<span class="phase-badge phase-executing">EXECUTING</span>`)
}

func TestTabBarMarksTheActiveTabAndLabelsFreeTabs(t *testing.T) {
	t.Parallel()

	upload := "upload"
	page := renderTestDashboard(t, emptyDashboardState(), []dashboardTab{
		{ID: "tab-1", SpecName: &upload, SessionID: "s1"},
		{ID: "tab-2", SpecName: nil, SessionID: "s2"},
	})

	// Each tab is a select button and a close button side by side, so both
	// take keyboard focus; client.js and mux-render.js use the same markup.
	assert.Contains(t, page,
		`<div class="tab active" data-tab="tab-1"><button type="button" class="tab-select" data-index="0">upload</button>`+
			`<button type="button" class="tab-close" data-close="tab-1" aria-label="Close upload">&times;</button></div>`)
	assert.Contains(t, page,
		`<div class="tab" data-tab="tab-2"><button type="button" class="tab-select" data-index="1">IDLE</button>`+
			`<button type="button" class="tab-close" data-close="tab-2" aria-label="Close IDLE">&times;</button></div>`)
	assert.Contains(t, page, `<button type="button" class="tab-add" id="add-tab" aria-label="New tab">+</button>`)
	assert.Equal(t, 1, buttonDepth(page), "a button nests another button")
}

// buttonDepth is the deepest nesting of <button> elements in html.
func buttonDepth(html string) int {
	depth, deepest := 0, 0

	for _, tag := range regexp.MustCompile(`<(/?)button\b`).FindAllStringSubmatch(html, -1) {
		if tag[1] == "/" {
			depth--
		} else {
			depth++
		}

		deepest = max(deepest, depth)
	}

	return deepest
}

func TestDashboardTemplateListsSpecsAndMentions(t *testing.T) {
	t.Parallel()

	active := noskillsfx.SpecSummary{ //nolint:exhaustruct
		Name: "live", Slug: "live", Phase: noskillsfx.PhaseExecuting,
		Tasks: []noskillsfx.DashboardTask{{ID: "task-1", Description: "a", Done: true}, {ID: "task-2", Description: "b"}}, //nolint:exhaustruct
	}
	state := emptyDashboardState()
	state.Specs = []noskillsfx.SpecSummary{active, {Name: "old", Slug: "old", Phase: noskillsfx.PhaseCompleted}} //nolint:exhaustruct
	state.ActiveSpec = &state.Specs[0]
	state.PendingMentions = []noskillsfx.DashboardMention{{ID: "m-1", Spec: "live", From: "Ada", Question: "Why?", Status: "pending"}} //nolint:exhaustruct

	page := renderTestDashboard(t, state, nil)

	assert.Contains(t, page, `<a href="/spec/live" class="spec-item active">`)
	assert.Contains(t, page, `<a href="/spec/old" class="spec-item">`)
	assert.Contains(t, page, `<span class="task-progress">1/2</span>`)
	assert.Contains(t, page, `<h3>Pending Mentions (1)</h3>`)
	assert.Contains(t, page, `data-spec="live" data-action="reply" data-mention-id="m-1"`)
	assert.NotContains(t, page, "No specs yet")
}

func TestTemplatesEscapeProjectText(t *testing.T) {
	t.Parallel()

	spec := noskillsfx.SpecSummary{ //nolint:exhaustruct
		Name: `<script>alert(1)</script>`, Slug: `x"onmouseover="alert(1)`, Phase: noskillsfx.PhaseDiscovery,
		Description:      `<img src=x onerror=alert(1)>`,
		PendingQuestions: []noskillsfx.DashboardQuestion{{ID: `q" data-x="1`, Text: "<b>bold</b>", User: "<i>u</i>"}},
	}

	pages, err := parseDashboardTemplates()
	require.NoError(t, err)

	page, err := pages.renderSpecPage(&spec, "</pre><script>alert(2)</script>", "x")
	require.NoError(t, err)

	html := string(page)
	assert.NotContains(t, html, "<script>alert")
	assert.NotContains(t, html, "<img src=x")
	assert.NotContains(t, html, "<b>bold</b>")
	assert.NotContains(t, html, `data-x="1"`)
	assert.Contains(t, html, "&lt;script&gt;alert(1)&lt;/script&gt;")
}

func TestSpecPageOffersTheActionsOfItsPhase(t *testing.T) {
	t.Parallel()

	cases := []struct {
		phase string
		want  []string
	}{
		{phase: noskillsfx.PhaseSpecProposal, want: []string{"approve", "note", "question"}},
		// SPEC_APPROVED has no Start Execution: no dashboard action starts it.
		{phase: noskillsfx.PhaseSpecApproved, want: []string{"note", "question"}},
		{phase: noskillsfx.PhaseExecuting, want: []string{"complete", "note", "question"}},
		{phase: noskillsfx.PhaseCompleted, want: nil},
		{phase: noskillsfx.PhaseIdle, want: nil},
	}

	pages, err := parseDashboardTemplates()
	require.NoError(t, err)

	for _, tc := range cases {
		t.Run(tc.phase, func(t *testing.T) {
			t.Parallel()

			spec := noskillsfx.SpecSummary{Name: "cta-test", Slug: "cta-test", Phase: tc.phase} //nolint:exhaustruct

			page, err := pages.renderSpecPage(&spec, "", "x")
			require.NoError(t, err)

			assert.Equal(t, tc.want, dataActions(string(page)))
			assert.NotContains(t, string(page), "Start Execution")
		})
	}
}

// dataActions are the data-action values of a page, in order.
func dataActions(page string) []string {
	matches := regexp.MustCompile(`data-action="([^"]+)"`).FindAllStringSubmatch(page, -1)
	if len(matches) == 0 {
		return nil
	}

	actions := make([]string, 0, len(matches))

	for _, match := range matches {
		actions = append(actions, match[1])
	}

	return actions
}
