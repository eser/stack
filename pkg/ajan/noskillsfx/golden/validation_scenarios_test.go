// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package golden

// The validator step of `next` (TASK-258.1, TASK-164): the --validate notice
// in a phase with nothing to check, the manifest's validate entry with an
// agent no provider has, the stored result repeated, --validate running it
// again, every kind of unusable entry, and both validated transitions. No
// step reaches a model, so the recording is the same on every machine.

const (
	validateEntry = "  validate:\n    agent: bogus\n    model: some-model\n"
	allAnswers    = `{"status_quo":"They share one account and pass the password around in chat.",` +
		`"ambition":"1-star: a form that checks a password. 10-star: passwordless sign-in with magic links.",` +
		`"reversibility":"It is reversible: the old shared account stays until everyone moved.",` +
		`"user_impact":"Every user signs in once with their own account instead of the shared one.",` +
		`"verification":"Unit tests for the session endpoint\nAn end-to-end test of the login form",` +
		`"scope_boundary":"No social login. No password reset flow in this spec."}`
)

func validationSteps() []step {
	spec := func(args ...string) []string { return append([]string{"spec", "add-login-page"}, args...) }
	next := func(args ...string) []string { return spec(append([]string{"next"}, args...)...) }

	return []step{
		{Args: []string{"init", "--non-interactive"}, Env: fixedTools(), Stderr: true},
		{Args: []string{"spec", "new", "add a login page"}},
		// 2: nothing to check in DISCOVERY
		{Args: next("--validate"), Stderr: true},
		{Args: next("--answer=Users sign in with an email and a password")},
		{Args: next("--answer=validate")},
		{Args: next("--answer=" + premisesAnswer)},
		{Args: next("--agent", "--answer="+allAnswers), Stderr: true},
		// 7: the end of discovery without and with the manifest entry
		{Args: next(), Stderr: true},
		{Args: next(), Before: appendToFile(manifestPath, validateEntry), Stderr: true},
		{Args: next(), Stderr: true},
		{Args: next("--validate"), Stderr: true},
		// 11: entries the validator cannot use
		{Args: next(), Before: replaceInFile(manifestPath, "agent: bogus", `agent: "  "`), Stderr: true},
		{Args: next(), Before: replaceInFile(manifestPath, "    agent: \"  \"\n", ""), Stderr: true},
		{Args: next(), Before: replaceInFile(manifestPath, "    model: some-model\n", "    agent: bogus\n    model: [a]\n"), Stderr: true},
		{Args: next(), Before: replaceInFile(manifestPath, "  validate:\n    agent: bogus\n    model: [a]\n", "  validate: 3\n"), Stderr: true},
		{Args: next(), Before: replaceInFile(manifestPath, "  validate: 3\n", "  validate: [x]\n"), Stderr: true},
		{Args: next(), Before: replaceInFile(manifestPath, "  validate: [x]\n", "  validate:\n"), Stderr: true},
		// 17: back to the bogus agent, through refinement to the proposal
		{Args: next(), Before: replaceInFile(manifestPath, "  validate:\n", validateEntry), Stderr: true},
		{Args: next("--answer=" + completenessAnswer), Stderr: true},
		{Args: next("--answer=b"), Stderr: true},
		{Args: next("--answer=" + ceoReviewAnswer), Stderr: true},
		{Args: next("--answer=approve"), Stderr: true},
		// The completeness gate refuses with a stack trace in TypeScript.
		{Args: next("--answer=skip")},
		{Args: spec("approve"), Before: markOpenSectionsNA},
		// 24: the spec proposal
		{Args: next(), Stderr: true},
		{Args: next(), Stderr: true},
		{Args: next("--validate", `--answer={"refinement":"task-1: Add the login form, task-2: Add the session endpoint"}`), Stderr: true},
		{Args: next("--validate"), Stderr: true},
		{Args: spec("approve")},
		// 29: nothing to check once approved
		{Args: next("--validate"), Stderr: true},
	}
}

func validationScenarios() []scenario {
	return []scenario{
		{
			name:       "next_validation",
			setup:      withToolDirs(".claude"),
			steps:      validationSteps(),
			nativeFrom: 0,
			portedBy:   "TASK-258.1",
			delta:      true,
		},
	}
}
