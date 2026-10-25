// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// dashboardEnv is a project at a fresh directory with a fixed clock and no
// identity sources, so the acting user is the one a test passes or Unknown
// User.
func dashboardEnv(t *testing.T) *LifecycleEnv {
	t.Helper()

	clock := time.Date(2026, 10, 25, 12, 0, 0, 0, time.UTC)

	return &LifecycleEnv{ //nolint:exhaustruct
		Root:      t.TempDir(),
		LookupEnv: func(string) (string, bool) { return "", false },
		Now:       func() time.Time { return clock },
	}
}

// writeDashboardSpec writes a spec directory and a per-spec state in phase.
func writeDashboardSpec(t *testing.T, root, name, phase string) {
	t.Helper()

	state, err := startSpecState(InitialState(), name, "spec/"+name, "Spec "+name)
	require.NoError(t, err)

	require.NoError(t, os.MkdirAll(filepath.Join(root, specsDir, name), 0o750))
	require.NoError(t, WriteSpecStateObject(root, name, state.with("phase", phase), nil))
}

func TestGetSpecSummaryReadsStateAndSpecFile(t *testing.T) {
	t.Parallel()

	e := dashboardEnv(t)
	writeDashboardSpec(t, e.Root, "upload", PhaseExecuting)

	state := ReadSpecStateObject(e.Root, "upload", nil)
	state = state.with(
		"specNotes", []any{
			JSObjectOf("id", "note-1", "text", "[QUESTION] Which bucket?", "user", "Ada", "timestamp", "t1"),
			JSObjectOf("id", "note-2", "text", "plain note", "user", "Ada", "timestamp", "t2"),
		},
		"transitionHistory", []any{JSObjectOf("timestamp", "2026-01-01T00:00:00.000Z")},
		"lastCalledAt", "2026-02-01T00:00:00.000Z",
		"discovery", discoveryOf(state).with("answers", []any{
			JSObjectOf("user", "Ada"), JSObjectOf("user", "Unknown User"), JSObjectOf("user", "Ada"), JSObjectOf("user", "Bob"),
		}),
		"execution", executionOf(state).with(
			"completedTasks", []any{"task-1"},
			"confidenceFindings", []any{JSObjectOf("confidence", 4.0), JSObjectOf("confidence", 7.0), JSObjectOf("confidence", 8.0)},
		),
	)
	require.NoError(t, WriteSpecStateObject(e.Root, "upload", state, nil))
	require.NoError(t, os.WriteFile(specFilePath(e.Root, "upload"),
		[]byte("## Tasks\n\n- [x] task-1: Store files\n  Files: `a.go`, b.go\n- [ ] task-2: Show progress\n"), 0o600))

	summary := GetSpecSummary(e, "upload")

	assert.Equal(t, PhaseExecuting, summary.Phase)
	assert.Equal(t, "Spec upload", summary.Description)
	assert.Equal(t, []DashboardTask{
		{ID: "task-1", Description: "Store files", Done: true, Files: []string{"a.go", "b.go"}},
		{ID: "task-2", Description: "Show progress", Done: false, Files: nil},
	}, summary.Tasks)
	assert.Equal(t, []string{"Ada", "Bob"}, summary.Contributors)
	assert.Equal(t, []DashboardQuestion{{ID: "note-1", Text: "Which bucket?", User: "Ada", TS: "t1"}}, summary.PendingQuestions)
	assert.Equal(t, "2026-01-01T00:00:00.000Z", summary.CreatedAt)
	assert.Equal(t, "2026-02-01T00:00:00.000Z", summary.UpdatedAt)
	require.NotNil(t, summary.AvgConfidence)
	assert.InDelta(t, 6.3, *summary.AvgConfidence, 1e-9)
	assert.Equal(t, 1, summary.LowConfidenceItems)
	assert.Equal(t, "IDLE → DISCOVERY → REVIEW → DRAFT → APPROVED → [ EXECUTING ] → DONE → IDLE", summary.Roadmap)
}

func TestGetSpecSummaryOfASpecWithoutState(t *testing.T) {
	t.Parallel()

	e := dashboardEnv(t)
	require.NoError(t, os.MkdirAll(filepath.Join(e.Root, specsDir, "bare"), 0o750))

	summary := GetSpecSummary(e, "bare")

	assert.Equal(t, PhaseIdle, summary.Phase)
	assert.Equal(t, "2026-10-25T12:00:00.000Z", summary.CreatedAt)
	assert.Nil(t, summary.AvgConfidence)
	assert.Equal(t, []DashboardTask{}, summary.Tasks)
	assert.Equal(t, []any{}, summary.Delegations)
}

func TestGetSpecSummaryOfASpecThatLivesInTheActiveState(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name        string
		activeSpec  string
		phase       string
		description string
	}{
		{name: "the active state names the spec", activeSpec: "active-only", phase: PhaseDiscovery, description: "Lives in state.json"},
		{name: "the active state names another spec", activeSpec: "busy", phase: PhaseIdle, description: ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			e := dashboardEnv(t)
			require.NoError(t, os.MkdirAll(filepath.Join(e.Root, specsDir, "active-only"), 0o750))

			active, err := startSpecState(InitialState(), tc.activeSpec, "spec/"+tc.activeSpec, "Lives in state.json")
			require.NoError(t, err)
			require.NoError(t, WriteStateObject(e.Root, active))

			summary := GetSpecSummary(e, "active-only")

			assert.Equal(t, tc.phase, summary.Phase)
			assert.Equal(t, tc.description, summary.Description)
		})
	}
}

func TestDashboardRoadmapMapsEveryPhase(t *testing.T) {
	t.Parallel()

	cases := map[string]string{
		PhaseDiscoveryRefinement: "[ REVIEW ]",
		PhaseSpecProposal:        "[ DRAFT ]",
		PhaseSpecApproved:        "[ APPROVED ]",
		PhaseBlocked:             "[ EXECUTING ]",
		PhaseCompleted:           "[ DONE ]",
	}

	for phase, marked := range cases {
		assert.Contains(t, dashboardRoadmap(phase), marked, phase)
	}

	// IDLE is both ends of the line, and both are marked.
	assert.Equal(t, 2, strings.Count(dashboardRoadmap(PhaseIdle), "[ IDLE ]"))
}

func TestGetDashboardStateOrdersSpecsAndFindsPendingItems(t *testing.T) {
	t.Parallel()

	e := dashboardEnv(t)
	writeDashboardSpec(t, e.Root, "done-one", PhaseCompleted)
	writeDashboardSpec(t, e.Root, "live-one", PhaseDiscovery)
	require.NoError(t, os.MkdirAll(filepath.Join(e.Root, specsDir, "dir-only"), 0o750))

	for _, event := range []*JSObject{
		JSObjectOf("ts", "1", "type", "mention", "spec", "live-one", "user", "Ada", "id", "m-1", "question", "Q1"),
		JSObjectOf("ts", "2", "type", "mention", "spec", "live-one", "user", "Bob", "from", "Bob", "id", "m-2", "question", "Q2"),
		JSObjectOf("ts", "3", "type", "mention-reply", "spec", "live-one", "user", "Ada", "mentionId", "m-1"),
		JSObjectOf("ts", "4", "type", "signoff", "spec", "live-one", "user", "Ada", "role", "qa", "status", "pending"),
		JSObjectOf("ts", "5", "type", "signoff", "spec", "live-one", "user", "Ada", "role", "qa", "status", "signed"),
	} {
		require.NoError(t, AppendDashboardEvent(e.Root, event))
	}

	state := GetDashboardState(t.Context(), e)

	names := make([]string, 0, len(state.Specs))
	for _, spec := range state.Specs {
		names = append(names, spec.Name)
	}

	assert.Equal(t, "live-one", names[0])
	assert.ElementsMatch(t, []string{"live-one", "done-one", "dir-only"}, names)
	require.NotNil(t, state.ActiveSpec)
	assert.Equal(t, "live-one", state.ActiveSpec.Name)
	assert.Len(t, state.RecentEvents, 5)
	assert.Equal(t, "5", state.RecentEvents[0].str("ts"))
	assert.Equal(t, []DashboardMention{{ID: "m-2", Spec: "live-one", From: "Bob", To: "", Question: "Q2", Status: "pending", TS: "2"}},
		state.PendingMentions)
	assert.Equal(t, []DashboardPendingSignoff{{Spec: "live-one", Role: "qa", Status: "pending", TS: "4"}}, state.PendingSignoffs)
	assert.Equal(t, &DashboardUser{Name: "Unknown User", Email: ""}, state.CurrentUser)
	assert.Nil(t, state.Roles)
}

func TestDashboardApproveRecordsTheTransitionAndAnEvent(t *testing.T) {
	t.Parallel()

	e := dashboardEnv(t)
	writeDashboardSpec(t, e.Root, "approve-web", PhaseSpecProposal)

	require.NoError(t, DashboardApprove(t.Context(), e, "approve-web", &User{Name: "Tester", Email: "t@test.com"}))

	state := ReadSpecStateObject(e.Root, "approve-web", nil)
	assert.Equal(t, PhaseSpecApproved, phaseOf(state))

	history := objectsOf(state.arr("transitionHistory"))
	require.Len(t, history, 1)
	assert.Equal(t, "Tester", history[0].str("user"))

	events := ReadDashboardEvents(e.Root, 0, "")
	require.Len(t, events, 1)
	assert.JSONEq(t,
		`{"ts":"2026-10-25T12:00:00.000Z","type":"phase-change","spec":"approve-web","user":"Tester","from":"SPEC_PROPOSAL","to":"SPEC_APPROVED"}`,
		events[0].String())
}

func TestDashboardActionsRejectTheWrongPhase(t *testing.T) {
	t.Parallel()

	e := dashboardEnv(t)
	writeDashboardSpec(t, e.Root, "early", PhaseSpecProposal)

	err := DashboardComplete(t.Context(), e, "early", nil)
	rejection, ok := IsDashboardRejection(err)
	require.True(t, ok, err)
	assert.Equal(t, "Cannot complete in phase: SPEC_PROPOSAL", rejection.Message)

	writeDashboardSpec(t, e.Root, "running", PhaseExecuting)

	err = DashboardApprove(t.Context(), e, "running", nil)
	rejection, ok = IsDashboardRejection(err)
	require.True(t, ok, err)
	assert.Equal(t, "Cannot approve in phase: EXECUTING", rejection.Message)
	assert.Empty(t, ReadDashboardEvents(e.Root, 0, ""))
}

func TestDashboardActionsOnAMissingSpecAreFaults(t *testing.T) {
	t.Parallel()

	e := dashboardEnv(t)

	err := DashboardApprove(t.Context(), e, "missing-spec", nil)

	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrSpecNotFound))

	_, rejected := IsDashboardRejection(err)
	assert.False(t, rejected)
}

func TestDashboardQuestionAndReply(t *testing.T) {
	t.Parallel()

	e := dashboardEnv(t)
	writeDashboardSpec(t, e.Root, "talk", PhaseDiscovery)
	ada := &User{Name: "Ada", Email: "ada@example.com"}

	require.NoError(t, DashboardAddNote(t.Context(), e, "talk", "first", ada))
	require.NoError(t, DashboardAddQuestion(t.Context(), e, "talk", "Which bucket?", ada))

	state := GetDashboardState(t.Context(), e)
	require.Len(t, state.PendingMentions, 1)

	mention := state.PendingMentions[0]
	assert.Equal(t, "mention-"+"1792929600000", mention.ID)
	assert.Equal(t, "Ada", mention.From)

	require.NoError(t, DashboardReplyMention(t.Context(), e, "talk", mention.ID, "The shared one", nil))
	assert.Empty(t, GetDashboardState(t.Context(), e).PendingMentions)

	notes := objectsOf(ReadSpecStateObject(e.Root, "talk", nil).arr("specNotes"))
	require.Len(t, notes, 3)
	assert.Equal(t, "note-1", notes[0].str("id"))
	assert.Equal(t, "[QUESTION] Which bucket?", notes[1].str("text"))
	assert.Equal(t, "[REPLY:"+mention.ID+"] The shared one", notes[2].str("text"))
	assert.Equal(t, "Unknown User", notes[2].str("user"))
	assert.Equal(t, PhaseDiscovery, notes[2].str("phase"))

	summary := GetSpecSummary(e, "talk")
	assert.Equal(t, []DashboardQuestion{{ID: "note-2", Text: "Which bucket?", User: "Ada", TS: "2026-10-25T12:00:00.000Z"}},
		summary.PendingQuestions)
}

func TestDashboardSignoffNeedsNoSpecState(t *testing.T) {
	t.Parallel()

	e := dashboardEnv(t)

	require.NoError(t, DashboardSignoff(t.Context(), e, "anything", &User{Name: "Rev", Email: ""}))

	events := ReadDashboardEvents(e.Root, 0, "")
	require.Len(t, events, 1)
	assert.Equal(t, "signed", events[0].str("status"))
	assert.Equal(t, "reviewer", events[0].str("role"))
}

func TestDashboardCompleteResetsTheActiveState(t *testing.T) {
	t.Parallel()

	e := dashboardEnv(t)
	writeDashboardSpec(t, e.Root, "finish", PhaseExecuting)
	require.NoError(t, os.WriteFile(specFilePath(e.Root, "finish"), []byte("# finish\n\n## Status: executing\n"), 0o600))

	require.NoError(t, DashboardComplete(t.Context(), e, "finish", nil))

	spec := ReadSpecStateObject(e.Root, "finish", nil)
	assert.Equal(t, PhaseCompleted, phaseOf(spec))
	assert.Equal(t, "done", spec.str("completionReason"))
	assert.Equal(t, PhaseIdle, phaseOf(ReadHookState(e.Root, nil)))

	document, err := os.ReadFile(specFilePath(e.Root, "finish"))
	require.NoError(t, err)
	assert.Contains(t, string(document), "## Status: completed")

	events := ReadDashboardEvents(e.Root, 0, "")
	require.Len(t, events, 1)
	assert.Equal(t, PhaseCompleted, events[0].str("to"))
}

func TestReadDashboardEventsFilters(t *testing.T) {
	t.Parallel()

	e := dashboardEnv(t)
	log := filepath.Join(e.Root, eventsFile)
	require.NoError(t, os.MkdirAll(filepath.Dir(log), 0o750))
	require.NoError(t, os.WriteFile(log, []byte(`{"ts":"a"}`+"\nnot json\n5\n"+`{"ts":"b"}`+"\n"+`{"ts":"c"}`+"\n"), 0o600))

	all := ReadDashboardEvents(e.Root, 0, "")
	require.Len(t, all, 3)
	assert.Equal(t, "c", all[0].str("ts"))

	limited := ReadDashboardEvents(e.Root, 1, "")
	require.Len(t, limited, 1)
	assert.Equal(t, "c", limited[0].str("ts"))

	since := ReadDashboardEvents(e.Root, 0, "a")
	assert.Len(t, since, 2)
}

func TestAppendDashboardEventKeepsConcurrentAppends(t *testing.T) {
	t.Parallel()

	e := dashboardEnv(t)

	const writers = 40

	var wg sync.WaitGroup
	for i := range writers {
		wg.Go(func() {
			assert.NoError(t, AppendDashboardEvent(e.Root, JSObjectOf("ts", "t", "spec", "spec-"+strconv.Itoa(i))))
		})
	}

	wg.Wait()

	events := ReadDashboardEvents(e.Root, 0, "")
	require.Len(t, events, writers)

	specs := map[string]bool{}
	for _, event := range events {
		specs[event.str("spec")] = true
	}

	assert.Len(t, specs, writers)
}

func TestDashboardEventTailReadsOnlyCompletedNewLines(t *testing.T) {
	t.Parallel()

	e := dashboardEnv(t)
	require.NoError(t, AppendDashboardEvent(e.Root, JSObjectOf("ts", "old")))

	tail := NewDashboardEventTail(e.Root)

	events, err := tail.Poll()
	require.NoError(t, err)
	assert.Empty(t, events)

	log := filepath.Join(e.Root, eventsFile)
	file, err := os.OpenFile(log, os.O_APPEND|os.O_WRONLY, 0o600) //nolint:gosec // G304: the test's own events log
	require.NoError(t, err)

	t.Cleanup(func() { _ = file.Close() })

	_, err = file.WriteString(`{"ts":"new-1"}` + "\n" + `{"ts":"par`)
	require.NoError(t, err)

	events, err = tail.Poll()
	require.NoError(t, err)
	require.Len(t, events, 1)
	assert.Equal(t, "new-1", events[0].str("ts"))

	_, err = file.WriteString(`tial"}` + "\n")
	require.NoError(t, err)

	events, err = tail.Poll()
	require.NoError(t, err)
	require.Len(t, events, 1)
	assert.Equal(t, "partial", events[0].str("ts"))

	// A rewrite that leaves the log shorter is not replayed from the start.
	require.NoError(t, os.WriteFile(log, []byte(`{"ts":"x"}`+"\n"), 0o600))

	events, err = tail.Poll()
	require.NoError(t, err)
	assert.Empty(t, events)
}

func TestDashboardEventTailOfAMissingLog(t *testing.T) {
	t.Parallel()

	e := dashboardEnv(t)
	tail := NewDashboardEventTail(e.Root)

	events, err := tail.Poll()
	require.NoError(t, err)
	assert.Empty(t, events)

	require.NoError(t, AppendDashboardEvent(e.Root, JSObjectOf("ts", "first")))

	events, err = tail.Poll()
	require.NoError(t, err)
	require.Len(t, events, 1)
	assert.Equal(t, "first", events[0].str("ts"))
}
