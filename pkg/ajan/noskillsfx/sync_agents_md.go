// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import "strings"

// The noskills section of AGENTS.md that OpenCode, Codex CLI and Copilot
// CLI read (sync/adapters/shared/agents-md.ts), between the noskills
// markers so the user's own text in the file stays.

// protocolLines are the protocol text AGENTS.md and the Kiro steering file
// share; heading is the Markdown heading prefix of its subsections ("###"
// in AGENTS.md, "##" in Kiro).
func protocolLines(prefix, heading string, options SyncOptions) []string {
	lines := []string{
		heading + " What is noskills",
		"",
		"This project uses noskills for state-driven orchestration.",
		"Do NOT read `.eser/rules/`, `.eser/specs/`, or concern files directly.",
		"noskills gives you exactly what you need via JSON output.",
		"",
		heading + " Protocol",
		"",
		"    " + prefix + " spec <name> next                           # get current instruction",
		"    " + prefix + ` spec <name> next --answer="your response"  # submit result and advance`,
		"",
		"Every noskills command that operates on a spec MUST include `spec <name>`.",
		"Never omit it. Use `" + prefix + " spec list` to see available specs.",
		"",
		heading + " Why noskills calls matter",
		"",
		"noskills is not a form to fill out. It is a live state machine that the user",
		"watches in real-time. Every `" + prefix + " next --answer` call:",
		"",
		"- Updates the spec file on disk (the user sees it change)",
		"- Updates the terminal dashboard if `noskills watch` is running",
		"- Advances the state machine to the next phase",
		"- Records the decision permanently in the project history",
		"",
		discoveryQuestionRule(),
		"Do not answer discovery questions yourself: the user's input is the data.",
		discoveryAnswerRule(prefix + " spec <name> next --answer"),
		"",
		heading + " When to call noskills next",
		"",
		"You MUST call `" + prefix + " next` in these situations:",
		"",
		"1. At the **START** of every conversation (first thing you do)",
		"2. **BEFORE** creating or modifying any file (to verify you have an active task)",
		"3. **AFTER** completing a logical unit of work (to report progress)",
		"4. When you encounter a **DECISION** that affects architecture or scope",
		"5. When you are **UNSURE** what to do next",
		"",
		"NEVER proceed with implementation without checking noskills first.",
		"NEVER make architectural decisions independently — noskills routes them to the user.",
	}

	if !options.AllowGit {
		lines = append(lines,
			"",
			heading+" Git is read-only",
			"",
			"You MUST NOT run git write commands: commit, add, push, checkout, stash,",
			"reset, merge, rebase, cherry-pick. The user controls git. You control files.",
			"You MAY read from git: log, diff, status, show, blame.",
		)
	}

	return append(lines,
		"",
		heading+" Interactive choices",
		"",
		"Present choices as numbered lists. Users select by number.",
		"When interactiveOptions are present in noskills output, present each as a",
		"numbered item with its label and description. Ask the user to pick a number.",
		"Use the `commandMap` to resolve the user's selection to a CLI command.",
		"",
		heading+" Decision principle: Explicit > Clever",
		"",
		"You NEVER skip steps, bypass questions, or make assumptions on behalf of the user.",
		"- Discovery questions → ask the user, don't answer yourself",
		"- Classification → ask the user, don't infer",
		"- Spec approval → ask the user, don't auto-approve",
		"- Task refinement → ask the user, don't self-assign",
		"- Rule promotion → ask the user, don't decide",
		`If you think something can be skipped, ASK "would you like to skip this?" — don't skip it.`,
		"NEVER suggest bypassing or skipping noskills. Discovery is not overhead.",
		"Run the next noskills command as soon as the current step is done; each step has exactly one next step, so there is nothing to ask permission for.",
		"",
		heading+" Command execution",
		"",
		"Run noskills commands as soon as you are told to. Their output carries the",
		"context you need, so do not read noskills source or `.eser/` files first.",
		"",
		heading+" JSON output",
		"",
		"noskills returns JSON with a `phase` field and phase-specific instructions.",
		"The `meta` block contains resume context - use it to orient yourself,",
		"especially after compaction or at the start of a new session.",
		"Follow the `instruction` field. Use `transition` commands to advance state.",
		"",
	)
}

// coachingLines is the rule-promotion guidance AGENTS.md and the Kiro
// coaching file share.
func coachingLines(prefix, heading string) []string {
	return []string{
		heading + " Convention discovery",
		"",
		"When you discover a pattern, receive a correction, or identify a recurring",
		`preference from the user, ask: "Should this be a permanent rule for this`,
		"project, or just for this task?\" If permanent, run: `" + prefix + " rule add",
		"\"<description>\"`. If just this task, note it and move on.",
		"Never write to `.eser/rules/` directly.",
		"",
		heading + " How to promote rules",
		"",
		"When a convention should be permanent, use the noskills CLI to register it:",
		"",
		"    " + prefix + ` rule add "<description of the rule>"`,
		"",
		"This stores the rule in `.eser/rules/` and ensures it is synced to all",
		"coding tools on the next `noskills sync`. Never edit `.eser/rules/` directly.",
		"",
	}
}

func agentsMdSection(c *SyncContext) string {
	protocol := append([]string{
		"## noskills Protocol",
		"",
		"# Generated by noskills — do not edit manually",
		"",
	}, protocolLines(c.CommandPrefix, "###", c.Options)...)

	parts := []string{
		noskillsSectionStart,
		strings.Join(protocol, "\n"),
		strings.Join(coachingLines(c.CommandPrefix, "###"), "\n"),
	}

	if len(c.Rules) > 0 {
		rules := append([]string{"### Active Rules", ""}, bulletLines(c.Rules)...)
		parts = append(parts, strings.Join(append(rules, ""), "\n"))
	}

	parts = append(parts, noskillsSectionEnd)

	return strings.Join(parts, "\n")
}

// syncAgentsMd writes the noskills section of AGENTS.md.
func syncAgentsMd(c *SyncContext) error {
	return writeMarkedSection(c.path("AGENTS.md"), agentsMdSection(c))
}

// agentBody is the executor's or verifier's prompt in the form the Markdown
// agent files of OpenCode, Copilot CLI and Kiro share.
func executorPromptLines(prefix string) []string {
	lines := []string{executorIntro, "", "## Self-Verification",
		"After completing the task, you MUST verify your own work before reporting:"}
	lines = append(lines, executorSelfCheck()...)

	return append(lines,
		"",
		"## Reporting",
		"When finished, provide a structured JSON summary:",
		"```json",
		executorReportJSON,
		"```",
		"",
		executorNoRawOut,
		"The orchestrator will submit this to `"+prefix+" next --answer` on your behalf.",
	)
}

func verifierPromptLines() []string {
	lines := []string{verifierIntro, "", "## Verification Steps"}
	lines = append(lines, verifierSteps()...)

	return append(lines,
		"",
		"## Report Format",
		"When finished, provide a structured JSON summary:",
		"```json",
		verifierReportJSON,
		"```",
		"",
		verifierReportUse,
	)
}

// markdownAgent is an agent file with YAML frontmatter: the header lines,
// then the prompt and a final newline.
func markdownAgent(header, prompt []string) string {
	lines := append(append([]string{"---"}, header...), "---", "")
	lines = append(lines, prompt...)

	return strings.Join(append(lines, ""), "\n")
}
