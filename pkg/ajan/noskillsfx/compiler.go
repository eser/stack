// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"regexp"
	"strings"
)

// The shared pieces of the `noskills next` compiler (next_compiler.go and
// the files beside it): the tool's interaction hints, the rules more than
// one phase states, and the classification inference.

// jsDot is JavaScript's `.`: any character but a line terminator.
const jsDot = `[^\n\r\x{2028}\x{2029}]`

type classificationPattern struct {
	key     string
	pattern *regexp.Regexp
}

//nolint:gochecknoglobals // compiled once
var classificationPatterns = []classificationPattern{
	{"involvesWebUI", regexp.MustCompile(`(?i)\b(ui|frontend|component|react|css|html|button|modal|form|page|screen|layout|design|loading state|empty state|error state)\b`)},
	{"involvesCLI", regexp.MustCompile(`(?i)\b(cli|terminal|command` + jsDot + `?line|stdout|stdin|ansi|tui|console)\b`)},
	{"involvesPublicAPI", regexp.MustCompile(`(?i)\b(api|endpoint|rest|graphql|webhook|public` + jsDot + `?facing|sdk|client` + jsDot + `?library)\b`)},
	{"involvesMigration", regexp.MustCompile(`(?i)\b(migrat\w*|schema` + jsDot + `?change|breaking` + jsDot + `?change|backward` + jsDot + `?compat|upgrade|deprecat\w*)\b`)},
	{"involvesDataHandling", regexp.MustCompile(`(?i)\b(pii|gdpr|encrypt|personal` + jsDot + `?data|user` + jsDot + `?data|data` + jsDot + `?retention|data` + jsDot + `?safety|sensitive)\b`)},
}

// inferClassificationObject is inferClassification: the flags whose keywords
// the description, the user context and the answers mention, with the
// keywords as evidence.
func inferClassificationObject(state *JSObject) *JSObject {
	var parts []string

	if description, ok := state.strOK("specDescription"); ok && description != "" {
		parts = append(parts, description)
	}

	discovery := discoveryOf(state)
	if context, ok := discovery.get("userContext"); ok {
		if items, isList := context.([]any); isList {
			for _, item := range items {
				parts = append(parts, jsDisplay(item))
			}
		}
	}

	for _, answer := range answersObjects(state) {
		parts = append(parts, jsDisplay(answer.getOr("answer")))
	}

	text := strings.Join(parts, " ")
	result := JSObjectOf(
		"involvesWebUI", false,
		"involvesCLI", false,
		"involvesPublicAPI", false,
		"involvesMigration", false,
		"involvesDataHandling", false,
		"source", "inferred",
	)

	inferred := []any{}

	for _, p := range classificationPatterns {
		if match := p.pattern.FindString(text); match != "" {
			result.set(p.key, true)
			inferred = append(inferred, p.key+":"+jsToLower(match))
		}
	}

	result.set("inferredFrom", inferred)

	return result
}

// formatClassificationPreview is formatClassificationPreview: the flags as
// ✓/✗ lines with the keywords that set them.
func formatClassificationPreview(classification *JSObject) string {
	evidence := map[string][]string{}

	for _, entry := range stringsOf(classification.arr("inferredFrom")) {
		key, keyword, ok := strings.Cut(entry, ":")
		if !ok {
			continue
		}

		if !containsString(evidence[key], keyword) {
			evidence[key] = append(evidence[key], keyword)
		}
	}

	lines := []string{"Based on your answers, this spec involves:"}

	for _, l := range []struct{ key, label string }{
		{"involvesWebUI", "Web UI"}, {"involvesPublicAPI", "Public API"}, {"involvesCLI", "CLI"},
		{"involvesMigration", "Migration"}, {"involvesDataHandling", "Data Handling"},
	} {
		if !classification.isTrue(l.key) {
			lines = append(lines, "  \u2717 "+l.label)

			continue
		}

		if keywords := evidence[l.key]; len(keywords) > 0 {
			quoted := make([]string, len(keywords))
			for i, k := range keywords {
				quoted[i] = `"` + k + `"`
			}

			lines = append(lines, "  \u2713 "+l.label+"  (mentions: "+strings.Join(quoted, ", ")+")")
		} else {
			lines = append(lines, "  \u2713 "+l.label)
		}
	}

	return strings.Join(lines, "\n")
}

// =============================================================================
// Behavioral block builder
// =============================================================================

// InteractionHints describes the agent's tool capabilities (matches sync/adapter.ts).
type InteractionHints struct {
	HasAskUserTool        bool   // agent has AskUserQuestion tool
	OptionPresentation    string // "tool" | "list"
	HasSubAgentDelegation bool
	SubAgentMethod        string // "task" | "spawn" | "fleet" | "delegation" | "none"
	// PlanModeShortcut is the key that switches the tool into plan mode
	// ("Shift+Tab" in Claude Code), or "" when noskills knows none.
	PlanModeShortcut string
	// Headless is set for `noskills run`, which drives the agent with nobody
	// to answer (interactive: false in sync/adapter.ts).
	Headless bool
}

// DefaultInteractionHints are Claude Code defaults.
//
//nolint:gochecknoglobals
var DefaultInteractionHints = InteractionHints{
	HasAskUserTool:        true,
	OptionPresentation:    "tool",
	HasSubAgentDelegation: true,
	SubAgentMethod:        "task",
	PlanModeShortcut:      "Shift+Tab",
	Headless:              false,
}

const gitReadonlyRule = "NEVER run git write commands (commit, add, push, checkout, stash, reset, merge, rebase, cherry-pick). Git is read-only for agents. The user controls git. You may read: git log, git diff, git status, git show, git blame."

// readOnlyBase is the one statement that DISCOVERY, DISCOVERY_REFINEMENT and
// SPEC_PROPOSAL are read-only (mirrors READ_ONLY_RULE in compiler.ts). Their
// ModeOverride only names the mode, so the ban is not repeated.
const readOnlyBase = "This phase is read-only: read files and run read-only commands (cat, ls, grep, git log, git diff); create or edit nothing and run nothing that changes state, apart from the noskills commands this output gives you."

// readOnlyRule adds the plan-mode key only for a tool that has one (mirrors
// readOnlyRule in compiler.ts).
func readOnlyRule(hints InteractionHints) string {
	if hints.PlanModeShortcut == "" {
		return readOnlyBase
	}

	return readOnlyBase + " If the session is not in plan mode, ask the user to switch (" + hints.PlanModeShortcut + ")."
}

// planModeOverride is the ModeOverride of the read-only phases.
const planModeOverride = "plan mode"

// discoveryQuestionRule mirrors discoveryQuestionRule in
// context/discovery-answers.ts: the one rule for asking discovery questions,
// the unanswered base questions together and follow-ups one at a time.
func discoveryQuestionRule() string {
	return "Ask the user the unanswered base discovery questions together, in one " +
		"exchange, and submit the confirmed answers as one JSON object keyed by " +
		"question id. Ask each follow-up question on its own and wait for its " +
		"answer before you ask the next."
}

// discoveryAskMethod mirrors discoveryAskMethod in compiler.ts: how the agent
// puts discovery questions to the user. AskUserQuestion takes up to 4
// questions per call, so the six base questions take two calls.
func discoveryAskMethod(hints InteractionHints) string {
	if hints.HasAskUserTool {
		return "Ask the base questions through AskUserQuestion, as many as fit in each call (it takes up to 4), and each follow-up in a call of its own."
	}

	return "Ask the base questions in one message, as a numbered list, and each follow-up in a message of its own."
}

// discoveryAnswerRule mirrors discoveryAnswerRule in context/discovery-answers.ts:
// the one rule for pre-filling and submitting discovery answers.
func discoveryAnswerRule(nextCommand string) string {
	return "Discovery answers come from the user. You may pre-fill a suggested answer " +
		"from what the user already wrote (the spec description, a plan, earlier " +
		"messages): mark it [STATED] when the user said it or [INFERRED] when it " +
		"is your reading, and have the user confirm or correct it. Submit only " +
		"confirmed answers, in the one call `transition.onComplete` shows " +
		"(`" + nextCommand + "`). Never submit an answer the user has not confirmed."
}

//nolint:gochecknoglobals
var discoveryConduct = []string{
	"Interview the user about each part of this plan until you both share one understanding.",
	"Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.",
	"For each question, provide your recommended answer — don't just ask, offer your informed opinion.",
	discoveryQuestionRule(),
	"If a question can be answered by exploring the codebase, explore the codebase INSTEAD of asking. Only ask the user what the codebase cannot tell you.",
	"Do NOT fill placeholders with assumptions; ask the user instead.",
	"If a section is not applicable, ask the user to confirm it's N/A with a specific reason — don't decide yourself.",
	"If two answers conflict, surface the conflict to the user — don't resolve it yourself.",
	"If an answer is vague, push back and ask for specifics — don't accept vague.",
}
