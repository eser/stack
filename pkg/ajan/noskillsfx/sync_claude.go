// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import "strings"

// The Claude Code adapter (sync/adapters/claude-code.ts, sync/claude.ts and
// sync/hooks.ts): the noskills section of CLAUDE.md, the hooks in
// .claude/settings.json and the executor and verifier agents.

// executorSelfCheck and verifierSteps are the check steps of the generated
// agents (sync/adapters/shared/agent-prompts.ts).
func executorSelfCheck() []string {
	return []string{
		"1. Run the project's type check on the modified files (skip this step when the project has none)",
		"2. Run the project's tests that cover the changed code",
		"3. If the type check or tests fail, fix the issues before reporting",
		agentFindCommands,
	}
}

func verifierSteps() []string {
	return []string{
		"1. Read each modified file and verify the changes are correct",
		"2. Run the project's type check on the modified files (skip this step when the project has none)",
		"3. Run the project's tests that cover the changed code",
		"4. Check each acceptance criterion against actual file contents",
		agentFindCommands,
	}
}

const agentFindCommands = "Take these commands from the project itself: its README, task runner (package.json " +
	"scripts, deno.json tasks, Makefile) or CI config."

// claudeSection is buildSection in sync/claude.ts.
func claudeSection(c *SyncContext) string {
	prefix := c.CommandPrefix
	lines := []string{
		noskillsSectionStart,
		"## noskills orchestrator",
		"",
		"State-driven orchestration. Do NOT read `.eser/` files directly — noskills provides everything via JSON.",
		"",
		"### Protocol",
		"",
		"    " + prefix + " spec <name> next                           # get instruction",
		"    " + prefix + ` spec <name> next --answer="response"       # submit and advance`,
		"    " + prefix + ` spec new "description"                     # create spec (name auto-generated)`,
		"",
		"Every spec command MUST include `spec <name>`. Use `" + prefix + " spec list` for available specs.",
		"",
		"### Core rules",
		"",
		"- " + discoveryQuestionRule(),
		"- Never answer discovery questions yourself.",
		"- Call `next` at: conversation start, before file edits, after completing work, at decisions.",
		"- " + discoveryAnswerRule(prefix+" spec <name> next --answer"),
		"- Never skip steps or infer decisions. Ask first. Explicit > Clever.",
		"- NEVER suggest bypassing or skipping noskills. Discovery is not overhead.",
		"- Run the next noskills command as soon as the current step is done; each step has exactly one next step, so there is nothing to ask permission for.",
		"- Run noskills commands as soon as you are told to; their output has the context you need.",
		"- Display `roadmap` before content. Display `gate` prominently.",
		"",
		"### Interactive choices",
		"",
		"- Use AskUserQuestion for `interactiveOptions`. Use `commandMap` to resolve selections.",
		"- On recurring patterns or corrections: ask 'Permanent rule?' → `" + prefix + ` rule add "description"` + "`.",
	}

	if !c.Options.AllowGit {
		lines = append(lines,
			"",
			"### Git",
			"",
			"Read-only: log, diff, status, show, blame. No write commands (commit, push, checkout, etc.).",
		)
	}

	lines = append(lines,
		"",
		"### Spec Creation",
		"",
		"When the user wants a spec:",
		`1. Ask "What do you want to build?" — nothing else.`,
		"2. Take their full answer as the description.",
		"3. Run: "+prefix+` spec new "their answer"`,
		"Do NOT suggest names. Do NOT analyze before creating. Just ask, take the answer, create.",
		"",
		"### Concern Management",
		"",
		`When user says "add concerns" or "manage concerns":`,
		"- Run `"+prefix+" concern list` immediately. Do NOT analyze which concerns are appropriate.",
		"- Present list via AskUserQuestion with multiSelect:true, max 4 options per question.",
		"- Add all selected concerns in ONE command: "+prefix+" concern add open-source well-engineered long-lived",
		"",
		"### Discovery",
		"",
		"Listen first: after spec creation, ask user to share context before mode selection.",
		"Modes: full (default), validate, technical-depth, ship-fast, explore.",
		"Pre-scan codebase before questions. Challenge premises. Propose alternatives.",
		"With --from-plan: extract answers, present for user confirmation.",
		"",
		"### Mode Management",
		"",
		"noskills manages Claude Code plan mode transitions automatically.",
		"Follow the `modeDirective` field in each `noskills next` output.",
		"",
		"| Phase | Mode |",
		"|-------|------|",
		"| IDLE | plan mode optional — no active spec |",
		"| DISCOVERY, DISCOVERY_REFINEMENT, SPEC_PROPOSAL | **plan mode** — read-only, no file edits |",
		"| EXECUTING | **normal mode** — full write access for sub-agents |",
		"| BLOCKED | **plan mode** — analyze the blocker, do not edit |",
		"| COMPLETED | plan mode optional |",
		"",
		"Non-Claude-Code platforms: `modeDirective` is advisory. Hooks enforce file restrictions mechanically.",
		"",
		"### Execution",
		"",
		"- Run type-check + lint after every edit. Never mark AC passed if type-check fails.",
		"- If search returns few results, re-run narrower — assume truncation.",
		"- Work through the spec's tasks to the end; the user decides when to stop.",
		"- `meta` block has resume context for session start or after compaction.",
	)

	if len(c.Rules) > 0 {
		lines = append(lines, "", "### Active Rules", "")
		lines = append(lines, bulletLines(c.Rules)...)
	}

	lines = append(lines, noskillsSectionEnd)

	return strings.Join(lines, "\n")
}

func syncClaudeMd(c *SyncContext) error {
	return writeMarkedSection(c.path("CLAUDE.md"), claudeSection(c))
}

// commandHook is one command handler of a Claude Code or Codex hook group.
func commandHook(prefix string, event HookEvent) *JSObject {
	return JSObjectOf(
		"type", "command",
		"command", HookCommand(prefix, event),
		"timeout", float64(HookTimeoutSeconds(event)),
	)
}

func hookGroup(matcher string, handlers ...*JSObject) *JSObject {
	group := NewJSObject()
	if matcher != "" {
		group.set("matcher", matcher)
	}

	group.set("hooks", anyOfObjects(handlers))

	return group
}

// claudeHooks is buildHooks in sync/hooks.ts.
func claudeHooks(prefix string) *JSObject {
	return JSObjectOf(
		"PreToolUse", []any{hookGroup("Write|Edit|MultiEdit|Bash", commandHook(prefix, HookPreToolUse))},
		"PostToolUse", []any{
			hookGroup("Write|Edit|MultiEdit", commandHook(prefix, HookPostFileWrite)),
			hookGroup("Bash", commandHook(prefix, HookPostBash)),
			hookGroup("AskUserQuestion", commandHook(prefix, HookPostAskUserQuestion)),
		},
		"Stop", []any{hookGroup("", commandHook(prefix, HookStop))},
		"SessionStart", []any{hookGroup("", commandHook(prefix, HookSessionStart))},
	)
}

// syncClaudeHooks is syncHooks in sync/hooks.ts: the settings' other keys
// and the user's own hooks stay, and noskills' hooks are replaced.
func syncClaudeHooks(c *SyncContext) error {
	path := c.path(".claude/settings.json")

	existing, ok := readJSONFile(path)
	if !ok {
		existing = NewJSObject()
	}

	var userHooks any
	if o, isObject := existing.(*JSObject); isObject {
		userHooks, _ = o.get("hooks")
	}

	merged := jsSpread(existing)
	merged.set("hooks", MergeHookGroups(UserHookGroups(userHooks), claudeHooks(c.CommandPrefix)))

	return writeSyncFile(path, jsonStringifyIndent(merged)+"\n")
}

func claudeExecutorAgent(prefix string) string {
	return "---\n" +
		"name: noskills-executor\n" +
		`description: "Executes a single noskills task."` + "\n" +
		"tools: Read, Edit, MultiEdit, Write, Bash, Grep, Glob, LS\n" +
		"---\n" +
		"\n" +
		"You are executing a single task from a noskills spec.\n" +
		"Your ONLY job is to complete the task described in the prompt.\n" +
		"Follow all behavioral rules provided in the prompt.\n" +
		"Do NOT start new tasks, explore unrelated code, or make architectural decisions.\n" +
		"If the task is too vague to execute, say so immediately.\n" +
		"\n" +
		"## Self-Verification\n" +
		"After completing the task, you MUST verify your own work before reporting:\n" +
		strings.Join(executorSelfCheck(), "\n") + "\n" +
		"\n" +
		"## Reporting\n" +
		"When finished, provide a structured JSON summary:\n" +
		"```json\n" +
		executorReportJSON + "\n" +
		"```\n" +
		"\n" +
		"Do NOT return raw test output — summarize it in the verification field.\n" +
		"The orchestrator will submit this to `" + prefix + " next --answer` on your behalf.\n"
}

const (
	executorReportJSON = `{"completed": ["<item IDs done>"], "remaining": ["<item IDs not done>"], "blocked": ` +
		`["<item IDs needing decisions>"], "filesModified": ["<paths>"], "verification": {"typeCheck": ` +
		`"pass|fail", "tests": "pass|fail (N passed, M failed)"}}`
	verifierReportJSON = `{"results": [{"id": "ac-1", "status": "PASS", "evidence": "..."}, {"id": "ac-2", ` +
		`"status": "FAIL", "reason": "..."}]}`
	verifierIntro = "You are verifying another agent's work. You have NO context about how it was done.\n" +
		"Read the changed files. Run the test suite. Check each acceptance criterion independently.\n" +
		"\n" +
		"For each acceptance criterion:\n" +
		"- PASS: with evidence — show the grep result, the test output, or the file content that proves it\n" +
		"- FAIL: with specific reason — what's missing, what's wrong, what doesn't match\n" +
		"\n" +
		"Be skeptical. Don't assume anything works — verify it yourself.\n" +
		"You CANNOT edit files. Read-only access only."
	executorIntro = "You are executing a single task from a noskills spec.\n" +
		"Your ONLY job is to complete the task described in the prompt.\n" +
		"Follow all behavioral rules provided in the prompt.\n" +
		"Do NOT start new tasks, explore unrelated code, or make architectural decisions.\n" +
		"If the task is too vague to execute, say so immediately."
	verifierReportUse = "The orchestrator will use this report for the noskills status report."
	executorNoRawOut  = "Do NOT return raw test output — summarize it in the verification field."
)

func claudeVerifierAgent() string {
	return "---\n" +
		"name: noskills-verifier\n" +
		`description: "Independently verifies completed task work. Read-only. Never sees the executor's context."` + "\n" +
		"tools: Read, Bash, Grep, Glob, LS\n" +
		"---\n" +
		"\n" +
		verifierIntro + "\n" +
		"\n" +
		"## Verification Steps\n" +
		strings.Join(verifierSteps(), "\n") + "\n" +
		"\n" +
		"## Report Format\n" +
		"When finished, provide a structured JSON summary:\n" +
		"```json\n" +
		verifierReportJSON + "\n" +
		"```\n" +
		"\n" +
		verifierReportUse + "\n"
}

func syncClaudeAgents(c *SyncContext) error {
	if err := writeSyncFile(c.path(".claude/agents/noskills-executor.md"), claudeExecutorAgent(c.CommandPrefix)); err != nil {
		return err
	}

	return writeSyncFile(c.path(".claude/agents/noskills-verifier.md"), claudeVerifierAgent())
}
