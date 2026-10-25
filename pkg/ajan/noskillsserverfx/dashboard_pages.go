// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"bytes"
	"embed"
	"fmt"
	"html/template"
	"strings"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// The dashboard pages are html/template views of the dashboard state, with
// the markup of the TypeScript templates (templates/*.ts) that client.js and
// mux-render.js rely on. Every script and style the pages use is embedded
// and served by the dashboard itself.

//go:embed web/templates/*.tmpl
var dashboardTemplateFiles embed.FS

// dashboardTemplates are the parsed pages, one template set each.
type dashboardTemplates struct {
	dashboard  *template.Template
	specDetail *template.Template
}

// parseDashboardTemplates parses the embedded templates.
func parseDashboardTemplates() (*dashboardTemplates, error) {
	base, err := template.ParseFS(dashboardTemplateFiles, "web/templates/layout.tmpl")
	if err != nil {
		return nil, fmt.Errorf("parse the dashboard layout: %w", err)
	}

	page := func(name string) (*template.Template, error) {
		clone, cloneErr := base.Clone()
		if cloneErr != nil {
			return nil, fmt.Errorf("clone the dashboard layout: %w", cloneErr)
		}

		parsed, parseErr := clone.ParseFS(dashboardTemplateFiles, "web/templates/"+name)
		if parseErr != nil {
			return nil, fmt.Errorf("parse the dashboard page %s: %w", name, parseErr)
		}

		return parsed, nil
	}

	dashboard, err := page("dashboard.tmpl")
	if err != nil {
		return nil, err
	}

	specDetail, err := page("spec_detail.tmpl")
	if err != nil {
		return nil, err
	}

	return &dashboardTemplates{dashboard: dashboard, specDetail: specDetail}, nil
}

// layoutView is what the layout renders around a page.
type layoutView struct {
	Title string
	Token string
	Page  any
}

// phaseBadgeView is a phase label and its tone, the class style.css colors
// the badge by; the CSP allows no style attributes.
type phaseBadgeView struct {
	Tone  string
	Label string
}

// phaseTone is the badge tone of a phase; any other phase is "other".
func phaseTone(phase string) string {
	switch phase {
	case noskillsfx.PhaseDiscovery, noskillsfx.PhaseDiscoveryRefinement:
		return "discovery"
	case noskillsfx.PhaseSpecProposal, noskillsfx.PhaseSpecApproved:
		return "proposal"
	case noskillsfx.PhaseExecuting:
		return "executing"
	case noskillsfx.PhaseBlocked:
		return "blocked"
	default:
		return "other"
	}
}

// phaseBadge is the badge of a phase, with the long phase names shortened.
func phaseBadge(phase string) phaseBadgeView {
	label := strings.NewReplacer(
		"DISCOVERY_REFINEMENT", "REFINEMENT",
		"SPEC_PROPOSAL", "PROPOSAL",
		"SPEC_APPROVED", "APPROVED",
	).Replace(phase)

	return phaseBadgeView{Tone: phaseTone(phase), Label: label}
}

type specItemView struct {
	Slug      string
	Name      string
	Active    bool
	Badge     phaseBadgeView
	TaskDone  int
	TaskTotal int
}

type tabView struct {
	ID     string
	Label  string
	Active bool
}

type dashboardView struct {
	Specs    []specItemView
	Mentions []noskillsfx.DashboardMention
	Tabs     []tabView
}

// tasksDone counts the completed tasks.
func tasksDone(tasks []noskillsfx.DashboardTask) int {
	done := 0

	for _, task := range tasks {
		if task.Done {
			done++
		}
	}

	return done
}

// renderDashboardPage renders GET /. The first tab is marked active, as the
// TypeScript page marked it; the /mux scene redraws the bar once it arrives.
func (t *dashboardTemplates) renderDashboardPage(state *noskillsfx.DashboardState, tabs []dashboardTab, token string) ([]byte, error) {
	view := dashboardView{Specs: nil, Mentions: state.PendingMentions, Tabs: nil}

	for _, spec := range state.Specs {
		view.Specs = append(view.Specs, specItemView{
			Slug: spec.Slug, Name: spec.Name,
			Active: state.ActiveSpec != nil && state.ActiveSpec.Slug == spec.Slug,
			Badge:  phaseBadge(spec.Phase), TaskDone: tasksDone(spec.Tasks), TaskTotal: len(spec.Tasks),
		})
	}

	for i, tab := range tabs {
		label := "IDLE"
		if tab.SpecName != nil {
			label = *tab.SpecName
		}

		view.Tabs = append(view.Tabs, tabView{ID: tab.ID, Label: label, Active: i == 0})
	}

	return execute(t.dashboard, &layoutView{
		Title: "noskills", Token: token, Page: view,
	})
}

type specActionView struct {
	Label  string
	Action string
}

type specDetailView struct {
	Slug         string
	Name         string
	Badge        phaseBadgeView
	Description  string
	Roadmap      string
	Actions      []specActionView
	Tasks        []noskillsfx.DashboardTask
	TasksDone    int
	Questions    []noskillsfx.DashboardQuestion
	Content      string
	Contributors []string
}

// specPageActions are the buttons of a phase. Each is an action the action
// route handles; SPEC_APPROVED has none, because the dashboard has no action
// that starts execution (`noskills spec <name> next` does).
func specPageActions(phase string) []specActionView {
	var actions []specActionView

	switch phase {
	case noskillsfx.PhaseSpecProposal:
		actions = append(actions, specActionView{Label: "Approve Spec", Action: "approve"})
	case noskillsfx.PhaseExecuting:
		actions = append(actions, specActionView{Label: "Mark Complete", Action: "complete"})
	}

	if phase != noskillsfx.PhaseCompleted && phase != noskillsfx.PhaseIdle && phase != "UNINITIALIZED" {
		actions = append(actions,
			specActionView{Label: "Add Note", Action: "note"},
			specActionView{Label: "Ask Question", Action: "question"},
		)
	}

	return actions
}

// renderSpecPage renders GET /spec/{name}. The page carries the token too,
// so its buttons can send the actions.
func (t *dashboardTemplates) renderSpecPage(spec *noskillsfx.SpecSummary, content, token string) ([]byte, error) {
	view := specDetailView{
		Slug: spec.Slug, Name: spec.Name, Badge: phaseBadge(spec.Phase), Description: spec.Description,
		Roadmap: spec.Roadmap, Actions: specPageActions(spec.Phase), Tasks: spec.Tasks, TasksDone: tasksDone(spec.Tasks),
		Questions: spec.PendingQuestions, Content: content, Contributors: spec.Contributors,
	}

	return execute(t.specDetail, &layoutView{
		Title: spec.Name + " — noskills", Token: token, Page: view,
	})
}

// execute renders the layout of a page set.
func execute(set *template.Template, view *layoutView) ([]byte, error) {
	var out bytes.Buffer

	if err := set.ExecuteTemplate(&out, "layout", view); err != nil {
		return nil, fmt.Errorf("render the dashboard page %q: %w", view.Title, err)
	}

	return out.Bytes(), nil
}
