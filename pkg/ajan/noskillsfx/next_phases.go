// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"strings"
)

// The outputs of the phases after DISCOVERY (compileDiscoveryReview,
// compileSpecDraft, compileSpecApproved, compileExecution, compileBlocked
// and compileCompleted in context/compiler.ts).

func (c *compiler) discoveryReview() *JSObject { //nolint:funlen // one output object, built in order
	state := c.state()
	discovery := discoveryOf(state)
	allQuestions := GetQuestionsWithExtras(c.in.ActiveConcerns)
	answers := answersObjects(state)

	reviewAnswers := make([]any, len(answers))

	for i, a := range answers {
		question := a.getOr("questionId")

		for _, q := range allQuestions {
			if q.ID == a.str("questionId") {
				question = q.Text

				break
			}
		}

		reviewAnswers[i] = JSObjectOf("questionId", a.getOr("questionId"), "question", question, "answer", a.getOr("answer"))
	}

	split := AnalyzeForSplit(answers)

	if discovery.isTrue("approved") && split.Detected {
		return JSObjectOf(
			"phase", PhaseDiscoveryRefinement,
			"instruction", "Discovery answers are approved. noskills detected multiple independent work areas in this spec. Present the split proposal to the user and let them decide whether to keep as one spec or split into separate specs.",
			"answers", reviewAnswers,
			"transition", JSObjectOf(
				"onApprove", c.cs(`next --answer="keep"`),
				"onRevise", c.cs(`next --answer='{"revise":{"status_quo":"corrected answer"}}'`),
			),
			"splitProposal", split.object(),
		)
	}

	if discovery.isTrue("approved") && !discovery.isTrue("alternativesPresented") {
		instruction := "Generate 2-3 approaches from discovery answers and codebase. Present them as a numbered list and ask the user to pick one."
		if c.in.Hints.OptionPresentation == "tool" {
			instruction = "Generate 2-3 approaches from discovery answers and codebase. Present via AskUserQuestion."
		}

		return JSObjectOf(
			"phase", PhaseDiscoveryRefinement,
			"subPhase", "alternatives",
			"instruction", "Based on discovery answers, propose 2-3 distinct implementation approaches. Present each with name, summary, effort (S/M/L/XL), risk (Low/Med/High), pros, and cons. Ask the user to choose one, or skip.",
			"answers", reviewAnswers,
			"transition", JSObjectOf(
				"onApprove", c.cs(`next --answer='{"approach":"A","name":"...","summary":"...","effort":"M","risk":"Low"}'`),
				"onRevise", c.cs(`next --answer="skip"`),
			),
			"alternatives", JSObjectOf(
				"required", true,
				"instruction", instruction,
				"format", JSObjectOf("fields", anyOf([]string{"id", "name", "summary", "effort", "risk", "pros", "cons"})),
			),
		)
	}

	batchWarning := ""
	if discovery.isTrue("batchSubmitted") {
		batchWarning = " These answers arrived in one batch, so noskills cannot tell whether the user confirmed each one. Present each answer on its own and get the user's confirmation for each before approving."
	}

	var instruction string

	if split.Detected {
		instruction = "Present ALL discovery answers to the user for review. ALSO present the split proposal — noskills detected multiple independent areas." + batchWarning
	} else {
		ask := ""
		if c.in.Hints.HasAskUserTool {
			ask = " Use AskUserQuestion to ask for confirmation."
		}

		instruction = "Present ALL discovery answers to the user for review. The user must confirm or correct each answer before the spec can be generated." + ask + batchWarning
	}

	out := JSObjectOf(
		"phase", PhaseDiscoveryRefinement,
		"instruction", instruction,
		"answers", reviewAnswers,
		"transition", JSObjectOf(
			"onApprove", c.cs(`next --answer="approve"`),
			"onRevise", c.cs(`next --answer='{"revise":{"status_quo":"corrected answer"}}'`),
		),
	)

	if split.Detected {
		out.set("splitProposal", split.object())
	}

	if checklist := c.reviewChecklist(); checklist != nil {
		out.set("reviewChecklist", checklist)
	}

	if classification := state.obj("classification"); classification != nil && classification.str("source") == "inferred" {
		out.set("classificationPreview", formatClassificationPreview(classification))
	}

	out.set("subPhase", refinementStage(state))

	refinement := discovery.obj("refinement")
	copyField(out, refinement, "completenessScore")
	copyField(out, refinement, "reviewPosture")

	return out
}

func (c *compiler) reviewChecklist() *JSObject {
	var registries []string

	for _, concern := range c.in.ActiveConcerns {
		for _, registry := range concern.Registries {
			if !containsString(registries, registry) {
				registries = append(registries, registry)
			}
		}
	}

	var dimensions []any

	hasRegistry := false

	for _, concern := range c.in.ActiveConcerns {
		for _, dim := range concern.ReviewDimensions {
			isRegistry := containsString(registries, dim.ID)
			hasRegistry = hasRegistry || isRegistry

			dimensions = append(dimensions, JSObjectOf(
				"id", dim.ID,
				"label", dim.Label,
				"prompt", dim.Prompt,
				"evidenceRequired", dim.EvidenceRequired,
				"isRegistry", isRegistry,
				"concernId", concern.ID,
			))
		}
	}

	if len(dimensions) == 0 {
		return nil
	}

	via := ""
	if c.in.Hints.HasAskUserTool {
		via = " via AskUserQuestion"
	}

	checklist := JSObjectOf(
		"dimensions", dimensions,
		"instruction", "Before approving, review the plan against each dimension below. For dimensions marked evidenceRequired, cite specific files or code. Present findings to the user for each dimension"+via+", one dimension at a time, and wait for the reply before the next.",
	)

	if hasRegistry {
		checklist.set("registryInstruction", "Registry dimensions (isRegistry=true) require a structured table with every row filled. These tables will be included in the generated spec.")
	}

	return checklist
}

func (c *compiler) specPathValue() any {
	if path, ok := c.state().obj("specState").strOK("path"); ok {
		return path
	}

	// `specState.path ?? ""`: a null or missing path prints as "".
	if value, ok := c.state().objOrEmpty("specState").get("path"); ok && value != nil {
		return value
	}

	return ""
}

func (c *compiler) specDraft() *JSObject {
	if c.state().isNullish("classification") {
		if _, present := c.state().get("classification"); present {
			return JSObjectOf(
				"phase", PhaseSpecProposal,
				"instruction", "Before generating the spec, classify what this spec involves. Ask the user to select all that apply.",
				"specPath", c.specPathValue(),
				"transition", JSObjectOf("onApprove", c.cs(`next --answer='{"involvesWebUI":false,"involvesCLI":false,"involvesPublicAPI":false,"involvesMigration":false,"involvesDataHandling":false}'`)),
				"classificationRequired", true,
				"classificationPrompt", JSObjectOf(
					"options", []any{
						JSObjectOf("id", "involvesWebUI", "label", "Web/Mobile UI — layouts, responsive design, visual components"),
						JSObjectOf("id", "involvesCLI", "label", "CLI/Terminal UI — spinners, progress bars, interactive prompts"),
						JSObjectOf("id", "involvesPublicAPI", "label", "Public API changes"),
						JSObjectOf("id", "involvesMigration", "label", "Data migration or schema changes"),
						JSObjectOf("id", "involvesDataHandling", "label", "Data handling or privacy"),
					},
					"instruction", "Select all that apply. Submit as JSON: `"+
						c.cs(`next --answer='{"involvesWebUI":true,"involvesCLI":false,"involvesPublicAPI":false,...}'`)+
						"`. If none apply, answer with: `"+c.cs(`next --answer="none"`)+"`",
				),
			)
		}
	}

	return JSObjectOf(
		"phase", PhaseSpecProposal,
		"instruction", "Spec draft is ready. Self-review before presenting to user.",
		"specPath", c.specPathValue(),
		"transition", JSObjectOf("onApprove", c.cs("approve")),
		"selfReview", JSObjectOf(
			"required", true,
			"checks", anyOf([]string{
				"Placeholder scan: no TBD, TODO, vague requirements",
				"Consistency: tasks match discovery, ACs match tasks",
				"Scope: single spec, not multiple independent subsystems",
				"Ambiguity: every AC has one interpretation",
			}),
			"instruction", "Review draft against these checks. Fix issues inline before presenting to user. Do not ask user to fix — fix it yourself.",
		),
	)
}

func (c *compiler) specApproved() *JSObject {
	return JSObjectOf(
		"phase", PhaseSpecApproved,
		"instruction", "Spec is approved and ready. When the user is ready to start, begin execution.",
		"specPath", c.specPathValue(),
		"transition", JSObjectOf("onStart", c.cs(`next --answer="start"`)),
	)
}

// acRelevant is isACRelevant: whether a concern's acceptance criterion
// applies under the classification.
func acRelevant(text string, classification *SpecClassification) bool {
	if classification == nil {
		return false
	}

	lower := jsToLower(text)
	has := func(words ...string) bool {
		for _, w := range words {
			if strings.Contains(lower, w) {
				return true
			}
		}

		return false
	}

	switch {
	case has("mobile", "layout", "interaction design"):
		return classification.InvolvesWebUI
	case has("ui state", "skeleton ui"):
		return classification.InvolvesWebUI || classification.InvolvesCLI
	case has("readme", "documentation updated") || (has("reflected in") && has("docs")):
		return true
	case has("api doc", "public api"):
		return classification.InvolvesPublicAPI
	case has("migration", "backward compat", "deprecat"):
		return classification.InvolvesMigration
	case has("audit trail", "access control", "data handling", "data retention"):
		return classification.InvolvesDataHandling
	default:
		return true
	}
}

func concernsWithDimensions(concerns []ConcernDefinition) []ConcernDefinition {
	var out []ConcernDefinition

	for _, concern := range concerns {
		if len(concern.ReviewDimensions) > 0 {
			out = append(out, concern)
		}
	}

	return out
}

// reviewDimensionsFor is getReviewDimensions for one concern: a dimension
// whose scope the classification does not match is left out.
func reviewDimensionsFor(concern *ConcernDefinition, classification *SpecClassification) []ReviewDimension {
	var dims []ReviewDimension

	for _, dim := range concern.ReviewDimensions {
		if classification != nil && IsConcernScope(dim.Scope) && !ScopeMatchesClassification([]ConcernScope{dim.Scope}, classification) {
			continue
		}

		dims = append(dims, dim)
	}

	return dims
}

func (c *compiler) acceptanceCriteria(verifyFailed bool, verifyOutput string) []any { //nolint:cyclop // one source after another
	execution := executionOf(c.state())
	classification := c.classification()

	if execution.str("criteriaScope") == "review-gate" {
		withDims := concernsWithDimensions(c.in.ActiveConcerns)

		cursor := int(execution.num("gateConcernCursor"))
		if cursor < 0 || cursor >= len(withDims) {
			return []any{}
		}

		current := withDims[cursor]

		var criteria []any

		for _, dim := range reviewDimensionsFor(&current, classification) {
			evidence := ""
			if dim.EvidenceRequired {
				evidence = " [EVIDENCE REQUIRED — cite file paths, line numbers, or test names]"
			}

			criteria = append(criteria, JSObjectOf("id", "gate-"+current.ID+"-"+dim.ID,
				"text", "("+current.ID+" — "+dim.Label+") "+dim.Prompt+evidence))
		}

		if criteria == nil {
			return []any{}
		}

		return criteria
	}

	na := stringsOf(execution.arr("naItems"))
	counter := 0
	nextID := func() string {
		counter++

		return "ac-" + jsNumberString(float64(counter))
	}

	var criteria []any

	if debt := execution.obj("debt"); debt != nil {
		for _, item := range objectsOf(debt.arr("items")) {
			if containsString(na, item.str("id")) {
				continue
			}

			criteria = append(criteria, JSObjectOf("id", item.getOr("id"),
				"text", "[DEBT from iteration "+jsDisplay(item.getOr("since"))+"] "+jsDisplay(item.getOr("text"))))
		}
	}

	if verifyFailed {
		criteria = append(criteria, JSObjectOf("id", nextID(), "text", "[FAILED] Tests — fix this first: "+jsSliceUnits(verifyOutput, 200)))
	}

	if c.in.Parsed != nil {
		for _, item := range c.in.Parsed.Verification {
			if id := nextID(); !containsString(na, id) {
				criteria = append(criteria, JSObjectOf("id", id, "text", item))
			}
		}
	}

	for _, concern := range c.in.ActiveConcerns {
		for _, ac := range concern.AcceptanceCriteria {
			if !acRelevant(ac, classification) {
				continue
			}

			if id := nextID(); !containsString(na, id) {
				criteria = append(criteria, JSObjectOf("id", id, "text", "("+concern.ID+") "+ac))
			}
		}
	}

	for _, rule := range c.in.FolderRules {
		if id := nextID(); !containsString(na, id) {
			criteria = append(criteria, JSObjectOf("id", id, "text", "(folder: "+rule.Folder+") "+rule.Rule))
		}
	}

	if c.in.Parsed != nil {
		for _, task := range c.in.Parsed.Tasks {
			if len(task.Files) > 0 {
				criteria = append(criteria, JSObjectOf("id", "scope-check",
					"text", "Scope check: only files listed in task ("+strings.Join(task.Files, ", ")+") should be modified. Report any out-of-scope changes with justification."))

				break
			}
		}
	}

	return append(criteria,
		JSObjectOf("id", "mandatory-tests", "text", "Tests written and passing for all new and changed behavior"),
		JSObjectOf("id", "mandatory-docs", "text", "Documentation updated for all public-facing changes"),
	)
}

// batchTaskIDs are the task ids of a `{"completed": [...]}` progress note.
func batchTaskIDs(lastProgress any) []string {
	text, _ := lastProgress.(string)

	parsed, err := parseJSON(text)
	if err != nil {
		return nil
	}

	o, _ := parsed.(*JSObject)

	var ids []string

	for _, id := range o.arr("completed") {
		if s, ok := id.(string); ok && strings.HasPrefix(s, "task-") {
			ids = append(ids, s)
		}
	}

	return ids
}

func (c *compiler) execution() *JSObject { //nolint:cyclop,funlen,gocognit,maintidx // compileExecution, one branch after another
	state := c.state()
	execution := executionOf(state)
	tensions := DetectTensions(c.in.ActiveConcerns)

	maxIterations := 15.0
	if value, ok := c.in.Manifest.get("maxIterationsBeforeRestart"); ok && value != nil {
		maxIterations = numberOf(value)
	}

	verification := execution.obj("lastVerification")
	verifyFailed := false
	verifyOutput := ""

	if verification != nil {
		if passed, ok := verification.get("passed"); ok && passed == false {
			verifyFailed = true
		}

		verifyOutput = verification.str("output")
	}

	var tasks []ParsedTask
	if c.in.Parsed != nil {
		tasks = c.in.Parsed.Tasks
	}

	completed := stringsOf(execution.arr("completedTasks"))

	var taskBlock *JSObject

	for _, task := range tasks {
		if containsString(completed, task.ID) {
			continue
		}

		taskBlock = JSObjectOf("id", task.ID, "title", task.Title, "totalTasks", jsInteger(len(tasks)),
			"completedTasks", jsInteger(len(execution.arr("completedTasks"))))
		if len(task.Files) > 0 {
			taskBlock.set("files", anyOf(task.Files))
		}

		break
	}

	reminders := []any{}
	if tier1, _ := SplitRemindersByTier(c.in.ActiveConcerns, nil); len(tier1) > 0 {
		reminders = anyOf(tier1)
	}

	reviewGate := execution.str("criteriaScope") == "review-gate"

	if execution.isTrue("awaitingStatusReport") {
		criteria := c.acceptanceCriteria(verifyFailed, verifyOutput)
		batch := batchTaskIDs(execution.getOr("lastProgress"))

		var instruction string

		switch {
		case reviewGate:
			withDims := concernsWithDimensions(c.in.ActiveConcerns)
			cursor := int(execution.num("gateConcernCursor"))

			if cursor >= 0 && cursor < len(withDims) {
				instruction = "REVIEW GATE (" + jsNumberString(float64(cursor+1)) + "/" + jsNumberString(float64(len(withDims))) +
					"): Evaluate the " + withDims[cursor].Name + " concern dimensions against the actual implementation. " +
					"Point to specific files, line numbers, and test names. File edits are BLOCKED — this is a review-only pass. " +
					"Submit: " + c.cs(`next --answer='{"completed":[...],"remaining":[...]}'`)
			} else {
				instruction = "Review gate complete — submit to advance."
			}
		case len(batch) >= 2:
			instruction = jsNumberString(float64(len(batch))) + " tasks reported complete. Report status against ALL relevant acceptance criteria."
		default:
			instruction = "Before this task is accepted, report your completion status against these acceptance criteria."
		}

		transition := JSObjectOf("onComplete", c.cs(`next --answer='{"completed":[...],"remaining":[...],"blocked":[...]}'`))
		if !reviewGate {
			transition.set("onBlocked", c.cs(`block "reason"`))
		}

		copyField(transition, execution, "iteration")

		format := JSObjectOf(
			"completed", "list item IDs you finished (e.g., ['debt-1', 'ac-3']) with evidence",
			"remaining", "list item IDs not yet done",
			"blocked", "list item IDs that need a decision from the user",
			"na", "(optional) list item IDs that are not applicable to this task — they will be removed from future criteria",
			"newIssues", "(optional) list NEW issues discovered during implementation — free text, will be assigned debt IDs automatically",
		)
		if reviewGate {
			format = JSObjectOf(
				"completed", "list dimension IDs you verified with evidence (file:line, test name)",
				"remaining", "list dimension IDs not yet verified",
				"blocked", "list dimension IDs that need a decision before you can verify",
			)
		}

		out := JSObjectOf(
			"phase", PhaseExecuting,
			"instruction", instruction,
			"context", c.contextBlock(c.rulesValue(), reminders),
			"transition", transition,
			"statusReportRequired", true,
			"statusReport", JSObjectOf("criteria", criteria, "reportFormat", format),
		)

		if reviewGate {
			out.set("subphase", "review-gate")
		} else if len(batch) >= 2 {
			out.set("batchTasks", anyOf(batch))
		}

		if verifyFailed && !reviewGate {
			out.set("verificationFailed", true)
			out.set("verificationOutput", jsSliceUnits(verifyOutput, 2000))
		}

		return out
	}

	lastProgress := execution.str("lastProgress")
	wasRejected := strings.Contains(lastProgress, "Task not accepted")

	debt := execution.obj("debt")
	debtItems := objectsOf(debt.arr("items"))
	unaddressed := debt.num("unaddressedIterations")

	instruction := "All tasks completed. Run `" + c.cs("done") + "` to finish."
	if taskBlock != nil {
		instruction = "Execute task " + taskBlock.str("id") + ": " + taskBlock.str("title") + " (" +
			jsDisplay(taskBlock.getOr("completedTasks")) + "/" + jsDisplay(taskBlock.getOr("totalTasks")) + " completed)"
	}

	switch {
	case verifyFailed:
		instruction = "Verification FAILED. Fix the failing tests before continuing."
	case wasRejected && len(debtItems) > 0:
		urgency := ""
		if unaddressed >= 3 {
			urgency = " These items have been outstanding for " + jsNumberString(unaddressed) + " iterations."
		}

		instruction = "Task not accepted — " + jsNumberString(float64(len(debtItems))) +
			" remaining item(s) must be addressed before this task can be completed." + urgency +
			" Address them, then submit a new status report."
	}

	out := JSObjectOf("phase", PhaseExecuting, "instruction", instruction)
	if taskBlock != nil {
		out.set("task", taskBlock)
	}

	out.set("context", c.contextBlock(c.rulesValue(), reminders))
	transition := JSObjectOf("onComplete", c.cs(`next --answer="..."`), "onBlocked", c.cs(`block "reason"`))
	copyField(transition, execution, "iteration")
	out.set("transition", transition)

	if wasRejected && len(debtItems) > 0 {
		texts := make([]any, len(debtItems))
		for i, d := range debtItems {
			texts[i] = d.getOr("text")
		}

		out.set("taskRejected", true)
		out.set("rejectionReason", jsNumberString(float64(len(debtItems)))+" remaining item(s) must be addressed.")
		out.set("rejectionRemaining", texts)
	}

	if debt != nil && len(debt.arr("items")) > 0 {
		note := "These were not completed in a previous iteration. Address them BEFORE starting new work."
		if unaddressed >= 3 {
			note = "These items have been open for " + jsNumberString(unaddressed) + " iterations. Address them before any new work."
		}

		out.set("previousIterationDebt", JSObjectOf("fromIteration", debt.getOr("fromIteration"), "items", debt.arr("items"), "note", note))
	}

	if verifyFailed {
		out.set("verificationFailed", true)
		out.set("verificationOutput", jsSliceUnits(verifyOutput, 2000))
	}

	if len(tensions) > 0 {
		list := make([]string, len(tensions))
		items := make([]any, len(tensions))

		for i, t := range tensions {
			list[i] = strings.Join(t.Between, " vs ") + ": " + t.Issue
			items[i] = JSObjectOf("between", anyOf(t.Between), "issue", t.Issue)
		}

		resolution := "You MUST present these to the user and get explicit resolution for each before proceeding. Ask which side to prioritize as a numbered list."

		switch {
		case c.in.Hints.Headless:
			resolution = "The user must choose which side to prioritize, and nobody answers during this run: run `" +
				c.cs(`block "concern tension: <which concerns>"`) + "` and stop."
		case c.in.Hints.HasAskUserTool:
			resolution = "You MUST present these to the user and get explicit resolution for each before proceeding. Use AskUserQuestion to ask which side to prioritize."
		}

		out.set("concernTensions", items)
		out.set("instruction", "TENSION GATE: "+jsNumberString(float64(len(tensions)))+" concern tension(s) detected: "+
			strings.Join(list, "; ")+". "+resolution)
	}

	if execution.num("iteration") >= maxIterations {
		out.set("restartRecommended", true)
	}

	decisions := objectsOf(state.arr("decisions"))
	for i := len(decisions) - 1; i >= 0; i-- {
		d := decisions[i]
		if jsTruthy(d.getOr("promoted")) {
			continue
		}

		if strings.HasPrefix(lastProgress, "Resolved:") {
			out.set("promotePrompt", JSObjectOf(
				"decisionId", d.getOr("id"),
				"question", d.getOr("question"),
				"choice", d.getOr("choice"),
				"prompt", `You just resolved a decision: "`+jsDisplay(d.getOr("choice"))+`". Ask the user: "Should this be a permanent rule for future specs too?" If yes, run: `+"`"+
					c.cmd(`rule add "`+jsDisplay(d.getOr("choice"))+`"`)+"`",
			))
		}

		break
	}

	if execution.num("iteration") == 0 && !verifyFailed && !wasRejected {
		out.set("preExecutionReview", JSObjectOf("instruction",
			"Re-read spec before starting. Flag: missing info that will block mid-execution, wrong task order, unclear ACs. Better to catch now than mid-execution."))
	}

	for _, concern := range c.in.ActiveConcerns {
		if concern.ID != "beautiful-product" {
			continue
		}

		out.set("designChecklist", JSObjectOf(
			"required", true,
			"instruction", "Before completing any UI task, rate your implementation 0-10 on these dimensions and include the ratings in your AC report:",
			"dimensions", []any{
				JSObjectOf("id", "hierarchy", "label", "Information hierarchy — what does the user see first, second, third?"),
				JSObjectOf("id", "states", "label", "Interaction states — loading, empty, error, success all specified?"),
				JSObjectOf("id", "edge-cases", "label", "Edge cases — long text, zero results, slow connection handled?"),
				JSObjectOf("id", "intentionality", "label", "Overall intentionality — does this feel designed or generated?"),
			},
		))

		break
	}

	return out
}

func (c *compiler) blocked() *JSObject {
	reason := executionOf(c.state()).getOr("lastProgress")
	if reason == nil {
		reason = "Unknown"
	}

	return JSObjectOf(
		"phase", PhaseBlocked,
		"instruction", "A decision is needed. Ask the user.",
		"reason", reason,
		"transition", JSObjectOf("onResolved", c.cs(`next --answer="..."`)),
	)
}

func (c *compiler) completed() *JSObject {
	state := c.state()
	execution := executionOf(state)

	name := c.spec
	example := c.spec

	if !c.hasSpec {
		name, example = "<name>", "upload"
	}

	summary := JSObjectOf("spec", state.getOr("spec"))
	if iteration, ok := execution.get("iteration"); ok {
		summary.set("iterations", iteration)
	}

	summary.set("decisionsCount", jsInteger(len(state.arr("decisions"))))
	copyField(summary, state, "completionReason")
	copyField(summary, state, "completionNote")

	out := JSObjectOf(
		"phase", PhaseCompleted,
		"summary", summary,
		"learningPrompt", JSObjectOf(
			"instruction", `LEARNING PENDING: record learnings before moving on. For each insight, decide: one-time learning or permanent rule? One-time ("assumed X, was Y") → `+"`"+`learn "text"`+"`"+`. Permanent ("always/never do X") → `+"`"+`learn "text" --rule`+"`"+`. Run: `+"`"+
				c.cmd("spec "+name+` learn "text"`)+"`"+` or `+"`"+`learn "text" --rule`+"`.",
			"examples", []any{
				c.cmd("spec " + example + ` learn "Assumed S3 SDK v2, was v3"`),
				c.cmd("spec " + example + ` learn "Always use Result types" --rule`),
				c.cmd("learn promote 1"),
			},
		),
		"learningsPending", true,
	)

	if c.in.ProjectRoot != "" {
		if stale := staleDiagrams(c.in.ProjectRoot, stringsOf(execution.arr("modifiedFiles"))); len(stale) > 0 {
			out.set("staleDiagrams", stale)
			out.set("staleDiagramsBlocking", true)
		}
	}

	return out
}

// staleDiagrams is the staleDiagrams list of COMPLETED: the file, line
// and reason of each CheckDiagramStaleness result (diagrams.go).
func staleDiagrams(root string, modified []string) []any {
	found := CheckDiagramStaleness(root, modified)
	stale := make([]any, 0, len(found))

	for _, s := range found {
		stale = append(stale, JSObjectOf("file", s.File, "line", s.Line, "reason", s.Reason))
	}

	return stale
}
