// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package golden

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func hookInput(tool string, input map[string]any) string {
	return hookPayload(map[string]any{"hook_event_name": "PreToolUse", "tool_name": tool, "tool_input": input})
}

// hookPayload is a hook's stdin JSON: the fields given plus the session id
// every tool sends.
func hookPayload(fields map[string]any) string {
	payload := map[string]any{"session_id": "golden-session"}
	for key, value := range fields {
		payload[key] = value
	}

	// No HTML escaping, so the <PROJECT> and <HOME> placeholders stay
	// readable for the harness to fill in.
	var b strings.Builder

	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(payload)

	return strings.TrimSuffix(b.String(), "\n")
}

func withToolDirs(dirs ...string) func(t *testing.T, project string) {
	return func(t *testing.T, project string) {
		t.Helper()

		for _, dir := range dirs {
			if err := os.MkdirAll(filepath.Join(project, dir), 0o750); err != nil {
				t.Fatal(err)
			}
		}
	}
}

// The state files the hook_events scenario writes to put the project in
// each phase, as the TypeScript CLI would leave them.
const (
	globalStateFile = ".eser/.state/progresses/state.json"

	stateIdleNamingSpec = `{
  "version": "0.1.0",
  "phase": "IDLE",
  "spec": "add-login-page",
  "branch": null,
  "lastCalledAt": null
}
`
	stateExecuting = `{
  "version": "0.1.0",
  "phase": "EXECUTING",
  "spec": null,
  "branch": null,
  "execution": {
    "iteration": 0,
    "lastProgress": null,
    "modifiedFiles": [],
    "criteriaScope": null
  },
  "lastCalledAt": null,
  "classification": null
}
`
	stateDiscoveryQuestions = `{
  "version": "0.1.0",
  "phase": "DISCOVERY",
  "spec": "add-login-page",
  "specDescription": "add a login page",
  "discovery": {
    "answers": [
      {
        "questionId": "status_quo",
        "answer": "They share one account today."
      }
    ],
    "mode": "full",
    "premisesCompleted": true,
    "planPath": null
  }
}
`
	stateIdle = `{
  "version": "0.1.0",
  "phase": "IDLE",
  "spec": null,
  "branch": null,
  "execution": {
    "iteration": 2,
    "lastProgress": null
  },
  "lastCalledAt": null
}
`
	stateDiscoveryNoSpec = `{
  "version": "0.1.0",
  "phase": "DISCOVERY",
  "spec": null
}
`
	sessionFree     = `{"id":"s1","spec":null,"mode":"free","phase":null,"pid":1,"startedAt":"2026-01-01T00:00:00.000Z","lastActiveAt":"2026-01-01T00:00:00.000Z","tool":"claude-code"}`
	sessionProposal = `{"id":"s2","spec":null,"mode":"spec","phase":"SPEC_PROPOSAL","pid":1,"startedAt":"2026-01-01T00:00:00.000Z","lastActiveAt":"2026-01-01T00:00:00.000Z","tool":"claude-code"}`
	tsRule          = "---\napplies_to: [\"*.ts\"]\n---\nUse strict types in TypeScript files.\n"
	srcFolderRules  = "# Rules for src\n- Keep handlers small\n* Log through the logger\n"
	deployScript    = "#!/bin/sh\ngit push origin main\n"
)

// hookEventsSteps cover the hook path the hooks scenario leaves out: every
// event, each tool's dialect, the protected files, the phase gate with
// sessions, the tier-2 rules, iterations, the ask token and git-exec.
func hookEventsSteps() []step {
	pre := []string{"invoke-hook", "pre-tool-use"}

	return []step{
		{Args: []string{"init"}},
		{Args: []string{"spec", "new", "add a login page"}},
		// 2: git guard
		{Args: pre, Stdin: hookInput("Bash", map[string]any{"command": "git status"})},
		{Args: pre, Stdin: hookInput("Bash", map[string]any{"command": "git commit -m wip && echo done"}), Stderr: true},
		{Args: pre, Stdin: hookInput("Bash", map[string]any{"command": `bash -c "git push origin main"`})},
		{Args: pre, Stdin: hookInput("Bash", map[string]any{"command": `npx eser@latest noskills spec add-login-page next --answer="we use git push to deploy"`})},
		{
			Args: pre, Stdin: hookInput("Bash", map[string]any{"command": "sh scripts/deploy.sh"}),
			Write: map[string]string{"scripts/deploy.sh": deployScript},
		},
		{Args: pre, Stdin: hookInput("Bash", map[string]any{"command": `echo "git push" > x.sh && sh x.sh`})},
		// 8: protected files
		{Args: pre, Stdin: hookInput("Bash", map[string]any{"command": "cat .eser/manifest.yml"})},
		{Args: pre, Stdin: hookInput("Bash", map[string]any{"command": "rm -rf .eser/.state"})},
		{Args: pre, Stdin: hookInput("Edit", map[string]any{"file_path": ".eser/manifest.yml", "old_string": "allowGit: false", "new_string": "allowGit: true"})},
		{Args: pre, Stdin: hookInput("Edit", map[string]any{"file_path": "<PROJECT>/.eser/manifest.yml", "old_string": "  command: npx eser@latest noskills", "new_string": "  command: npx eser@latest noskills\nother: 1"})},
		{Args: pre, Stdin: hookInput("Write", map[string]any{"file_path": ".eser/.state/bin/git", "content": "#!/bin/sh\n"})},
		{Args: pre, Stdin: hookInput("apply_patch", map[string]any{"command": "*** Begin Patch\n*** Update File: .eser/manifest.yml\n@@\n-  allowGit: false\n+  allowGit: true\n*** End Patch\n"})},
		// 14: the phase gate in each dialect
		{Args: pre, Stdin: hookPayload(map[string]any{"hook_event_name": "preToolUse", "toolName": "create", "toolArgs": `{"path":"src/login.ts","file_text":"x"}`})},
		{
			Args: pre, Stdin: hookInput("Write", map[string]any{"file_path": "src/login.ts", "content": "x"}),
			Write: map[string]string{globalStateFile: stateIdleNamingSpec},
		},
		{Args: pre, Stdin: hookPayload(map[string]any{"hook_event_name": "preToolUse", "tool_name": "fs_write", "tool_input": map[string]any{"path": "src/login.ts", "file_text": "x"}}), Stderr: true},
		{Args: pre, Stdin: hookPayload(map[string]any{"toolName": "edit", "toolArgs": map[string]any{"path": "src/login.ts", "old_str": "x", "new_str": "y"}})},
		// 18: EXECUTING, with the executor reminder and the file's rules
		{
			Args: pre, Stdin: hookInput("Write", map[string]any{"file_path": "src/login.ts", "content": "x"}),
			Write: map[string]string{
				globalStateFile:          stateExecuting,
				".eser/rules/ts-rule.md": tsRule,
				"src/.folder-rules.md":   srcFolderRules,
			},
		},
		{Args: pre, Stdin: hookInput("Edit", map[string]any{"file_path": "src/login.ts", "old_string": "x", "new_string": "y"})},
		{Args: pre, Stdin: hookPayload(map[string]any{"hook_event_name": "preToolUse", "tool_name": "fs_write", "tool_input": map[string]any{"path": "src/view.tsx", "file_text": "x"}})},
		// 21: PostToolUse logs
		{Args: []string{"invoke-hook", "post-file-write"}, Stdin: hookPayload(map[string]any{"hook_event_name": "PostToolUse", "tool_name": "Write", "tool_input": map[string]any{"file_path": "src/login.ts", "content": "x"}})},
		{Args: []string{"invoke-hook", "post-file-write"}, Stdin: hookPayload(map[string]any{"hook_event_name": "PostToolUse", "tool_name": "Write", "tool_input": map[string]any{"file_path": ".claude/notes.md", "content": "x"}})},
		{Args: []string{"invoke-hook", "post-bash"}, Stdin: hookPayload(map[string]any{"hook_event_name": "PostToolUse", "tool_name": "Bash", "tool_input": map[string]any{"command": "npx eser@latest noskills next"}})},
		{Args: []string{"invoke-hook", "post-bash"}, Stdin: hookPayload(map[string]any{"hook_event_name": "PostToolUse", "tool_name": "Bash", "tool_input": map[string]any{"command": "ls -la"}})},
		// 25: Stop records one iteration, and not the stop it causes
		{Args: []string{"invoke-hook", "stop"}, Stdin: hookPayload(map[string]any{"hook_event_name": "Stop", "stop_hook_active": false}), Stderr: true},
		{Args: []string{"invoke-hook", "stop"}, Stdin: hookPayload(map[string]any{"hook_event_name": "Stop", "stop_hook_active": true})},
		// 27: the ask token
		{
			Args:  []string{"invoke-hook", "post-ask-user-question"},
			Stdin: hookPayload(map[string]any{"hook_event_name": "PostToolUse", "tool_name": "AskUserQuestion", "tool_input": map[string]any{"questions": []any{map[string]any{"question": "Describe the 1-star and 10-star versions."}, map[string]any{"question": "What should it not do?"}}}}),
			Write: map[string]string{globalStateFile: stateDiscoveryQuestions},
		},
		{Args: []string{"invoke-hook", "post-ask-user-question"}, Stdin: hookPayload(map[string]any{"hook_event_name": "PostToolUse", "tool_name": "AskUserQuestion", "tool_input": map[string]any{"question": "Does this involve an irreversible decision?"}})},
		// 29: the git wrapper's check
		{Args: []string{"invoke-hook", "git-exec", "status", "--short"}},
		{Args: []string{"invoke-hook", "git-exec", "push", "origin", "main"}, Stderr: true},
		{Args: []string{"invoke-hook", "git-exec", "commit", "-m", "wip"}, Stderr: true},
		{Args: []string{"invoke-hook", "git-exec", "-C", "<HOME>", "commit", "-m", "wip"}},
		// 33: SessionStart in Copilot CLI's shape
		{Args: []string{"invoke-hook", "session-start", "--tool=copilot-cli"}, Write: map[string]string{globalStateFile: stateIdle}},
		// 34: sessions
		{
			Args: pre, Stdin: hookInput("Write", map[string]any{"file_path": "src/other.ts", "content": "x"}),
			Env: map[string]string{"NOSKILLS_SESSION": "s1"},
			Write: map[string]string{
				globalStateFile:                     stateDiscoveryNoSpec,
				".eser/.state/sessions/s1.json":     sessionFree,
				".eser/.state/sessions/s2.json":     sessionProposal,
				".eser/.state/sessions/broken.json": "{",
			},
		},
		{Args: pre, Stdin: hookInput("Write", map[string]any{"file_path": "src/other.ts", "content": "x"}), Stderr: true},
		{Args: pre, Stdin: hookInput("Write", map[string]any{"file_path": "src/other.ts", "content": "x"}), Env: map[string]string{"NOSKILLS_SESSION": "s2"}},
		// 37: what the hooks do with nothing to check
		{Args: []string{"invoke-hook", "no-such-event"}},
		{Args: pre, Stdin: "not json"},
		{Args: pre, Stdin: hookInput("Read", map[string]any{"file_path": ".eser/manifest.yml"})},
	}
}

// fixedTools is the environment of an init step that must give the same
// result on any machine: no provider binaries on PATH, and the default
// command in the manifest.
func fixedTools() map[string]string {
	return map[string]string{"PATH": "<HOME>/bin", "NOSKILLS_CLI_PREFIX": "npx eser@latest noskills"}
}

// scenarios cover the hooks, the spec lifecycle, purge and restore, and
// sync. nativeFrom is the first step cmd/noskills runs itself; the replay
// seeds the project with the recording of the step before it. The init
// step of the older scenarios was recorded with the machine's providers on
// PATH, so they start after it; init_tools, init_bare, sync and the state
// scenarios run init in Go.
func scenarios() []scenario {
	return append([]scenario{
		{
			name:  "spec_lifecycle",
			setup: withToolDirs(".claude"),
			steps: []step{
				{Args: []string{"init"}},
				{Args: []string{"spec", "new", "add a login page"}},
				{Args: []string{"spec", "add-login-page", "next"}},
				{Args: []string{"spec", "add-login-page", "next", "--answer=Users sign in with an email and a password"}},
				{Args: []string{"spec", "add-login-page", "next"}},
				{Args: []string{"status"}},
				{Args: []string{"spec", "list"}},
			},
			nativeFrom: 1,
			portedBy:   "TASK-259 (init depends on the providers of the recording machine)",
		},
		{
			name:  "hooks",
			setup: withToolDirs(".claude"),
			steps: []step{
				{Args: []string{"init"}},
				{Args: []string{"spec", "new", "add a login page"}},
				{Args: []string{"invoke-hook", "pre-tool-use"}, Stdin: hookInput("Bash", map[string]any{"command": "git push origin main"})},
				{Args: []string{"invoke-hook", "pre-tool-use"}, Stdin: hookInput("Write", map[string]any{"file_path": "src/login.ts", "content": "x"})},
				{Args: []string{"invoke-hook", "pre-tool-use"}, Stdin: hookInput("Read", map[string]any{"file_path": "package.json"})},
				{Args: []string{"invoke-hook", "session-start"}},
			},
			nativeFrom: 1,
			portedBy:   "TASK-259 (init depends on the providers of the recording machine)",
		},
		{
			name:       "hook_events",
			setup:      withToolDirs(".claude"),
			steps:      hookEventsSteps(),
			nativeFrom: 1,
			portedBy:   "TASK-259 (init depends on the providers of the recording machine)",
			delta:      true,
		},
		{
			name:  "purge_restore",
			setup: withToolDirs(".claude"),
			steps: []step{
				{Args: []string{"init"}, Env: fixedTools()},
				{Args: []string{"spec", "new", "add a login page"}},
				{Args: []string{"purge", "--force"}},
				{Args: []string{"purge", "restore"}, Stderr: true},
				{Args: []string{"purge", "restore", "latest"}, Stderr: true},
				{Args: []string{"spec", "list"}},
			},
			nativeFrom: 0,
			portedBy:   "TASK-259",
		},
		{
			name:  "sync",
			setup: withToolDirs(".claude", ".cursor", ".kiro"),
			steps: []step{
				{Args: []string{"init"}, Env: fixedTools()},
				{Args: []string{"sync"}, Env: fixedTools()},
			},
			nativeFrom: 0,
			portedBy:   "TASK-259",
		},
	}, append(append(append(append(lifecycleScenarios(), stateScenarios()...), validationScenarios()...), sessionScenarios()...), specStateScenarios()...)...)
}
