// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package golden

import (
	"os"
	"path/filepath"
	"testing"
)

// The scenarios of TASK-259: the state commands (rule, concern, learn,
// ledger, pack, sync) and purge with the selective restore of TASK-167.
// Every step runs in Go at replay time.

// appendToFile adds text at the end of a project file.
func appendToFile(rel, text string) func(t *testing.T, project string) {
	return func(t *testing.T, project string) {
		t.Helper()

		path := filepath.Join(project, filepath.FromSlash(rel))

		data, err := os.ReadFile(path) //nolint:gosec // G304: a file of the test's own fixture
		if err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(path, append(data, text...), 0o600); err != nil { //nolint:gosec // G703: the fixture's own file
			t.Fatal(err)
		}
	}
}

func allTools() string {
	return "--tools=claude-code,cursor,kiro,copilot,windsurf,opencode,codex,copilot-cli"
}

// stateCommandSteps cover rule, concern, learn, ledger, pack and sync.
func stateCommandSteps() []step {
	learn := func(args ...string) []string { return append([]string{"spec", "add-login-page", "learn"}, args...) }

	return []step{
		{Args: []string{"init", "--non-interactive", allTools()}, Env: fixedTools(), Stderr: true},
		// 1: rules
		{Args: []string{"rule", "list"}},
		{Args: []string{"rule", "add", "Always", "write", "tests", "first"}},
		{Args: []string{"rule", "add", "--phases=EXECUTING, DISCOVERY", `--applies-to="*.ts",'src/'`, "Use strict types"}},
		{Args: []string{"rule", "list"}},
		{Args: []string{"rule", "promote"}},
		{Args: []string{"rule", "promote", "Prefer", "small", "functions"}},
		{Args: []string{"rule"}},
		{Args: []string{"rule", "add", "--phases=EXECUTING"}},
		// 9: concerns
		{Args: []string{"concern", "list"}},
		{Args: []string{"concern", "list", "--json"}},
		{Args: []string{"concern", "add", "move-fast", "compliance", "no-such", "move-fast"}},
		{Args: []string{"concern", "add"}},
		{Args: []string{"concern", "remove", "compliance"}},
		{Args: []string{"concern", "remove", "compliance"}},
		{Args: []string{"concern", "add", "long-lived", "beautiful-product"}},
		{Args: []string{"concern", "list"}},
		{Args: []string{"concern"}},
		{Args: []string{"concern", "remove"}},
		// 19: learnings
		{Args: []string{"learn"}},
		{Args: []string{"spec", "new", "add a login page"}},
		{Args: learn("We", "assumed", "the", "API", "was", "stable")},
		{Args: learn("Always use the logger", "--type=success")},
		{Args: learn("A long learning text that goes well over sixty characters before it ends", "--severity=low")},
		{Args: learn("Worked well: pairing on the schema", "--type=bogus", "--severity=high")},
		{Args: []string{"learn", "remove", "2"}},
		{Args: []string{"learn", "remove", "9"}},
		{Args: []string{"learn", "remove", "x"}},
		{Args: []string{"learn", "promote", "1"}},
		{Args: []string{"learn", "promote", "7"}},
		{Args: learn("Never commit secrets", "--rule")},
		{Args: learn()},
		{Args: []string{"learn", "Top-level text without a spec"}},
		// 33: the decision ledger
		{Args: []string{"ledger"}},
		{Args: []string{"spec", "add-login-page", "ledger"}},
		{Args: []string{"ledger", "add-login-page", "--format=measurement-draft"}},
		{Args: []string{"ledger", "no-such-spec"}},
		// 37: packs
		{Args: []string{"pack"}},
		{Args: []string{"pack", "list"}},
		{Args: []string{"pack", "inspect", "typescript"}},
		{Args: []string{"pack", "inspect", "react"}},
		{Args: []string{"pack", "inspect", "no-such"}},
		{Args: []string{"pack", "inspect"}},
		{Args: []string{"pack", "install", "security"}},
		{Args: []string{"pack", "install", "security"}},
		{Args: []string{"pack", "install", "no-such"}},
		{Args: []string{"pack", "install"}},
		{Args: []string{"pack", "list"}},
		{Args: []string{"pack", "search", "TYPE"}},
		{Args: []string{"pack", "search", "zzz"}},
		{Args: []string{"pack", "search"}},
		{Args: []string{"pack", "uninstall", "security"}},
		{Args: []string{"pack", "uninstall", "security"}},
		{Args: []string{"pack", "uninstall"}},
		{
			Args: []string{"pack", "search", "react"},
			Before: appendToFile(".eser/manifest.yml",
				"  packRegistry: http://169.254.169.254/registry.json\n"),
		},
		// 55: sync, which runs init again
		{Args: []string{"sync"}, Env: fixedTools()},
		{Args: []string{"rule", "list"}},
	}
}

// purgeSteps cover purge and the selective restore: the refusals, the
// history, a restore by category, a refused overwrite and --overwrite,
// --no-history and the history limit.
func purgeSteps() []step {
	restore := func(args ...string) []string { return append([]string{"purge", "restore"}, args...) }

	oldEntries := map[string]string{}
	for _, day := range []string{"01", "02", "03", "04", "05"} {
		oldEntries[".eser/.state/purge-history/2020-01-"+day+"T00-00-00-000Z/rules/.eser/rules/old.md"] = "Old rule " + day + "\n"
	}

	oldEntries[".eser/rules/fresh.md"] = "A fresh rule\n"

	return []step{
		{Args: []string{"init", "--non-interactive", "--tools=claude-code,kiro,codex,opencode,copilot-cli"}, Env: fixedTools(), Stderr: true},
		{Args: []string{"spec", "new", "add a login page"}},
		{Args: []string{"concern", "add", "move-fast"}},
		{Args: []string{"rule", "add", "Always write tests first"}},
		// 4: what purge refuses or asks
		{Args: []string{"purge"}},
		{Args: []string{"purge", "--agent"}, Stderr: true},
		{Args: []string{"purge", "--bogus", "extra"}},
		{Args: restore(), Stderr: true},
		// 8: purge with history, then nothing left
		{Args: []string{"purge", "--force"}},
		{Args: []string{"purge", "--force"}},
		// 10: selective restore
		{Args: restore("--agent"), Stderr: true},
		{Args: restore("latest", "rules", "concerns", "rules"), Stderr: true},
		{Args: restore("latest", "rules"), Stderr: true},
		{Args: restore("latest", "rules", "--overwrite"), Stderr: true},
		{Args: restore("latest", "no-such-category"), Stderr: true},
		{Args: restore("2000-01-01T00-00-00-000Z"), Stderr: true},
		{Args: restore("latest", "--bogus"), Stderr: true},
		{Args: restore("latest", "agent-integration"), Stderr: true},
		{Args: restore("latest", "specs"), Stderr: true},
		{Args: restore("latest", "manifest", "agent-integration"), Stderr: true},
		{Args: []string{"spec", "list"}},
		{Args: restore("latest"), Stderr: true},
		// 22: without history, then the history limit
		{Args: []string{"purge", "--force", "--no-history"}},
		{Args: []string{"purge", "--force"}, Write: oldEntries},
		{Args: restore(), Stderr: true},
	}
}

func stateScenarios() []scenario {
	return []scenario{
		{
			name:       "state_commands",
			setup:      withToolDirs(".claude"),
			steps:      stateCommandSteps(),
			nativeFrom: 0,
			portedBy:   "TASK-259",
			delta:      true,
		},
		{
			name:  "init_active_spec",
			setup: withToolDirs(".claude"),
			steps: []step{
				{Args: []string{"init", "--non-interactive"}, Env: fixedTools(), Stderr: true},
				{Args: []string{"spec", "new", "add a login page"}},
				{Args: []string{"init"}, Env: fixedTools()},
				{Args: []string{"init", "--non-interactive", "--human"}, Env: fixedTools(), Stderr: true},
			},
			nativeFrom: 0,
			portedBy:   "TASK-259",
			delta:      true,
		},
		{
			name:       "purge_selective",
			setup:      withToolDirs(".claude"),
			steps:      purgeSteps(),
			nativeFrom: 0,
			portedBy:   "TASK-259",
			delta:      true,
		},
	}
}
