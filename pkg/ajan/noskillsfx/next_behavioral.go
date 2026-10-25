// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"strings"
)

// The behavioral block of `noskills next` (buildBehavioral in
// context/compiler.ts): the phase's rules and tone for the agent.

const (
	honestProgressRule = "Report progress honestly. Not done = 'not done'. Partial = 'partial: [works]/[doesn't]'. " +
		"Untested = 'untested'. 4 of 6 = '4 of 6 done, 2 remaining'."
	noBypassRule = "NEVER suggest bypassing, skipping, or 'breaking out of' noskills. Discovery helps the user — it is " +
		"not an obstacle. If scope changes: revise spec, reset and create new, or split."
	nextStepRule = "Run the next noskills command as soon as the current step is done; each step has exactly one next " +
		"step, so there is nothing to ask permission for."
	listenFirstRule = "Listen first: after spec creation, ask 'Tell me about this. Share as much context as you have.' " +
		"Wait for their response before mode selection. Rich context (>200 chars) → suggest pre-filled discovery " +
		"answers from it, marked STATED or INFERRED for the user to confirm. Brief response → proceed normally."
	verifierScope = "Verifier scope: (1) AC verification with evidence. (2) Plan alignment — does implementation " +
		"match task description? Flag deviations. (3) Code quality — follows existing patterns? Flag style breaks, " +
		"missing error handling. Categorize findings: CRITICAL (blocks completion), IMPORTANT (should fix), " +
		"SUGGESTION (nice to have)."
)

func (c *compiler) mandatoryRules() []any {
	hints := c.in.Hints
	interactive := !hints.Headless

	var rules []any

	if !jsTruthy(c.in.Manifest.getOr("allowGit")) {
		rules = append(rules, gitReadonlyRule)
	}

	rules = append(rules, honestProgressRule)

	if interactive {
		askMethod := "Present options as a numbered list at every decision point."
		if hints.HasAskUserTool {
			askMethod = "Use AskUserQuestion for all decision points."
		}

		rules = append(rules, "Never skip steps or infer decisions. "+askMethod+" Recommend first, then ask.",
			"Display `roadmap` before other content. Display `gate` prominently.")
	} else {
		rules = append(rules, "Never skip steps or infer decisions. Nobody answers questions during this run: when "+
			"a decision needs the user, run `"+c.csScoped(`block "reason"`)+"` and stop.")
	}

	rules = append(rules, noBypassRule, nextStepRule)

	if interactive {
		rules = append(rules, listenFirstRule,
			"Discovery questions are adaptive. Once the user has answered the base questions, write 1-3 follow-up "+
				"questions for each answer that reveals ambiguity, risk, dependencies, or missing detail, and register "+
				"them with `"+c.csScoped(`followup <questionId> "question"`)+"` before you submit the answers (max 3 "+
				"per question). noskills then gives you the follow-ups one at a time.")
	}

	return append(rules, confidenceRule)
}

func concernConductRules(concerns []ConcernDefinition, phase string) []any {
	var rules []any

	for _, concern := range concerns {
		for _, rule := range concern.ConductRules[phase] {
			rules = append(rules, rule)
		}
	}

	return rules
}

func discoveryConductRules() []any {
	return anyOf(discoveryConduct)
}

// postureSuggestion is concernPostureSuggestion.
func postureSuggestion(concerns []ConcernDefinition) string {
	var suggestors []ConcernDefinition

	for _, concern := range concerns {
		if concern.SuggestsPosture != nil {
			suggestors = append(suggestors, concern)
		}
	}

	switch len(suggestors) {
	case 0:
		return ""
	case 1:
		return "Based on your active concerns, suggested posture: " + *suggestors[0].SuggestsPosture + " (" +
			suggestors[0].Name + " active)."
	}

	parts := make([]string, len(suggestors))
	for i, concern := range suggestors {
		parts[i] = concern.Name + ": " + *concern.SuggestsPosture
	}

	return "Multiple concerns suggest different postures (" + strings.Join(parts, ", ") + "). Please select manually: a/b/c/d."
}

// ceoReviewRules is CEO_REVIEW_RULES.
func ceoReviewRules(posture string) []any {
	rules := make([]any, 0, 10) //nolint:mnd // three rules, or ten for every posture but hold-scope
	rules = append(rules,
		"CEO REVIEW — PREMISE CHECK: Restate the core premise in one sentence. Does it still hold? What evidence supports it? What challenges it?",
		"CEO REVIEW — READINESS DASHBOARD: Score 8 dimensions 1-10 (premise-clarity, reuse-leverage, test-coverage, failure-mode-coverage, boundary-clarity, unresolved-decisions, verification-path, scope-discipline). State overall score. Verdict: APPROVED or NEEDS WORK.",
		"CEO REVIEW — REFLECTION: Honest observation of the user's decision patterns during this spec. Not flattery. If they made a questionable choice, say so respectfully.",
	)

	if posture == ReviewPostureHoldScope {
		return rules
	}

	last := "CEO REVIEW — SCOPE DISCIPLINE: List what was held out of scope and why."
	if posture == ReviewPostureScopeExpansion {
		last = "CEO REVIEW — EXPANSION TABLE: Present all accepted expansions with LOC estimates."
	}

	return append(rules,
		"CEO REVIEW — REUSE SCORE: Table of existing modules/functions reused vs new code. Calculate approximate reuse percentage. Flag if <40%.",
		"CEO REVIEW — DREAM STATE DELTA: Current state, 12-month ideal, the share of that gap this spec delivers (%), and the remaining gap.",
		"CEO REVIEW — FAILURE MODE REGISTRY: Table with #, Failure, Trigger, Mitigation. Every failure mode must have concrete mitigation. Include at minimum: data corruption, race conditions, backward compat, user confusion, performance.",
		"CEO REVIEW — NOT IN SCOPE: Explicit list of what this spec does NOT touch, with reasons. This is a contract.",
		"CEO REVIEW — UNRESOLVED DECISIONS: Table with #, Decision, Default, Notes. Every unresolved decision must have a safe default. Present to user.",
		"CEO REVIEW — FILE-LEVEL PLAN: Table of every file created/modified with purpose. Plus: functions to reuse, files NOT modified.",
		last,
	)
}

func (c *compiler) behavioral() *JSObject { //nolint:cyclop,funlen,gocognit,maintidx // one case per phase, as buildBehavioral has them
	hints := c.in.Hints
	mandatory := c.mandatoryRules()
	state := c.state()
	concerns := c.in.ActiveConcerns
	rules := func(parts ...[]any) []any {
		var all []any
		for _, part := range parts {
			all = append(all, part...)
		}

		if all == nil {
			all = []any{}
		}

		return all
	}

	switch c.phase() {
	case PhaseIdle:
		optionRule := "Present interactiveOptions as numbered list. Use commandMap to resolve selections. Present ALL " +
			"availableConcerns as numbered list for multiselect."
		concernPresentation := "Present the list as a numbered list; the user may pick several numbers."

		if hints.OptionPresentation == "tool" {
			optionRule = "Pass interactiveOptions DIRECTLY to AskUserQuestion options array (header max 12 chars). " +
				"Use commandMap to resolve selections. For availableConcerns: AskUserQuestion with multiSelect:true, " +
				"max 4 per question — split across questions if needed. Present ALL concerns."
			concernPresentation = "Present the list via AskUserQuestion (multiSelect:true, max 4 per question)."
		}

		viaAsk := ""
		if hints.HasAskUserTool {
			viaAsk = " via AskUserQuestion"
		}

		return JSObjectOf("rules", rules(
			[]any{"If the user described a feature/bug/task, create a spec immediately: `" + c.cmd(`spec new "description"`) +
				"`; the name is auto-generated. Do NOT present menus or ask 'What would you like to do?' unless the " +
				"conversation has no prior context."},
			mandatory,
			[]any{
				optionRule,
				"Encourage full context: 'Tell me what you want to build: a one-liner, detailed requirements, meeting " +
					"notes, anything.' Slug is auto-generated. Pass full text to `" + c.cmd(`spec new "..."`) + "`.",
				"After spec new, run next and present the discovery mode options it returns; never skip discovery without asking.",
				"Every task gets a spec. No exceptions. A one-liner fix, a config change, a 'simple' refactor — all get " +
					"specs. The spec can be short but it must exist. 'Too simple for a spec' is the anti-pattern.",
				"SPEC CREATION: When the user says 'create a new spec', 'new spec', or similar, do NOT run `" +
					c.cmd("spec new") + "` without a description. Ask the user 'What do you want to build?'" + viaAsk +
					" first. Wait for their response. Then run: `" + c.cmd(`spec new "their full response"`) + "`.",
				"CONCERN MANAGEMENT: When the user wants to add or view concerns, run `" + c.cmd("concern list") +
					"` immediately. Do NOT analyze or recommend concerns. " + concernPresentation + " Use a SINGLE `" +
					c.cmd("concern add id1 id2 id3") + "` command for all selections.",
			},
		), "tone", "Welcoming. Present choices, then wait.")
	case PhaseDiscovery:
		dreamPrompts := GetDreamStatePrompts(concerns)
		dream := "After answers, synthesize CURRENT STATE → THIS SPEC → 6-MONTH IDEAL vision."

		if len(dreamPrompts) > 0 {
			dream = "After answers, " + strings.Join(dreamPrompts, " Also: ")
		}

		return JSObjectOf(
			"modeOverride", planModeOverride,
			"rules", rules(mandatory, []any{
				readOnlyRule(hints),
				discoveryAskMethod(hints) + " Never answer questions yourself. With a fully formed plan, skip questions but MUST run premise challenge and alternatives.",
				discoveryAnswerRule(c.csScoped("next --answer")),
				"Pre-discovery: (1) pre-discovery codebase scan — read README, CLAUDE.md, design docs, last 20 commits, TODOs, existing specs, directory structure. Present a brief audit summary. (2) If `preDiscoveryResearch.required`, web-search every `extractedTerms` entry — report versions, API changes, deprecations. (3) Ask discovery mode: A) Explore scope B) Technical depth C) Validate my plan D) Ship fast. Adapt emphasis accordingly.",
				"Before starting discovery questions, challenge the user's initial spec description against codebase findings. Flag: hidden complexity, conflicts with existing code, scope mismatch, overlapping modules. Ask clarifying follow-ups.",
				"When asking questions, offer concrete options from codebase knowledge alongside the open-ended question (e.g., 'I see three scenarios: A)... B)... C)... D) Something else'). Push back on vague answers. Follow up on short answer with 'Can you be more specific?'",
				dream + " Then: (1) expansion opportunities as numbered proposals with effort (S/M/L/XL), risk, completeness delta — options: Add/Defer/Skip. (2) Architectural decisions that BLOCK implementation — present with options, RECOMMENDATION, completeness scores. Unresolved = risk flag. (3) Error/rescue map: codepath | failure mode | handling. Flag CRITICAL GAPS as decisions.",
				"Present DISCOVERY SUMMARY for confirmation: intent, scope, dream state, expansions, architectural decisions, error map. Ask for confirmation before generating spec.",
			}, discoveryConductRules(), concernConductRules(concerns, PhaseDiscovery)),
			"tone", "Curious interviewer with a stake in the answers. Comes PREPARED — read the codebase first. Challenge assumptions, think about architecture and failure modes.",
		)
	case PhaseDiscoveryRefinement:
		stage := refinementStage(state)
		refinement := discoveryOf(state).obj("refinement")

		var stageRules []any

		switch stage {
		case "stage-a":
			stageRules = []any{
				"COMPLETENESS ASSESSMENT: Before presenting answers for review, evaluate the spec's completeness across 6 dimensions. Score each 1-10: problem-clarity, scope-definition, technical-feasibility, verification-strategy, risk-identification, user-impact-analysis. Identify concrete gaps (specific, not vague). Present the table and gaps to the user.",
				"Scoring guide: 9-10 = fully addressed; 7-8 = mostly addressed; 5-6 = partially; 3-4 = weakly; 1-2 = not addressed. A gap is anything the spec doesn't explicitly address that could cause problems during execution.",
			}

			if suggestion := postureSuggestion(concerns); suggestion != "" {
				stageRules = append(stageRules, suggestion)
			}

			if c.in.Manifest.has("defaultReviewPosture") {
				stageRules = append(stageRules, "Using project default posture: "+jsDisplay(c.in.Manifest.getOr("defaultReviewPosture"))+
					" (from manifest.yml). To override, answer with a/b/c/d. Answer 'clear-posture' to remove this default.")
			} else {
				stageRules = append(stageRules, "After presenting the completeness assessment, present the 4 review posture options: (a) Selective expansion — fill gaps only, no scope drift; (b) Hold scope — surface risks but no additions; (c) Scope expansion — actively explore adjacent features; (d) Scope reduction — cut to essentials. Ask user to choose.")
			}

			if hints.HasAskUserTool {
				stageRules = append(stageRules, "Use AskUserQuestion to present the completeness table and posture options together in one question.")
			} else {
				stageRules = append(stageRules, "Present completeness table and posture options in one message. User replies with 'a', 'b', 'c', or 'd'.")
			}
		case "stage-b":
			posture := refinement.str("reviewPosture")

			var postureRule string

			switch posture {
			case ReviewPostureSelectiveExpansion:
				postureRule = "REVIEW POSTURE: Selective expansion. Hold core scope rigid. Only suggest additions that address gaps from the completeness assessment. Each suggestion must explain: what gap it fills, what goes wrong if skipped. Target: raise completeness to 9+/10 with minimal additions."
			case ReviewPostureHoldScope:
				postureRule = "REVIEW POSTURE: Hold scope. Do NOT propose any additions or changes. Surface risks as observations, not change requests. Your job is to confirm the spec is ready, not to improve it."
			case ReviewPostureScopeExpansion:
				postureRule = "REVIEW POSTURE: Scope expansion. Actively look for adjacent concerns and missing features. Each expansion must ride on infrastructure already being built. Present ALL suggestions as a multi-select table with columns: Addition | Why it rides cheap | LOC estimate."
			default:
				postureRule = "REVIEW POSTURE: Scope reduction. Identify everything that can be deferred. For each item: what's deferred, risk of deferring, minimal viable version. Present cut list for user approval."
			}

			stageRules = []any{postureRule}

			if refinement.has("completenessScore") {
				stageRules = append(stageRules, "RE-ASSESSMENT: After posture-guided review is complete, re-score the 6 completeness dimensions. Show delta: what was addressed (✓), what remains (△). Submit updated score as JSON {completeness: {...}} before CEO review.")
			}

			stageRules = append(stageRules, "When posture-guided review is complete, produce the CEO REVIEW ANALYSIS (see CEO review protocol rules below). Submit it as JSON {ceoReview: {...}, reflection?: '...'} to record it.")

			if posture == "" && !refinement.has("reviewPosture") {
				posture = ReviewPostureSelectiveExpansion
			}

			stageRules = append(stageRules, ceoReviewRules(posture)...)
		default:
			stageRules = []any{"CEO review is complete. Present the updated completeness score delta, the readiness dashboard verdict, and ask the user to advance (approve), revise, or park the spec."}
			if hints.HasAskUserTool {
				stageRules = append(stageRules, "Use AskUserQuestion to present: updated completeness (delta table), readiness verdict, and options: advance / revise / park.")
			} else {
				stageRules = append(stageRules, "Present delta and verdict. User answers: approve (advance), revise (return to stage-a), or park (cancel).")
			}
		}

		tone := "Decisive closer. Present delta and get a final decision."

		switch stage {
		case "stage-a":
			tone = "Structured evaluator. Score honestly — do not inflate."
		case "stage-b":
			tone = "Posture-guided reviewer. Follow the posture rules exactly."
		}

		return JSObjectOf(
			"modeOverride", planModeOverride,
			"rules", rules(mandatory, []any{readOnlyRule(hints)}, stageRules, discoveryConductRules(),
				concernConductRules(concerns, PhaseDiscoveryRefinement)),
			"tone", tone,
		)
	case PhaseSpecProposal:
		var delegationRules []any

		if delegations := objectsOf(discoveryOf(state).arr("delegations")); len(delegations) > 0 {
			lines := make([]string, len(delegations))
			pending, answered := 0, 0

			for i, d := range delegations {
				status := "PENDING"

				switch d.str("status") {
				case "answered":
					status = "ANSWERED ✓"
					answered++
				case "pending":
					pending++
				}

				lines[i] = "- " + d.str("questionId") + ": delegated to " + d.str("delegatedTo") + " — " + status
			}

			tail := "\nAll " + jsNumberString(float64(answered)) + " delegation(s) answered. Approve is allowed."
			if pending > 0 {
				tail = "\nApprove BLOCKED — " + jsNumberString(float64(pending)) + " pending delegation(s)."
			}

			delegationRules = []any{"DELEGATION STATUS:\n" + strings.Join(lines, "\n") + tail}
		}

		classificationRule := "When presenting classification options, present them as a numbered list with multiselect (user picks multiple numbers). Do NOT infer classification yourself."
		if hints.HasAskUserTool {
			classificationRule = "When presenting classification options, use AskUserQuestion with multiSelect:true. Do NOT infer classification yourself."
		}

		return JSObjectOf(
			"modeOverride", planModeOverride,
			"rules", rules(mandatory, delegationRules, []any{
				readOnlyRule(hints),
				"Read the spec and present a summary to the user.",
				"Flag any tasks that are too vague to execute.",
				"Flag any missing acceptance criteria.",
				"No placeholders in specs. If a task has 'TBD', 'TODO', 'to be determined', 'details to follow', or 'implement appropriate X' — fill in the detail or remove the task and add it as an open question.",
				"Ask the user if they want to refine before approving.",
				classificationRule,
				"When generating or refining tasks, include a 'Files:' hint listing likely files to create/modify. Format: 'Files: `path/to/file.ts`, `path/to/other.ts`'. Hints, not constraints — helps sub-agents load right context.",
				"If you identify issues in the spec (vague tasks, irrelevant sections, missing acceptance criteria), submit a refinement via: `" +
					c.cs(`next --answer='{"refinement":"task-1: Add upload endpoint, task-2: Add validation middleware, task-3: Write integration tests"}'`) +
					"`. The spec will be updated and you can review again.",
			}),
			"tone", "Thoughtful reviewer preparing to hand off to an implementer.",
		)
	case PhaseSpecApproved:
		confirm := "Before starting execution, show the spec summary to the user and ask for final confirmation. Present 'Start execution' and 'Not yet' as numbered options."
		if hints.HasAskUserTool {
			confirm = "Before starting execution, show the spec summary to the user and ask for final confirmation via AskUserQuestion."
		}

		return JSObjectOf(
			"rules", rules(mandatory, []any{
				"The spec is approved but execution has not started.",
				"Do not start coding until the user triggers execution.",
				"If the user wants changes, they must reset and re-spec.",
				confirm,
			}),
			"tone", "Patient. Wait for the go signal.",
		)
	case PhaseExecuting:
		return c.executingBehavioral(mandatory)
	case PhaseBlocked:
		return JSObjectOf(
			"rules", rules(mandatory, []any{
				"MODE: Enter plan mode. Analyze the blocker. Present options to the user. Do not edit files.",
				"Present the decision to the user exactly as described.",
				"Do not suggest a preferred option unless the user asks for your opinion.",
				"After the user decides, submit the decision right away with `" + c.csScoped(`next --answer="<decision>"`) + "`.",
			}),
			"tone", "Brief. The user is making a decision, not having a discussion.",
		)
	case PhaseCompleted:
		return JSObjectOf(
			"rules", rules(mandatory, []any{
				"Report the completion summary. Do not start new work.",
				"If the user wants to continue, they start a new spec.",
			}),
			"tone", "Concise. Celebrate briefly, then stop.",
		)
	default:
		return JSObjectOf(
			"rules", rules(mandatory, []any{
				"Run `" + c.cs("next") + "` to get your instructions.",
				"Do not take action without noskills guidance.",
			}),
			"tone", "Neutral. Waiting for direction.",
		)
	}
}

func (c *compiler) executingBehavioral(mandatory []any) *JSObject {
	hints := c.in.Hints
	reportCmd := c.cs(`next --answer='{"completed":[...],"remaining":[...],"blocked":[...]}'`)

	var spawn, verify string

	switch hints.SubAgentMethod {
	case "task":
		spawn = "Spawn noskills-executor via Agent tool. Pass: task title, description, ACs, rules, scope constraints, concern reminders, file paths. Report via `" + reportCmd + "`."
		verify = "After executor completes, spawn noskills-verifier with changed files + ACs + test commands. Never trust executor self-report alone. " + verifierScope
	case "spawn":
		spawn = "Use spawn_agent for noskills-executor. Pass: task, ACs, rules, scope, file paths. Use wait_agent to collect. Report via `" + reportCmd + "`."
		verify = "After executor completes, spawn noskills-verifier with changed files + ACs + test commands. " + verifierScope
	case "fleet":
		spawn = "Use /fleet for parallel executors. Pass each: task, ACs, rules, scope, file paths. Report via `" + reportCmd + "`."
		verify = "After fleet completes, run verification pass. " + verifierScope
	case "delegation":
		spawn = "Use Kiro agent delegation for noskills-executor. Pass: task, ACs, rules, scope, file paths. Report via `" + reportCmd + "`."
		verify = "After executor completes, delegate to noskills-verifier with changed files + ACs + test commands. " + verifierScope
	default:
		spawn = "Execute tasks sequentially yourself. Verify (type-check + tests) after each. Report via `" + reportCmd + "`."
	}

	subAgents := hints.SubAgentMethod != "none"

	orchestrator := spawn
	if subAgents {
		orchestrator = "You are the orchestrator. NEVER edit files directly — delegate ALL edits to noskills-executor. " +
			spawn + " On sub-agent failure, fall back to direct execution and note it in status."
	}

	rules := append([]any{}, mandatory...)
	rules = append(rules,
		"MODE: You MUST NOT be in plan mode during execution. If you are in plan mode, exit it now. Sub-agents need full write access.",
		orchestrator,
	)

	if verify != "" {
		rules = append(rules, verify)
	}

	rules = append(rules, "Do not explore beyond current task. Do not refactor outside scope. Do not add features, tests, or docs not in the spec.")

	if subAgents {
		rules = append(rules, "Show a dispatch table: | Step | Agent | Files | Tasks | Est. |. Separate executor for implementation vs tests. Batch tightly-coupled files; parallelize independent modules.")
	}

	rules = append(rules, "Run type-check and lint after edits; never mark an AC passed while type-check fails.")

	if !hints.Headless {
		rules = append(rules, "On recurring patterns or corrections, ask: 'Permanent rule or just this task?' If permanent: `"+
			c.cmd(`rule add "<description>"`)+"`. Never write to `.eser/rules/` directly.")
	}

	rules = append(rules,
		"Work through the spec's tasks to the end; the user decides when to stop.",
		"Base every status claim on evidence: run the command, read the output, report what it showed.",
		"TDD: (1) Write test. (2) Run it — MUST fail. If it passes before implementation, the test is wrong. (3) Implement. (4) Run test — must pass. Skipping step 2 means the test is unverified.",
		"Parallel vs serial sub-agents: PARALLEL when tasks touch different files with no shared state. SERIAL when tasks modify same files or depend on each other. When unsure, default to serial.",
	)

	if subAgents {
		rules = append(rules, "After each task, spawn noskills-verifier and include its PASS/FAIL results in the status report before reporting the task done.")
	} else {
		rules = append(rules, "VERIFICATION REQUIRED: After EVERY task completion, run type-check + tests before reporting done. Evidence of passing tests must be included in the status report.")
	}

	if verification := executionOf(c.state()).obj("lastVerification"); verification != nil {
		if passed, ok := verification.get("passed"); ok && passed == false {
			rules = append(rules, "Tests are failing. Fix ONLY the failing tests. Do not refactor passing code.")
		}
	}

	out := JSObjectOf("rules", rules, "tone", "Direct. Orchestrate immediately — spawn sub-agents.")

	if c.in.Parsed != nil && len(c.in.Parsed.OutOfScope) > 0 {
		out.set("outOfScope", anyOf(c.in.Parsed.OutOfScope))
	}

	return out
}
