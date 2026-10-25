// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// The DISCOVERY output (compileDiscovery in context/compiler.ts): listen
// first, the discovery mode, the premise challenge, then the base questions
// together and each follow-up on its own (TASK-166).

func (c *compiler) reminders() []any {
	reminders := GetReminders(c.in.ActiveConcerns, c.classification())
	if reminders == nil {
		return []any{}
	}

	return anyOf(reminders)
}

func (c *compiler) contextBlock(rules []any, reminders []any) *JSObject {
	return JSObjectOf("rules", rules, "concernReminders", reminders)
}

func (c *compiler) rulesValue() []any {
	if c.in.Rules == nil {
		return []any{}
	}

	return anyOf(c.in.Rules)
}

// multiUserFields are currentUser, previousContributors and notes, each
// only when it has data.
func (c *compiler) multiUserFields() []any {
	var fields []any

	if c.in.CurrentUser != nil {
		fields = append(fields, "currentUser", c.userObject())
	}

	counts := map[string]int{}

	var order []string

	for _, answer := range answersObjects(c.state()) {
		name := "Unknown User"
		if user, ok := answer.get("user"); ok {
			name = jsDisplay(user)
		}

		if c.in.CurrentUser != nil && name == c.in.CurrentUser.Name {
			continue
		}

		if _, seen := counts[name]; !seen {
			order = append(order, name)
		}

		counts[name]++
	}

	if len(order) > 0 {
		contributors := make([]any, len(order))

		for i, name := range order {
			suffix := ""
			if counts[name] > 1 {
				suffix = "s"
			}

			contributors[i] = JSObjectOf("name", name, "contributions", jsNumberString(float64(counts[name]))+" answer"+suffix)
		}

		fields = append(fields, "previousContributors", contributors)
	}

	var notes []any

	for _, note := range objectsOf(c.state().arr("specNotes")) {
		if !strings.HasPrefix(note.str("text"), "[TASK] ") {
			notes = append(notes, JSObjectOf("text", note.getOr("text"), "user", note.getOr("user")))
		}
	}

	if len(notes) > 0 {
		fields = append(fields, "notes", notes)
	}

	return fields
}

func (c *compiler) userObject() *JSObject {
	return JSObjectOf("name", c.in.CurrentUser.Name, "email", c.in.CurrentUser.Email)
}

func (c *compiler) planImportedFields() []any {
	if discoveryOf(c.state()).isNullish("planPath") {
		// planPath === null; a missing planPath (undefined) is "not null"
		// in TypeScript and counts as imported.
		if _, present := discoveryOf(c.state()).get("planPath"); present {
			return nil
		}
	}

	return []any{"planImported", true}
}

// withCurrentUser is `{ ...output, currentUser }` when there is a user.
func (c *compiler) withCurrentUser(out *JSObject) *JSObject {
	if c.in.CurrentUser != nil {
		out.set("currentUser", c.userObject())
	}

	return out
}

func (c *compiler) discovery() *JSObject { //nolint:cyclop,funlen,gocognit // the stages and modes of compileDiscovery
	state := c.state()
	discovery := discoveryOf(state)
	allQuestions := GetQuestionsWithExtras(c.in.ActiveConcerns)
	answers := discovery.arr("answers")
	answeredCount := jsInteger(len(answers))
	allAnswered := discoveryCompleteObject(answers)
	isAgent := discovery.str("audience") == "agent"
	userFields := c.multiUserFields()
	mode, hasMode := discovery.get("mode")

	switch discoveryStageOfRaw(state) {
	case "listen":
		var detected *detectedPlan
		if c.in.ProjectRoot != "" {
			detected = detectActivePlan(c.in.ProjectRoot, c.in.Now)
		}

		instruction := "The user just created this spec. Before starting discovery, ask them to share whatever context they have (requirements, notes, tasks, or just a brief description). Say: 'Tell me about this. Share as much context as you have.' Listen first, then proceed."
		if detected != nil {
			warning := ""
			if detected.quality == "sparse" {
				warning = "\n⚠ The plan appears sparse — limited content detected."
			}

			instruction += "\n\nA plan.md was detected (" + detected.ageLabel + ", " + detected.path + ")." + warning +
				"\nYou can import it or share your own context directly."
		}

		out := JSObjectOf(
			"phase", PhaseDiscovery,
			"instruction", instruction,
			"questions", []any{},
			"answeredCount", 0.0,
			"context", c.contextBlock(c.rulesValue(), c.reminders()),
			"transition", JSObjectOf("onComplete", c.cs(`next --answer="<user context or just start>"`)),
		)
		setPairs(out, userFields)

		if detected != nil {
			out.set("activePlanDetected", JSObjectOf("path", detected.path, "age", detected.ageLabel,
				"preview", detected.preview, "quality", detected.quality))
		}

		return c.withCurrentUser(out)
	case "mode":
		out := JSObjectOf(
			"phase", PhaseDiscovery,
			"instruction", "Before starting discovery, select the discovery mode that best fits this spec.",
			"questions", []any{},
			"answeredCount", 0.0,
			"context", c.contextBlock(c.rulesValue(), c.reminders()),
			"transition", JSObjectOf("onComplete", c.cs(`next --answer="<mode>"`)),
			"modeSelection", JSObjectOf(
				"required", true,
				"instruction", "Select the discovery mode.",
				"options", []any{
					JSObjectOf("id", "full", "label", "Full discovery", "description", "Standard 6 questions with all concern extras. Default for new features."),
					JSObjectOf("id", "validate", "label", "Validate my plan", "description", "I already know what I want — challenge my assumptions, find gaps."),
					JSObjectOf("id", "technical-depth", "label", "Technical depth", "description", "Focus on architecture, data flow, performance, integration points."),
					JSObjectOf("id", "ship-fast", "label", "Ship fast", "description", "Minimum viable scope. What can we defer? What's the MVP?"),
					JSObjectOf("id", "explore", "label", "Explore scope", "description", "Think bigger. 10x version? Adjacent opportunities? What are we missing?"),
				},
			),
		)

		if c.in.ProjectRoot != "" {
			if learnings := relevantLearnings(c.in.ProjectRoot, state.str("specDescription")); len(learnings) > 0 {
				out.set("previousLearnings", anyOf(learnings))
			}
		}

		return c.withCurrentUser(out)
	case "premises":
		var prompts []string

		switch mode {
		case DiscoveryModeShipFast:
			prompts = []string{"Narrowest Wedge: What's the absolute minimum version of this that creates real, measurable value — without any surrounding features?"}
		case DiscoveryModeExplore:
			prompts = []string{
				"Demand Reality: What do users actually do today when they can't use this feature? Describe concrete workarounds — not hypothetical ones.",
				"Status Quo: Why hasn't this been solved before? What existing solution is insufficient, and specifically where does it break down?",
				"Desperate Specificity: Describe the exact moment a real user feels this pain — who, where, what did they do next?",
				"Narrowest Wedge: What's the smallest version of this that creates real value?",
				"Observation & Surprise: What's the most surprising thing you know about this problem or this user?",
				"Think bigger: If this works perfectly, what's the 10x version? What should you build next?",
			}
		default:
			prompts = []string{
				"Demand Reality: What do users actually do today when they can't use this feature? Describe concrete workarounds — not hypothetical ones.",
				"Status Quo: Why hasn't this been solved before? What existing solution is insufficient, and specifically where does it break down?",
				"Desperate Specificity: Describe the exact moment a real user feels this pain. Name them if possible. What did they do next?",
				"Narrowest Wedge: What's the smallest version of this that creates real, measurable value — without the surrounding features?",
				"Observation & Surprise: What's the most surprising thing you've learned from watching real users encounter this problem?",
				"Future-Fit: If this works perfectly in 6 months, what should you build next? Does that constrain any decisions you're making now?",
			}
		}

		planDocument := ""
		if planPath, present := discovery.get("planPath"); !present || planPath != nil {
			planDocument = " and the plan document"
		}

		out := JSObjectOf(
			"phase", PhaseDiscovery,
			"instruction", "Before asking discovery questions, challenge the premises of this spec.",
			"questions", []any{},
			"answeredCount", 0.0,
			"context", c.contextBlock(c.rulesValue(), c.reminders()),
			"transition", JSObjectOf("onComplete", c.cs(`next --answer='{"premises":[...]}'`)),
		)
		setPairs(out, c.planImportedFields())
		out.set("premiseChallenge", JSObjectOf(
			"required", true,
			"instruction", "Read the spec description"+planDocument+`. Identify 2-4 premises the spec assumes. Present each premise and ask the user to agree or disagree. Submit as JSON: {"premises":[{"text":"...","agreed":true/false,"revision":"..."}]}`,
			"prompts", anyOf(prompts),
		))

		return c.withCurrentUser(out)
	}

	rulesWithMode := c.rulesValue()
	if hasMode {
		rulesWithMode = append(append([]any{}, rulesWithMode...), anyOf(modeRules(jsDisplay(mode)))...)
	}

	description := state.str("specDescription")
	richDescription := jsLength(description) > 500

	var agreed, revised []any

	for _, premise := range objectsOf(discovery.arr("premises")) {
		if jsTruthy(premise.getOr("agreed")) {
			agreed = append(agreed, premise.getOr("text"))
		} else if premise.has("revision") {
			revised = append(revised, JSObjectOf("original", premise.getOr("text"), "revision", premise.getOr("revision")))
		}
	}

	pending := pendingFollowUps(state)

	if allAnswered && len(pending) > 0 {
		out := c.followUpStep(pending, allQuestions, c.contextBlock(rulesWithMode, c.reminders()))
		setPairs(out, userFields)
		setPairs(out, c.planImportedFields())

		return out
	}

	history := objectsOf(state.arr("revisitHistory"))

	var lastRevisit *JSObject
	if len(history) > 0 {
		lastRevisit = history[len(history)-1]
	}

	if allAnswered {
		instruction := "All discovery questions answered. Run: `" + c.cs("approve") + "`"
		if lastRevisit != nil {
			instruction = "This spec was revisited from " + revisitedFrom(lastRevisit) + ". All previous answers are preserved. Review and approve, or revise answers before regenerating the spec."
		}

		out := JSObjectOf(
			"phase", PhaseDiscovery,
			"instruction", instruction,
			"questions", []any{},
			"answeredCount", answeredCount,
			"context", c.contextBlock(c.rulesValue(), []any{}),
			"transition", JSObjectOf("onComplete", c.cs("approve")),
		)
		setPairs(out, userFields)
		setPairs(out, c.planImportedFields())

		if lastRevisit != nil {
			c.setRevisit(out, lastRevisit)
		}

		return out
	}

	answered := answeredQuestionIDs(answers)

	var unanswered []any

	var template []string

	for _, q := range allQuestions {
		if answered[q.ID] {
			continue
		}

		extras := make([]any, len(q.Extras))
		for i, e := range q.Extras {
			extras[i] = e.Text
		}

		unanswered = append(unanswered, JSObjectOf("id", q.ID, "text", q.Text, "concerns", anyOf(q.Concerns), "extras", extras))
		template = append(template, jsonStringify(q.ID)+`:"..."`)
	}

	answerTemplateText := "{" + strings.Join(template, ",") + "}"

	if isAgent {
		submit := c.cs("next --agent --answer='" + answerTemplateText + "'")
		out := JSObjectOf(
			"phase", PhaseDiscovery,
			"instruction", baseQuestionsInstruction(len(unanswered), c.in.Hints, c.cs(`followup <questionId> "question"`), submit),
			"questions", unanswered,
			"answeredCount", answeredCount,
			"totalQuestions", jsInteger(len(allQuestions)),
			"context", c.contextBlock(rulesWithMode, c.reminders()),
			"transition", JSObjectOf("onComplete", submit),
		)
		setPairs(out, userFields)
		setPairs(out, c.planImportedFields())

		if len(agreed) > 0 {
			out.set("agreedPremises", agreed)
		}

		if len(revised) > 0 {
			out.set("revisedPremises", revised)
		}

		if len(pending) > 0 {
			out.set("pendingFollowUps", anyOfObjects(pending))
		}

		var hints []any

		for _, answer := range objectsOf(answers) {
			for _, hint := range followUpHints(answer.str("answer")) {
				hints = append(hints, answer.str("questionId")+": "+hint)
			}
		}

		if len(hints) > 0 {
			out.set("followUpHints", hints)
		}

		if len(answers) == 0 {
			c.setFirstCallContext(out, richDescription, description,
				"The user provided a detailed description. For each question, extract relevant info and present as a pre-filled suggestion. When extracting answers from the description, mark each extraction as [STATED] (directly written by the user) or [INFERRED] (your interpretation). Present extractions individually for confirmation.")
		}

		return out
	}

	instruction := "Conduct a thorough discovery conversation. FIRST: perform a pre-discovery codebase scan (README, CLAUDE.md, recent git log, TODOs, directory structure) and present a brief audit summary. THEN: challenge the user's spec description against your findings. THEN: ask the unanswered discovery questions together, offering concrete options based on codebase knowledge, and register a follow-up for each unclear answer with `" +
		c.cs(`followup <questionId> "question"`) +
		"` before you submit; noskills then gives you each follow-up on its own. AFTER questions: present a dream state table (current → this spec → future), scored expansion proposals, architectural decisions, and an error/rescue map. FINALLY: present a complete discovery synthesis for user confirmation before submitting answers as a JSON object."
	if lastRevisit != nil {
		instruction = "This spec was revisited from " + revisitedFrom(lastRevisit) + ". Previous discovery answers are preserved — review and revise as needed, or approve to regenerate tasks."
	}

	out := JSObjectOf(
		"phase", PhaseDiscovery,
		"instruction", instruction,
		"questions", unanswered,
		"answeredCount", answeredCount,
		"context", c.contextBlock(rulesWithMode, c.reminders()),
		"transition", JSObjectOf("onComplete", c.cs("next --answer='"+answerTemplateText+"'")),
	)
	setPairs(out, userFields)
	setPairs(out, c.planImportedFields())

	if len(agreed) > 0 {
		out.set("agreedPremises", agreed)
	}

	if len(revised) > 0 {
		out.set("revisedPremises", revised)
	}

	if lastRevisit != nil {
		c.setRevisit(out, lastRevisit)

		return out
	}

	if len(answers) == 0 {
		c.setFirstCallContext(out, richDescription, description,
			"The user provided a detailed description. For each question, extract relevant info and present as a pre-filled suggestion.")
	}

	return out
}

// setPairs sets key, value pairs in order.
func setPairs(o *JSObject, pairs []any) {
	for i := 0; i+1 < len(pairs); i += 2 {
		key, _ := pairs[i].(string)
		o.set(key, pairs[i+1])
	}
}

func (c *compiler) setRevisit(out, entry *JSObject) {
	completed := entry.arr("completedTasks")

	out.set("revisited", true)
	out.set("revisitReason", entry.getOr("reason"))
	out.set("previousProgress", JSObjectOf("completedTasks", appendAny(completed), "totalTasks", jsInteger(len(completed))))
}

// setFirstCallContext adds the research, plan and rich description of the
// first set of questions.
func (c *compiler) setFirstCallContext(out *JSObject, rich bool, description, richInstruction string) {
	state := c.state()

	if research := preDiscoveryResearch(state.getOr("specDescription")); research != nil {
		out.set("preDiscoveryResearch", research)
	}

	planCtx := planContext(discoveryOf(state).getOr("planPath"))
	if planCtx != nil {
		out.set("planContext", planCtx)
	}

	if rich && planCtx == nil {
		out.set("richDescription", JSObjectOf(
			"provided", true,
			"length", jsInteger(jsLength(description)),
			"content", description,
			"instruction", richInstruction,
		))
	}
}

// followUpStep is compileFollowUpStep.
func (c *compiler) followUpStep(pending []*JSObject, allQuestions []QuestionWithExtras, context *JSObject) *JSObject {
	followUp := pending[0]
	id := followUp.str("id")
	answerCommand := c.cs("followup " + id + ` --answer="<answer>"`)
	skipCommand := c.cs("followup " + id + " --skip")

	var parent *QuestionWithExtras

	for i := range allQuestions {
		if allQuestions[i].ID == followUp.str("parentQuestionId") {
			parent = &allQuestions[i]

			break
		}
	}

	ask := "Ask the user this follow-up on its own and wait for the answer."
	if c.in.Hints.HasAskUserTool {
		ask = "Ask the user this follow-up on its own, as the only question of an AskUserQuestion call, and wait for the answer."
	}

	parentNote := ""
	concerns := []any{}

	if parent != nil {
		parentNote = ` It follows up the answer to "` + parent.Text + `".`
		concerns = anyOf(parent.Concerns)
	}

	after := "Discovery moves on to the review once this one is answered or skipped."

	switch remaining := len(pending) - 1; remaining {
	case 0:
	case 1:
		after = "1 more follow-up comes after this one, each on its own."
	default:
		after = jsNumberString(float64(remaining)) + " more follow-ups come after this one, each on its own."
	}

	return JSObjectOf(
		"phase", PhaseDiscovery,
		"instruction", ask+parentNote+" Submit the answer with `"+answerCommand+"`, or run `"+skipCommand+"` if the user declines it. "+after,
		"questions", []any{JSObjectOf("id", id, "text", followUp.getOr("question"), "concerns", concerns, "extras", []any{})},
		"answeredCount", jsInteger(len(discoveryOf(c.state()).arr("answers"))),
		"context", context,
		"transition", JSObjectOf("onComplete", answerCommand),
		"pendingFollowUps", anyOfObjects(pending),
	)
}

// baseQuestionsInstruction is baseQuestionsInstruction in compiler.ts.
func baseQuestionsInstruction(count int, hints InteractionHints, followUpCommand, submitCommand string) string {
	n := jsNumberString(float64(count))

	var ask string

	switch {
	case count == 1 && hints.HasAskUserTool:
		ask = "Ask the user this discovery question through AskUserQuestion and wait for the answer."
	case count == 1:
		ask = "Ask the user this discovery question and wait for the answer."
	case !hints.HasAskUserTool:
		ask = "Ask the user these " + n + " discovery questions together in one message, as a numbered list, and wait for the answers."
	case count > 4:
		ask = "Ask the user these " + n + " discovery questions together through AskUserQuestion, up to 4 questions per call, and wait for the answers."
	default:
		ask = "Ask the user these " + n + " discovery questions together in one AskUserQuestion call and wait for the answers."
	}

	return ask + " For an answer that needs a follow-up, register it with `" + followUpCommand +
		"` first. Then submit the confirmed answers as one JSON object: `" + submitCommand +
		"`. noskills then gives you each follow-up on its own."
}

func modeRules(mode string) []string {
	switch mode {
	case DiscoveryModeFull:
		return []string{
			"Ask each discovery question as written. Push for specific, concrete answers.",
			"If the answer is vague, ask follow-up questions before accepting.",
		}
	case DiscoveryModeValidate:
		return []string{
			"The user has a plan. Your job is to challenge it, not explore it.",
			"For each question, identify assumptions and ask: 'What would prove this wrong?'",
			"If the description already answers a question, present your understanding and ask to confirm.",
			"When pre-filling answers from a rich description, plan, or prior discussion, DISTINGUISH between what the user EXPLICITLY STATED and what you INFERRED. Format each pre-filled item as: '[STATED] GPU skinning in all 3 renderers — you said this during technical discussion' or '[INFERRED] tangent space is 10-star scope — I assumed this based on complexity'. The user confirms stated items and corrects inferred items.",
			"Present each pre-filled answer as an item of its own that the user confirms or corrects, not as one completed block. The user's job is to correct your inferences, not rubber-stamp your summary. If you pre-fill 5 items and 2 are wrong, the user must be able to catch them individually.",
		}
	case DiscoveryModeTechnicalDepth:
		return []string{
			"Focus on architecture, data flow, performance, and integration points.",
			"Before each question, scan the codebase for related implementations.",
			"Ask: 'How does this interact with [existing system]?' for each integration point.",
		}
	case DiscoveryModeShipFast:
		return []string{
			"Focus on minimum viable scope.",
			"For each question, also ask: 'What can we defer to a follow-up?'",
			"Push for the smallest version that delivers value.",
		}
	case DiscoveryModeExplore:
		return []string{
			"Think bigger. What's the 10x version?",
			"For each question, ask about adjacent opportunities.",
			"Suggest possibilities the user might not have considered.",
		}
	default:
		return nil
	}
}

// followUpHints is generateFollowUpHints.
func followUpHints(answer string) []string {
	lower := jsToLower(answer)
	has := func(words ...string) bool {
		for _, w := range words {
			if strings.Contains(lower, w) {
				return true
			}
		}

		return false
	}

	var hints []string

	for _, tech := range []string{"websocket", "graphql", "grpc", "redis", "postgres", "mongodb", "kafka", "rabbitmq", "docker", "kubernetes", "lambda", "s3"} {
		if strings.Contains(lower, tech) {
			hints = append(hints, "Answer mentions "+tech+" — consider: error handling, versioning, fallback strategy")
		}
	}

	if has("should work", "standard approach", "probably", "i think", "not sure") {
		hints = append(hints, "Answer is vague — ask for specifics")
	}

	if has("and also", "we might", "could also", "maybe we should") {
		hints = append(hints, "Scope expansion signal — clarify if in scope or deferred")
	}

	if has("tricky", "complicated", "risky", "not sure about") {
		hints = append(hints, "Risk signal — dig deeper into what makes it risky")
	}

	if has("depends on", "after", "blocked by", "waiting for") {
		hints = append(hints, "Dependency detected — clarify what happens if dependency isn't ready")
	}

	if has("real-time", "scalab", "performance", "latency", "concurrent") {
		hints = append(hints, "Performance/scale mention — ask about limits, degradation, monitoring")
	}

	return hints
}

var versionTerm = regexp.MustCompile(`(?i)\b(Node\.?js|Deno|Bun|Go|Rust|Python|Ruby|Java|Kotlin|Swift|PHP|React|Vue|Angular|Svelte|Next\.?js|Nuxt|Remix|Astro|SolidJS|Qwik|TypeScript|Webpack|Vite|esbuild|Rollup|Terraform|Docker|Kubernetes|PostgreSQL|MySQL|Redis|MongoDB|SQLite|Prisma|Drizzle|gRPC|GraphQL|tRPC)` + jsSpace + `+v?(\d+(?:\.\d+)?(?:\.\d+)?\+?)\b`) //nolint:gochecknoglobals // compiled once

func preDiscoveryResearch(description any) *JSObject {
	text, _ := description.(string)

	matches := versionTerm.FindAllStringSubmatch(text, -1)
	terms := make([]any, 0, len(matches))

	for _, m := range matches {
		terms = append(terms, m[1]+" "+m[2])
	}

	if len(terms) == 0 {
		return nil
	}

	return JSObjectOf(
		"required", true,
		"instruction", "Before asking discovery questions, research the current state of all platforms, runtimes, libraries, and APIs mentioned in the spec description. Use web search and Context7 MCP if available. Report findings as a pre-discovery brief to the user. Do NOT assume your training data is current — versions change, APIs get added, features get deprecated.",
		"extractedTerms", terms,
	)
}

const maxPlanSize = 50 * 1024

// planContext is buildPlanContext: the plan file (relative to the working
// directory, as the TypeScript CLI reads it) when it is under 50 KB.
func planContext(planPath any) *JSObject {
	path, ok := planPath.(string)
	if !ok {
		return nil
	}

	data, err := os.ReadFile(path) //nolint:gosec // G304: the plan file the user named with --from-plan
	if err != nil || jsLength(string(data)) > maxPlanSize {
		return nil
	}

	return JSObjectOf(
		"provided", true,
		"content", string(data),
		"instruction", "A plan document was provided. Read it carefully, extract relevant information for each discovery question, and present pre-filled answers for user review. Do NOT skip any question — present your extraction and let the user confirm, correct, or expand. When extracting answers from the plan, mark each extraction as [STATED] (directly written in the plan) or [INFERRED] (your interpretation). Present extractions individually for confirmation.",
	)
}

type detectedPlan struct {
	path     string
	ageLabel string
	preview  string
	quality  string
}

var (
	planFrontmatter = regexp.MustCompile(`^---[\s\S]*?---\n?`) //nolint:gochecknoglobals // compiled once
	planHeading     = regexp.MustCompile(`(?m)^## `)           //nolint:gochecknoglobals // compiled once
	jsSpaceRun      = regexp.MustCompile(jsSpace)              //nolint:gochecknoglobals // compiled once
)

// detectActivePlan finds a plan.md, PLAN.md or .claude/plan.md changed in
// the last 24 hours and under 50 KB.
func detectActivePlan(root string, now time.Time) *detectedPlan {
	for _, candidate := range []string{root + "/plan.md", root + "/PLAN.md", root + "/.claude/plan.md"} {
		info, err := os.Stat(filepath.FromSlash(candidate))
		if err != nil {
			continue
		}

		age := now.Sub(info.ModTime())
		if age > 24*time.Hour {
			continue
		}

		data, err := os.ReadFile(filepath.FromSlash(candidate)) //nolint:gosec // G304: the project's plan file
		if err != nil || jsLength(string(data)) > maxPlanSize {
			continue
		}

		stripped := jsReplaceFirstRegexp(string(data), planFrontmatter, "")

		var lines []string

		for _, line := range strings.Split(stripped, "\n") {
			if jsTrim(line) != "" {
				lines = append(lines, line)
			}
		}

		preview := jsSliceUnits(strings.Join(lines[:min(3, len(lines))], "\n"), 200)
		quality := "sparse"

		if jsLength(jsSpaceRun.ReplaceAllString(stripped, "")) >= 100 && planHeading.MatchString(stripped) {
			quality = "ok"
		}

		ms := age.Milliseconds()

		var label string

		switch {
		case ms < 60_000:
			label = "just now"
		case ms/3_600_000 > 0:
			label = jsNumberString(float64(ms/3_600_000)) + "h ago"
		default:
			label = jsNumberString(float64((ms%3_600_000)/60_000)) + "m ago"
		}

		return &detectedPlan{path: candidate, ageLabel: label, preview: preview, quality: quality}
	}

	return nil
}

// relevantLearnings is getRelevantLearnings and formatLearnings.
func relevantLearnings(root, description string) []string {
	data, err := os.ReadFile(filepath.Join(root, eserDir, "learnings.jsonl")) //nolint:gosec // G304: the project's learnings
	if err != nil {
		return nil
	}

	var all []*JSObject

	for line := range strings.SplitSeq(jsTrim(string(data)), "\n") {
		if line == "" {
			continue
		}

		if parsed, err := parseJSON(line); err == nil {
			if o, ok := parsed.(*JSObject); ok {
				all = append(all, o)
			}
		}
	}

	if len(all) == 0 {
		return nil
	}

	descWords := map[string]bool{}
	for _, w := range jsSplitWhitespace(jsToLower(description)) {
		if jsLength(w) > 3 {
			descWords[w] = true
		}
	}

	type scored struct {
		learning *JSObject
		score    int
	}

	list := make([]scored, len(all))

	for i, learning := range all {
		score := 0

		switch learning.str("severity") {
		case "high":
			score += 3
		case "medium":
			score++
		}

		if learning.str("type") == "convention" {
			score += 2
		}

		for _, w := range jsSplitWhitespace(jsToLower(learning.str("text"))) {
			if jsLength(w) > 3 && descWords[w] {
				score += 2
			}
		}

		if jsLength(learning.str("text")) < 80 {
			score++
		}

		list[i] = scored{learning, score}
	}

	sort.SliceStable(list, func(a, b int) bool { return list[a].score > list[b].score })

	var out []string

	for _, s := range list[:min(5, len(list))] {
		icon, label := "⚠", "Dependency"

		switch s.learning.str("type") {
		case "mistake":
			icon, label = "⚠", "Past mistake"
		case "success":
			icon, label = "✓", "Success"
		case "convention":
			icon, label = "✓", "Convention"
		}

		out = append(out, icon+" "+label+": "+jsDisplay(s.learning.getOr("text"))+" (from spec: "+jsDisplay(s.learning.getOr("spec"))+")")
	}

	return out
}

// revisitedFrom is `${lastRevisit.from}`: the phase the spec was revisited
// from.
func revisitedFrom(lastRevisit *JSObject) string {
	from, present := lastRevisit.get("from")

	return templateOf(from, present)
}
