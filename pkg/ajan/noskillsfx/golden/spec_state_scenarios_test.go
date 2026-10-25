// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package golden

import (
	"os"
	"path/filepath"
	"testing"
)

// The scenarios of TASK-258.1: block, reset, cancel, wontfix, reopen, free,
// review and delegate, validate, plan-export, split (the command and the
// refinement answer), revisit, ac, task and note, the events log, the
// legacy layout migration, and -o markdown and text. Every step runs in Go
// at replay time.

// noProviders keeps init from detecting the coding tools of the machine
// that records, and records the default command in the manifest.
func noProviders() map[string]string {
	return map[string]string{"PATH": "<HOME>/bin", "NOSKILLS_CLI_PREFIX": "npx eser@latest noskills"}
}

// specStatesSteps take one spec through the commands that change its state
// outside the discovery flow, then split a second one by hand.
func specStatesSteps() []step {
	login := func(args ...string) []string { return append([]string{"spec", "add-login-page"}, args...) }
	areas := func(args ...string) []string { return append([]string{"spec", "two-areas", "split"}, args...) }

	return []step{
		{Args: []string{"init", "--non-interactive"}, Env: noProviders()},
		{Args: []string{"free"}},
		{Args: []string{"validate"}},
		{Args: []string{"block"}},
		{Args: []string{"spec", "new", "add a login page"}},
		// 5: refusals in DISCOVERY
		{Args: login("block", "no", "reason")},
		{Args: login("reset")},
		// 7: notes, tasks and ACs
		{Args: login("note")},
		{Args: login("note", "add")},
		{Args: login("note", "add", "Check", "the", "mobile", "layout")},
		{Args: login("note", "add", "--flag", "Ask design about the logo")},
		{Args: login("note", "list")},
		{Args: login("task", "add", "Write the migration first")},
		{Args: login("task", "list")},
		{Args: login("note", "list")},
		{Args: login("ac", "add", "The form shows an error for a wrong password")},
		{Args: login("ac", "list")},
		{Args: login("ac", "bogus")},
		{Args: []string{"spec", "no-such", "ac", "list"}},
		// 19: delegations and their review
		{Args: login("delegate")},
		{Args: login("delegate", "status_quo")},
		{Args: login("review")},
		{Args: login("delegate", "status_quo", "Unknown", "User")},
		{Args: login("delegate", "ambition", "Somebody", "Else")},
		{Args: login("review")},
		{Args: login("review", "--question=2", "--answer=Out of range")},
		{Args: login("review", "--question=1x", "--answer=They share one account and pass the password around.")},
		{Args: login("review")},
		{Args: []string{"spec", "no-such", "review"}},
		// 29: validate and plan-export
		{Args: []string{"validate", "add-login-page"}},
		{Args: []string{"validate", "no-such"}},
		{Args: login("plan-export"), Stderr: true},
		{Args: []string{"spec", "no-such", "plan-export"}, Stderr: true},
		// 33: revisit refusals
		{Args: login("revisit")},
		{Args: login("revisit", "--x", "The scope changed")},
		// 35: the markdown and text output
		{Args: []string{"spec", "list", "-o", "markdown"}},
		{Args: []string{"status", "-o", "text"}},
		{Args: []string{"status", "--spec=add-login-page", "--output=md"}},
		{Args: login("next", "-o", "markdown")},
		{Args: login("next", "-o", "text")},
		{Args: []string{"next", "-o", "text"}},
		{Args: []string{"ledger", "add-login-page", "-o", "markdown"}},
		{Args: login("ledger", "-o", "text")},
		{Args: []string{"ledger", "add-login-page", "--format=measurement-draft", "-o", "markdown"}},
		// 44: cancel, reopen, wontfix, reset
		{Args: login("cancel")},
		{Args: login("cancel")},
		{Args: login("revisit", "Changed my mind")},
		{Args: login("reopen")},
		{Args: login("reopen")},
		{Args: login("wontfix")},
		{Args: login("wontfix", "Out", "of", "budget", "this", "quarter")},
		{Args: login("next", "-o", "markdown")},
		{Args: []string{"reset", "--spec=add-login-page"}},
		{Args: []string{"reset", "--spec=add-login-page"}},
		{Args: []string{"status", "-o", "text"}},
		{Args: []string{"spec", "list", "-o", "text"}},
		{Args: []string{"cancel", "--spec=add-login-page"}},
		{Args: []string{"cancel"}},
		// 58: a manual split
		{Args: []string{"spec", "new", "--name=two-areas", "Fix the login form and build the admin dashboard"}},
		{Args: areas()},
		{Args: areas("--into", "one")},
		{Args: areas("--into", "Bad_Name", "x", "--into", "ok-name", "y", "--into", "new")},
		{Args: areas("--into", "child-a", "Login form", "--into", "child-a", "Again")},
		{Args: areas("--into", "add-login-page", "x", "--into", "child-b")},
		{Args: areas("--into", "child-a", "Fix the login form", "--into", "child-b")},
		{Args: []string{"spec", "list"}},
		{Args: []string{"spec", "child-a", "next", "-o", "text"}},
		{Args: areas("--into", "c", "d", "--into", "e", "f")},
		{Args: []string{"status"}},
	}
}

// specExecutionSteps take the lifecycle scenario's spec to SPEC_APPROVED,
// then export the plan, run it, block it and revisit it.
func specExecutionSteps() []step {
	login := func(args ...string) []string { return append([]string{"spec", "add-login-page"}, args...) }
	steps := lifecycleSteps()[:37]
	steps[0] = step{Args: []string{"init", "--non-interactive"}, Env: noProviders()}

	return append(steps,
		// 37: SPEC_APPROVED
		step{Args: login("plan-export")},
		step{Args: login("ac", "add", "Sessions expire after a day")},
		step{Args: login("note", "add", "Keep the old login until everyone moved")},
		step{Args: login("next", "--answer=start")},
		step{Args: login("plan-export")},
		step{Args: login("next", "-o", "markdown")},
		step{Args: login("next", "-o", "text")},
		step{Args: login("next", "--answer=Implemented the login form")},
		step{Args: login("next", "-o", "markdown")},
		step{Args: login("next", `--answer={"completed":["task-1"],"remaining":["task-2"],"blocked":[]}`)},
		step{Args: login("next", "-o", "text")},
		step{Args: login("plan-export")},
		// 49: refusals and warnings in EXECUTING
		step{Args: login("task", "add", "More work")},
		step{Args: login("ac", "add", "A late criterion")},
		step{Args: login("delegate", "status_quo", "Somebody")},
		step{Args: []string{"status", "--spec=add-login-page", "-o", "markdown"}},
		step{Args: login("wontfix", "--spec=other")},
		// 54: block, then revisit from BLOCKED
		step{Args: login("block", "Waiting", "for", "the", "API", "keys")},
		step{Args: []string{"status", "-o", "text"}},
		step{Args: login("next", "-o", "markdown")},
		step{Args: login("revisit", "The API changed under us")},
		step{Args: login()},
		step{Args: []string{"status", "-o", "text"}},
		step{Args: login("block")},
		step{Args: login("reset")},
		step{Args: login("plan-export"), Stderr: true},
		step{Args: login("next", "-o", "text")},
	)
}

const splitAnswers = `{"status_quo":"(1) Users email support to change their settings. (2) Admins edit the database by hand.",` +
	`"ambition":"1-star: a plain form. 10-star: a settings page with live validation and an audit trail.",` +
	`"reversibility":"Reversible: the old support flow stays available behind a flag for a month.",` +
	`"user_impact":"Every user gets a settings page; nothing breaks for current users.",` +
	`"verification":"- Unit tests for the form validation\n- An end-to-end test of saving settings",` +
	`"scope_boundary":"No billing settings. No team management in this spec."}`

// takenChild is a spec name the split detector gives the settings-page
// answers.
const takenChild = "admins-edit-database-hand"

// removeProjectDir removes a directory of the project.
func removeProjectDir(rel string) func(t *testing.T, project string) {
	return func(t *testing.T, project string) {
		t.Helper()

		if err := os.RemoveAll(filepath.Join(project, filepath.FromSlash(rel))); err != nil {
			t.Fatal(err)
		}
	}
}

// specSplitAnswerSteps answer "split" to a refinement whose answers name
// two areas.
func specSplitAnswerSteps() []step {
	next := func(args ...string) []string { return append([]string{"spec", "settings-page", "next"}, args...) }

	return []step{
		{Args: []string{"init", "--non-interactive"}, Env: noProviders()},
		{Args: []string{"spec", "new", "--name=settings-page", "Add a settings page for users and admins"}},
		{Args: next()},
		{Args: next("--answer=Users change their settings through support today")},
		{Args: next("--answer=validate")},
		{Args: next("--answer=" + premisesAnswer)},
		{Args: next("--agent", "--answer="+splitAnswers)},
		// 7: refinement
		{Args: next()},
		{Args: next("--answer=" + completenessAnswer)},
		{Args: next("--answer=b")},
		{Args: next("--answer=" + ceoReviewAnswer)},
		{Args: next("--answer=approve")},
		{Args: next("-o", "markdown")},
		{Args: []string{"spec", "settings-page", "split", "--into", "settings-page", "x", "--into", "y"}},
		// 14: a child name that is taken refuses the split answer
		{Args: next("--answer=split"), Write: map[string]string{".eser/specs/" + takenChild + "/notes.md": "taken\n"}},
		{Args: next("--answer=split", "-o", "text")},
		{Args: next("--answer=split"), Before: removeProjectDir(".eser/specs/" + takenChild)},
		{Args: next("-o", "text")},
		{Args: []string{"spec", "list"}},
		{Args: []string{"status"}},
		{Args: []string{"next"}},
	}
}

// legacyLayout turns the fixture back into the layout before
// .eser/.state/progresses: state.json and the spec states at the top of
// .eser/.state, the sessions and events beside it, and the old
// .gitignore.
func legacyLayout(t *testing.T, project string) {
	t.Helper()

	state := filepath.Join(project, ".eser", ".state")
	progresses := filepath.Join(state, "progresses")

	entries, err := os.ReadDir(progresses)
	if err != nil {
		t.Fatal(err)
	}

	for _, entry := range entries {
		if err := os.Rename(filepath.Join(progresses, entry.Name()), filepath.Join(state, entry.Name())); err != nil {
			t.Fatal(err)
		}
	}

	for _, dir := range []string{"progresses", "sessions", "events"} {
		if err := os.RemoveAll(filepath.Join(state, dir)); err != nil {
			t.Fatal(err)
		}
	}

	writeProjectFile(t, project, ".eser/.sessions/s1.json", `{"id":"s1","spec":null,"mode":"free","phase":"IDLE"}`+"\n")
	writeProjectFile(t, project, ".eser/.events/events.jsonl", `{"ts":"2026-01-01T00:00:00.000Z","type":"phase-change"}`+"\n")
	writeProjectFile(t, project, ".eser/.gitignore", ".state/\n.sessions/\n.events/\n")
}

// legacyConflict adds a legacy state.json beside the new layout.
func legacyConflict(t *testing.T, project string) {
	t.Helper()

	writeProjectFile(t, project, ".eser/.state/state.json", `{"phase":"IDLE"}`+"\n")
}

// legacyEventsOnly removes the conflict and moves the events folder back
// to its legacy place.
func legacyEventsOnly(t *testing.T, project string) {
	t.Helper()

	if err := os.Remove(filepath.Join(project, ".eser", ".state", "state.json")); err != nil {
		t.Fatal(err)
	}

	if err := os.Rename(filepath.Join(project, ".eser", ".state", "events"), filepath.Join(project, ".eser", ".events")); err != nil {
		t.Fatal(err)
	}

	writeProjectFile(t, project, ".eser/.events/old.jsonl", `{"type":"old"}`+"\n")
}

func legacySteps() []step {
	return []step{
		{Args: []string{"init", "--non-interactive"}, Env: noProviders()},
		{Args: []string{"spec", "new", "add a login page"}},
		{Args: []string{"status"}, Before: legacyLayout, Stderr: true},
		{Args: []string{"status"}, Stderr: true},
		{Args: []string{"spec", "add-login-page", "next", "-o", "text"}, Stderr: true},
		{Args: []string{"status"}, Before: legacyConflict},
		{Args: []string{"init", "--non-interactive"}, Env: noProviders(), Before: legacyEventsOnly, Stderr: true},
		{Args: []string{"spec", "list"}},
	}
}

const (
	uploadAnswers = `{"status_quo":"Users email their photos to support, who upload them by hand.",` +
		`"ambition":"1-star: a file input. 10-star: drag and drop with progress and retries.",` +
		`"reversibility":"Reversible: the email flow stays until everyone moved to the upload form.",` +
		`"user_impact":"Every user uploads their own photos instead of waiting for support.",` +
		`"verification":"Unit tests for the upload endpoint\nAn end-to-end test of the upload form",` +
		`"scope_boundary":"No video uploads. No photo editing in this spec."}`
	uploadPremises = `{"premises":[{"text":"Every user has a phone with a camera","agreed":true}]}`
	premisesNA     = "The premises step of discovery already covers them"
)

// specSectionsSteps take a spec from `spec new` through discovery to
// SPEC_PROPOSAL with commands only (TASK-325): the completeness gate
// refuses the sections no discovery answer fills, and `spec <name>
// section` resolves them.
func specSectionsSteps() []step {
	spec := func(args ...string) []string { return append([]string{"spec", "photo-upload"}, args...) }
	next := func(args ...string) []string { return spec(append([]string{"next"}, args...)...) }
	section := func(args ...string) []string { return spec(append([]string{"section"}, args...)...) }

	return []step{
		{Args: []string{"init", "--non-interactive"}, Env: noProviders()},
		{Args: []string{"spec", "new", "--name=photo-upload", "Let users upload photos from their phones"}},
		{Args: section()},
		// 3: discovery, all answers at once
		{Args: next()},
		{Args: next("--answer=Users email photos to support today")},
		{Args: next("--answer=validate")},
		{Args: next("--answer=" + uploadPremises)},
		{Args: next("--agent", "--answer="+uploadAnswers)},
		// 8: refinement, then the gate refuses the open sections
		{Args: next()},
		{Args: next("--answer=" + completenessAnswer)},
		{Args: next("--answer=b")},
		{Args: next("--answer=" + ceoReviewAnswer)},
		{Args: next("--answer=approve")},
		{Args: next("--answer=skip")},
		{Args: next()},
		{Args: spec("approve")},
		{Args: []string{"validate", "photo-upload"}},
		// 17: the section command and its refusals
		{Args: section("list")},
		{Args: section("summary")},
		{Args: section("summary", "fill")},
		{Args: section("summary", "na", "too short")},
		{Args: section("no-such", "fill", "Text")},
		{Args: section("summary", "fill", "Users upload their own photos from their phones instead of emailing support.")},
		{Args: section("summary", "fill", "Again")},
		{Args: section("premises", "na", premisesNA)},
		{Args: section("tasks", "fill", "- Add the upload endpoint\n- Add the upload form")},
		{Args: section("acceptance-criteria", "fill", "- The form uploads a photo under 10 MB", "- A larger photo gets an error")},
		{Args: []string{"spec", "no-such", "section", "list"}},
		// 28: the gate passes
		{Args: []string{"validate", "photo-upload"}},
		{Args: next()},
		{Args: spec("approve")},
		{Args: section("summary", "fill", "Too late")},
		{Args: section()},
		{Args: next()},
	}
}

func specStateScenarios() []scenario {
	return []scenario{
		{name: "spec_states", steps: specStatesSteps(), nativeFrom: 0, portedBy: "TASK-258.1", delta: true},
		{
			name:       "spec_execution",
			setup:      withToolDirs(".claude"),
			steps:      specExecutionSteps(),
			nativeFrom: 0,
			portedBy:   "TASK-258.1",
			delta:      true,
		},
		{name: "spec_split_answer", steps: specSplitAnswerSteps(), nativeFrom: 0, portedBy: "TASK-258.1", delta: true},
		{name: "legacy_layout", steps: legacySteps(), nativeFrom: 0, portedBy: "TASK-258.1", delta: true},
		{name: "spec_sections", steps: specSectionsSteps(), nativeFrom: 0, portedBy: "TASK-325", delta: true},
	}
}
