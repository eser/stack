// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"math"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
)

// The dashboard state is the one view of a project that the web dashboard
// and the manager render (dashboard/state.ts): every spec summarized from its
// state file and spec.md, the recent events, and the mentions and sign-offs
// still waiting. The JSON field names and order are the TypeScript ones, so
// GET /api/state answers what it answered before.

// dashboardRecentEvents is how many events the state reads.
const dashboardRecentEvents = 50

// dashboardQuestionPrefix marks a spec note that is an open question.
const dashboardQuestionPrefix = "[QUESTION] "

// DashboardUser is a name and an email.
type DashboardUser struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

// DashboardQuestion is an open question on a spec: a note that starts with
// "[QUESTION] ", without the prefix.
type DashboardQuestion struct {
	ID   string `json:"id"`
	Text string `json:"text"`
	User string `json:"user"`
	TS   string `json:"ts"`
}

// DashboardTask is a task of a spec's spec.md and whether it is completed.
type DashboardTask struct {
	ID          string   `json:"id"`
	Description string   `json:"description"`
	Done        bool     `json:"done"`
	Files       []string `json:"files,omitempty"`
}

// SpecSummary is one spec as the dashboard shows it.
type SpecSummary struct {
	Name             string              `json:"name"`
	Slug             string              `json:"slug"`
	Phase            string              `json:"phase"`
	Description      string              `json:"description"`
	Tasks            []DashboardTask     `json:"tasks"`
	Contributors     []string            `json:"contributors"`
	Delegations      []any               `json:"delegations"`
	PendingQuestions []DashboardQuestion `json:"pendingQuestions"`
	PendingSignoffs  []string            `json:"pendingSignoffs"`
	Roadmap          string              `json:"roadmap"`
	CreatedAt        string              `json:"createdAt"`
	UpdatedAt        string              `json:"updatedAt"`
	// AvgConfidence is nil when the spec has no confidence findings.
	AvgConfidence      *float64 `json:"avgConfidence"`
	LowConfidenceItems int      `json:"lowConfidenceItems"`
}

// DashboardMention is a question asked on the dashboard that has no reply
// event yet.
type DashboardMention struct {
	ID       string `json:"id"`
	Spec     string `json:"spec"`
	From     string `json:"from"`
	To       string `json:"to"`
	Question string `json:"question"`
	Status   string `json:"status"`
	TS       string `json:"ts"`
}

// DashboardPendingSignoff is a sign-off event that is still pending.
type DashboardPendingSignoff struct {
	Spec   string `json:"spec"`
	Role   string `json:"role"`
	Status string `json:"status"`
	TS     string `json:"ts"`
}

// DashboardState is the whole dashboard view of a project.
type DashboardState struct {
	Specs           []SpecSummary             `json:"specs"`
	ActiveSpec      *SpecSummary              `json:"activeSpec"`
	PendingMentions []DashboardMention        `json:"pendingMentions"`
	PendingSignoffs []DashboardPendingSignoff `json:"pendingSignoffs"`
	RecentEvents    []*JSObject               `json:"recentEvents"`
	CurrentUser     *DashboardUser            `json:"currentUser"`
	// Roles is the manifest's noskills.roles value, or nil.
	Roles any `json:"roles"`
}

// dashboardRoadmap is the phase line the spec page shows.
func dashboardRoadmap(phase string) string {
	mapped := phase

	switch phase {
	case PhaseDiscoveryRefinement:
		mapped = "REVIEW"
	case PhaseSpecProposal:
		mapped = "DRAFT"
	case PhaseSpecApproved:
		mapped = "APPROVED"
	case PhaseCompleted:
		mapped = "DONE"
	case PhaseBlocked:
		mapped = PhaseExecuting
	}

	steps := []string{"IDLE", "DISCOVERY", "REVIEW", "DRAFT", "APPROVED", "EXECUTING", "DONE", "IDLE"}
	for i, step := range steps {
		if step == mapped {
			steps[i] = "[ " + step + " ]"
		}
	}

	return strings.Join(steps, " → ")
}

// jsRound is Math.round: halves round toward positive infinity.
func jsRound(x float64) float64 {
	return math.Floor(x + 0.5)
}

// summaryState is the state of a spec, picked as ResolveState picks it: its
// own state file when that names the spec, else the active state.json when
// that names it, else its own file (the initial state when it has none). A
// spec that is active but has no file of its own yet lives only in
// state.json.
func summaryState(e *LifecycleEnv, specName string) *JSObject {
	specState := ReadSpecStateObject(e.Root, specName, e.Warn)
	if specState.str("spec") == specName {
		return specState
	}

	if active := ReadHookState(e.Root, e.Warn); active.str("spec") == specName {
		return active
	}

	return specState
}

// GetSpecSummary is getSpecSummary: the spec's state (see summaryState),
// with the tasks of its spec.md.
func GetSpecSummary(e *LifecycleEnv, specName string) SpecSummary {
	state := summaryState(e, specName)
	execution := executionOf(state)
	completed := stringsOf(execution.arr("completedTasks"))

	tasks := []DashboardTask{}

	if parsed := ReadParsedSpec(e.Root, specName); parsed != nil {
		for _, task := range parsed.Tasks {
			tasks = append(tasks, DashboardTask{
				ID: task.ID, Description: task.Title, Done: slices.Contains(completed, task.ID), Files: task.Files,
			})
		}
	}

	contributors := []string{}

	for _, answer := range objectsOf(discoveryOf(state).arr("answers")) {
		if user, ok := answer.strOK("user"); ok && user != UnknownUser().Name && !slices.Contains(contributors, user) {
			contributors = append(contributors, user)
		}
	}

	questions := []DashboardQuestion{}

	for _, note := range objectsOf(state.arr("specNotes")) {
		text := note.str("text")
		if strings.HasPrefix(text, dashboardQuestionPrefix) {
			questions = append(questions, DashboardQuestion{
				ID: note.str("id"), Text: strings.TrimPrefix(text, dashboardQuestionPrefix),
				User: note.str("user"), TS: note.str("timestamp"),
			})
		}
	}

	createdAt := e.nowISO()
	if history := objectsOf(state.arr("transitionHistory")); len(history) > 0 {
		createdAt = history[0].str("timestamp")
	}

	updatedAt := createdAt
	if lastCalled, ok := state.strOK("lastCalledAt"); ok {
		updatedAt = lastCalled
	}

	findings := objectsOf(execution.arr("confidenceFindings"))

	var avgConfidence *float64

	low := 0

	if len(findings) > 0 {
		sum := 0.0

		for _, finding := range findings {
			sum += finding.num("confidence")

			if finding.num("confidence") < 5 {
				low++
			}
		}

		avg := jsRound(sum/float64(len(findings))*10) / 10
		avgConfidence = &avg
	}

	delegations := discoveryOf(state).arr("delegations")
	if delegations == nil {
		delegations = []any{}
	}

	return SpecSummary{
		Name: specName, Slug: specName, Phase: phaseOf(state), Description: state.str("specDescription"),
		Tasks: tasks, Contributors: contributors, Delegations: delegations,
		PendingQuestions: questions, PendingSignoffs: []string{},
		Roadmap: dashboardRoadmap(phaseOf(state)), CreatedAt: createdAt, UpdatedAt: updatedAt,
		AvgConfidence: avgConfidence, LowConfidenceItems: low,
	}
}

// dashboardSpecNames are the specs with a state file and the spec
// directories without one, in name order.
func dashboardSpecNames(root string, warn StateWarner) []string {
	var names []string

	for _, entry := range ListSpecStateObjects(root, warn) {
		names = append(names, entry.Name)
	}

	if entries, err := os.ReadDir(filepath.Join(root, specsDir)); err == nil {
		for _, entry := range entries {
			if entry.IsDir() && !slices.Contains(names, entry.Name()) {
				names = append(names, entry.Name())
			}
		}
	}

	sort.Strings(names)

	return names
}

// specIsActive reports whether a spec is neither completed nor idle.
func specIsActive(spec *SpecSummary) bool {
	return spec.Phase != PhaseCompleted && spec.Phase != PhaseIdle
}

// GetDashboardState is getState: the summaries of every spec (active ones
// first, then the most recently updated), the last 50 events newest first,
// the mentions without a reply, the pending sign-offs, the current user and
// the manifest's roles.
func GetDashboardState(ctx context.Context, e *LifecycleEnv) DashboardState {
	names := dashboardSpecNames(e.Root, e.Warn)
	specs := make([]SpecSummary, 0, len(names))

	for _, name := range names {
		specs = append(specs, GetSpecSummary(e, name))
	}

	sort.SliceStable(specs, func(i, j int) bool {
		if specIsActive(&specs[i]) != specIsActive(&specs[j]) {
			return specIsActive(&specs[i])
		}

		return specs[i].UpdatedAt > specs[j].UpdatedAt
	})

	var active *SpecSummary

	for i := range specs {
		if specIsActive(&specs[i]) {
			active = &specs[i]

			break
		}
	}

	events := ReadDashboardEvents(e.Root, dashboardRecentEvents, "")
	if events == nil {
		events = []*JSObject{}
	}

	user := e.ResolveUser(ctx)

	var roles any

	if manifest, ok := readManifestSection(e.Root); ok {
		roles, _ = manifest.get("roles")
	}

	return DashboardState{
		Specs: specs, ActiveSpec: active,
		PendingMentions: pendingMentions(events), PendingSignoffs: pendingSignoffs(events),
		RecentEvents: events, CurrentUser: &DashboardUser{Name: user.Name, Email: user.Email}, Roles: roles,
	}
}

// pendingMentions are the mention events no mention-reply event answers.
func pendingMentions(events []*JSObject) []DashboardMention {
	replied := map[string]bool{}

	for _, event := range events {
		if event.str("type") == DashboardEventMentionReply {
			replied[event.str("mentionId")] = true
		}
	}

	mentions := []DashboardMention{}

	for _, event := range events {
		if event.str("type") != DashboardEventMention || replied[event.str("id")] {
			continue
		}

		from, ok := event.strOK("from")
		if !ok {
			from = event.str("user")
		}

		mentions = append(mentions, DashboardMention{
			ID: event.str("id"), Spec: event.str("spec"), From: from, To: event.str("to"),
			Question: event.str("question"), Status: "pending", TS: event.str("ts"),
		})
	}

	return mentions
}

// pendingSignoffs are the sign-off events whose status is pending.
func pendingSignoffs(events []*JSObject) []DashboardPendingSignoff {
	signoffs := []DashboardPendingSignoff{}

	for _, event := range events {
		if event.str("type") == DashboardEventSignoff && event.str("status") == "pending" {
			signoffs = append(signoffs, DashboardPendingSignoff{
				Spec: event.str("spec"), Role: event.str("role"), Status: "pending", TS: event.str("ts"),
			})
		}
	}

	return signoffs
}
