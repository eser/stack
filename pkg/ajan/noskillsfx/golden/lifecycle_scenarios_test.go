// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package golden

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The lifecycle scenarios (TASK-258) take one spec from `spec new` through
// discovery, refinement, approval and execution to `done`, with the error
// answers on the way. Two places need a state no command reaches: the
// completeness gate wants every spec section resolved, and only some of them
// are filled by discovery answers, so a step marks the rest N/A in the state
// files (spec_sections resolves them with `spec <name> section` instead);
// and the verification command comes from the manifest.

const (
	specStatePath  = ".eser/.state/progresses/specs/add-login-page.json"
	globalState    = ".eser/.state/progresses/state.json"
	manifestPath   = ".eser/manifest.yml"
	naReason       = "Not needed for a change this small"
	premisesAnswer = `{"premises":[{"text":"Every user has an email address","agreed":true},` +
		`{"text":"A password is enough to sign in","agreed":false,"revision":"Add a second factor later"}]}`
	partialAnswers = `{"status_quo":"They share one account and pass the password around in chat.",` +
		`"ambition":"1-star: a form that checks a password. 10-star: passwordless sign-in with magic links."}`
	restAnswers = `{"user_impact":"Every user signs in once with their own account instead of the shared one.",` +
		`"verification":"Unit tests for the session endpoint\nAn end-to-end test of the login form",` +
		`"scope_boundary":"No social login. No password reset flow in this spec."}`
	completenessAnswer = `{"completeness":{"overall":6,"dimensions":[{"id":"problem-clarity","score":7,` +
		`"notes":"clear"}],"gaps":["no rate limiting"],"assessedAt":"2026-01-01T00:00:00.000Z"}}`
	ceoReviewAnswer = `{"ceoReview":{"overall":8,"dimensions":[],"verdict":"approved"},"reflection":"Clear scope."}`
)

// replaceInFile rewrites a project file with every old replaced by new; the
// step fails when old is not there.
func replaceInFile(rel, old, replacement string) func(t *testing.T, project string) {
	return func(t *testing.T, project string) {
		t.Helper()

		path := filepath.Join(project, filepath.FromSlash(rel))

		data, err := os.ReadFile(path) //nolint:gosec // G304: a file of the test's own fixture
		if err != nil {
			t.Fatal(err)
		}

		if !strings.Contains(string(data), old) {
			t.Fatalf("%s holds no %q", rel, old)
		}

		if err := os.WriteFile(path, []byte(strings.ReplaceAll(string(data), old, replacement)), 0o600); err != nil { //nolint:gosec // G703: a file of the test's own fixture
			t.Fatal(err)
		}
	}
}

// markOpenSectionsNA marks every open spec section N/A in the per-spec and
// global state, as the completeness gate accepts it.
func markOpenSectionsNA(t *testing.T, project string) {
	t.Helper()

	markSectionsNA("add-login-page")(t, project)
}

func markSectionsNA(spec string) func(t *testing.T, project string) {
	return func(t *testing.T, project string) {
		t.Helper()

		na := `"status": "na",` + "\n        " + `"naReason": "` + naReason + `"`
		for _, rel := range []string{".eser/.state/progresses/specs/" + spec + ".json", globalState} {
			replaceInFile(rel, `"status": "placeholder"`, na)(t, project)
		}
	}
}

// inBothStates replaces text in the spec's per-spec and global state.
func inBothStates(spec, old, replacement string) func(t *testing.T, project string) {
	return func(t *testing.T, project string) {
		t.Helper()

		for _, rel := range []string{".eser/.state/progresses/specs/" + spec + ".json", globalState} {
			replaceInFile(rel, old, replacement)(t, project)
		}
	}
}

const (
	concernsAnswers = `{"status_quo":"(1) Users email support to change their settings. (2) Admins edit the database by hand.",` +
		`"ambition":"1-star: a plain form. 10-star: a settings page with live validation and an audit trail.",` +
		`"reversibility":"Reversible: the old support flow stays available behind a flag for a month.",` +
		`"user_impact":"Every user gets a settings page; nothing breaks for current users.",` +
		`"verification":"- Unit tests for the form validation\n- An end-to-end test of saving settings",` +
		`"scope_boundary":"No billing settings. No team management in this spec."}`
	settingsRefinement = `{"refinement":"task-1: Build the settings form\nFiles: ` + "`src/settings.tsx`, `src/form.ts`" +
		`\ntask-2: Save the settings, task-3: Add the audit log"}`
	failingVerify = "verifyCommand: echo broken >&2; exit 1"
	gateClear     = `{"completed":[],"remaining":[],"blocked":[]}`
)

// concernsSteps take a spec through the paths the active concerns open:
// scoped sections the classification reveals, a split proposal, the review
// postures and the project default, the tension gate, a failing
// verification, debt, a block and the review gate.
func concernsSteps() []step {
	spec := func(args ...string) []string { return append([]string{"spec", "settings-page"}, args...) }
	next := func(args ...string) []string { return spec(append([]string{"next"}, args...)...) }
	session := map[string]string{".eser/.state/sessions/s1.json": `{"id":"s1","spec":"settings-page","mode":"spec","phase":"DISCOVERY","pid":1,"startedAt":"<TIME>","lastActiveAt":"<TIME>","tool":"claude-code"}`}

	return []step{
		{Args: []string{"init", "--non-interactive", "--concerns=beautiful-product,move-fast,long-lived,compliance"}},
		{Args: []string{"spec", "new", "--name=settings-page", "Add a settings page with a form for user data"}},
		{Args: next("--answer=We keep personal data and the page needs a responsive layout")},
		{Args: next("--answer=ship-fast")},
		{Args: next()},
		{Args: next(`--answer={"premises":[{"text":"Users want to change their own settings","agreed":true}]}`)},
		// 6: agent mode, a follow-up to skip, all answers at once
		{Args: next("--agent"), Env: map[string]string{"NOSKILLS_SESSION": "s1"}, Write: session},
		{Args: spec("followup", "ambition", "Is there a deadline for the 10-star version?")},
		{Args: spec("followup", "nope", "--answer=An answer to no follow-up at all.")},
		{Args: next("--agent", "--answer="+concernsAnswers)},
		{Args: spec("followup", "ambitiona", "--skip")},
		// 11: refinement with a posture, a revision, the project default
		{Args: next()},
		{Args: next(`--answer={"posture":"c","completeness":{"overall":5,"dimensions":[],"gaps":[],"assessedAt":"2026-01-01T00:00:00.000Z"}}`)},
		{Args: next(`--answer={"revise":{"scope_boundary":"No billing settings and no team management in this spec."}}`)},
		{Args: next("--answer=save-posture")},
		{Args: next(`--answer={"ceoReview":{"overall":7,"dimensions":[],"verdict":"needs-work"}}`)},
		{Args: next("--answer=revise")},
		{Args: next(`--answer={"completeness":{"overall":8,"dimensions":[],"gaps":[],"assessedAt":"2026-01-01T00:00:00.000Z"}}`)},
		{Args: next("--answer=clear-posture")},
		{Args: next("--answer=approve")},
		{Args: next()},
		{Args: next("--answer=keep"), Before: markSectionsNA("settings-page")},
		// 22: the proposal and execution
		{Args: next()},
		{Args: next("--answer=" + settingsRefinement)},
		{Args: spec("approve")},
		{Args: next("--answer=start")},
		{
			Args:   next(`--answer={"completed":["task-1","task-2"]}`),
			Before: replaceInFile(manifestPath, "verifyCommand: null", failingVerify),
		},
		{Args: next()},
		{
			Args:   next(`--answer={"completed":["task-1","task-2"]}`),
			Before: replaceInFile(manifestPath, failingVerify, "verifyCommand: echo ok"),
		},
		{Args: next()},
		{Args: next(`--answer={"completed":["ac-1"],"remaining":["ac-2"],"na":["mandatory-docs"]}`)},
		{Args: next(`--answer={"completed":["ac-1"],"remaining":["ac-2"],"blocked":[],"newIssues":["The form loses focus on save"]}`)},
		{Args: next()},
		{Args: next("--answer=Fixed the focus bug")},
		{Args: next(`--answer={"completed":["debt-1","ac-2"],"remaining":[],"blocked":[]}`)},
		// 35: a block, then the remaining tasks and the review gate
		{Args: next(), Before: inBothStates("settings-page", `"phase": "EXECUTING"`, `"phase": "BLOCKED"`)},
		{Args: next("--answer=Use the existing audit table")},
		{Args: next(`--answer={"completed":["task-2","task-3"]}`)},
		{Args: next("--answer=" + gateClear)},
		{Args: next()},
		{Args: next(`--answer={"completed":["gate-x"],"remaining":["gate-y"]}`)},
		{Args: next("--answer=" + gateClear)},
		{Args: next("--answer=" + gateClear)},
		{Args: next("--answer=" + gateClear)},
		{Args: next("--answer=" + gateClear)},
		{Args: next()},
		{Args: spec("done")},
		{Args: []string{"next"}},
	}
}

// specNewSteps cover the arguments spec new refuses and the plan import.
func specNewSteps() []step {
	plan := "# Plan\n\n## Goal\n\nLet users export their data as CSV from the account page, with a progress bar and an email when it is ready.\n"

	return []step{
		{Args: []string{"next"}},
		{Args: []string{"status"}},
		{Args: []string{"spec", "new", "export data"}},
		{Args: []string{"init", "--agent"}, Env: map[string]string{"PATH": "<HOME>/bin", "NOSKILLS_CLI_PREFIX": "noskills"}},
		{Args: []string{"spec", "new"}},
		{Args: []string{"spec", "new", "Bad_Name", "a description"}},
		{Args: []string{"spec", "new", "list", "a description"}},
		{Args: []string{"spec", "new", "my-spec"}},
		{Args: []string{"spec", "new", "--from-plan=missing.md", "export data"}},
		{Args: []string{"spec", "new", "Export the account data as CSV"}, Write: map[string]string{"plan.md": plan}},
		{Args: []string{"spec", "new", "Export the account data as CSV"}},
		{Args: []string{"spec", "export-account-data-csv", "next"}},
		{Args: []string{"spec", "export-account-data-csv", "next", "--answer=import-plan"}},
		{Args: []string{"spec", "export-account-data-csv", "next"}},
		{Args: []string{"spec", "new", "--from-plan=plan.md", "Import the account data from CSV"}},
		{Args: []string{"spec", "import-account-data-csv", "next"}},
		{Args: []string{"spec", "help"}},
		{Args: []string{"spec", "import-account-data-csv", "bogus"}},
		{Args: []string{"spec", "list"}},
		{Args: []string{"next"}},
	}
}

func lifecycleSteps() []step {
	spec := func(args ...string) []string { return append([]string{"spec", "add-login-page"}, args...) }
	next := func(args ...string) []string { return spec(append([]string{"next"}, args...)...) }

	return []step{
		{Args: []string{"init"}},
		// 1: spec new and the commands that need a spec name
		{Args: []string{"spec", "new", "add a login page"}},
		{Args: []string{"next"}},
		{Args: []string{"approve"}},
		{Args: []string{"spec", "no-such-spec", "next"}},
		{Args: []string{"spec", "new", "add-login-page", "add a login page"}},
		// 6: listen, mode, premises
		{Args: next()},
		{Args: next("--answer=Users sign in with an email and a password")},
		{Args: next("--answer=validate")},
		{Args: next("--answer=not json")},
		{Args: next("--answer=" + premisesAnswer)},
		// 11: the base questions, human and agent, and a follow-up
		{Args: next()},
		{Args: next("--agent")},
		{Args: spec("followup", "status_quo", "Which browsers must the login page support?")},
		{Args: next("--agent", "--answer="+partialAnswers)},
		{Args: next("--answer=It is reversible: the old shared account stays until everyone moved.")},
		{Args: next("--answer=short")},
		{Args: next(`--answer={"bogus":"an answer to no question"}`)},
		{Args: next("--agent", "--answer="+restAnswers)},
		{Args: next("--agent")},
		{Args: spec("followup", "status_quoa", "--answer=The latest two versions of Chrome, Firefox and Safari.")},
		// 21: refinement stages a, b and c, then the alternatives
		{Args: next()},
		{Args: []string{"status"}},
		{Args: next("--answer=" + completenessAnswer)},
		{Args: next("--answer=b")},
		{Args: next()},
		{Args: next("--answer=" + ceoReviewAnswer)},
		{Args: next()},
		{Args: next("--answer=approve")},
		{Args: next()},
		{Args: next("--answer=skip")},
		// 31: the completeness gate, then approve to SPEC_PROPOSAL
		{Args: spec("approve")},
		{Args: spec("approve"), Before: markOpenSectionsNA},
		{Args: next()},
		{Args: next(`--answer={"refinement":"task-1: Add the login form, task-2: Add the session endpoint"}`)},
		{Args: next("--answer=save")},
		{Args: spec("approve")},
		{Args: next()},
		// 38: execution with a verification command
		{Args: next("--answer=start")},
		{Args: next()},
		{
			Args:   next("--answer=Implemented the login form"),
			Before: replaceInFile(manifestPath, "verifyCommand: null", "verifyCommand: echo verified"),
		},
		{Args: next()},
		{Args: spec("done")},
		{Args: next(`--answer={"completed":["ac-1"],"remaining":[],"blocked":[]}`)},
		{Args: next()},
		// 45: done, then the project at rest
		{Args: spec("done")},
		{Args: []string{"next"}},
		{Args: []string{"status"}},
		{Args: next()},
		{Args: spec()},
		{Args: []string{"spec", "list"}},
	}
}

// lifecycleScenarios are the lifecycle and init scenarios TASK-258 added.
func lifecycleScenarios() []scenario {
	// No provider binaries on PATH, so init detects none on any machine, and
	// the command the manifest records is the default one.
	noTools := map[string]string{"PATH": "<HOME>/bin", "NOSKILLS_CLI_PREFIX": "npx eser@latest noskills"}

	return []scenario{
		{
			name:       "lifecycle",
			setup:      withToolDirs(".claude"),
			steps:      lifecycleSteps(),
			nativeFrom: 1,
			portedBy:   "TASK-258",
			delta:      true,
		},
		{
			name:       "lifecycle_concerns",
			setup:      withToolDirs(".claude"),
			steps:      concernsSteps(),
			nativeFrom: 1,
			portedBy:   "TASK-259 (init depends on the providers of the recording machine)",
			delta:      true,
		},
		{
			name:       "spec_new",
			steps:      specNewSteps(),
			nativeFrom: 0,
			portedBy:   "TASK-258",
			delta:      true,
		},
		{
			name:  "init_tools",
			setup: withToolDirs(".claude"),
			steps: []step{
				{Args: []string{"init"}, Env: noTools},
				{Args: []string{"init", "--agent", "--concerns=beautiful-product"}, Env: noTools},
			},
			nativeFrom: 0,
			portedBy:   "TASK-258",
			delta:      true,
		},
		{
			name: "init_bare",
			steps: []step{
				{Args: []string{"init", "--non-interactive"}, Env: noTools},
				{Args: []string{"init", "--non-interactive", "--concerns=move-fast,open-source,no-such"}, Env: noTools},
				{Args: []string{"init", "--agent"}, Env: noTools},
				{Args: []string{"status"}},
				{Args: []string{"next"}},
			},
			nativeFrom: 0,
			portedBy:   "TASK-258",
			delta:      true,
		},
	}
}
