// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// The DISCOVERY_REFINEMENT and EXECUTING answers of `noskills next`
// (handleRefinementAnswer, handleApproveAnswer, processStatusReport and
// runVerification in commands/next.ts).

func postureOf(answer string) (string, bool) {
	switch answer {
	case "a", ReviewPostureSelectiveExpansion:
		return ReviewPostureSelectiveExpansion, true
	case "b", ReviewPostureHoldScope:
		return ReviewPostureHoldScope, true
	case "c", ReviewPostureScopeExpansion:
		return ReviewPostureScopeExpansion, true
	case "d", ReviewPostureScopeReduction:
		return ReviewPostureScopeReduction, true
	default:
		return "", false
	}
}

func isApproveWord(word string) bool {
	return word == "approve" || word == "y" || word == "yes"
}

func (r *nextRun) snapshotProposal(state *JSObject) {
	if spec, ok := state.strOK("spec"); ok && validSpecPathName(spec) {
		dir := filepath.Join(r.root, specsDir, spec)
		_ = createSpecSnapshot(filepath.Join(dir, "spec.md"), filepath.Join(dir, "spec.proposal.md"))
	}
}

// approveAnswer is handleApproveAnswer.
func (r *nextRun) approveAnswer(state *JSObject, answer string) (*JSObject, error) {
	if !isApproveWord(strings.ToLower(jsTrim(answer))) {
		return state, nil
	}

	if split := AnalyzeForSplit(answersObjects(state)); split.Detected && len(split.Proposals) >= 2 {
		return approveDiscoveryAnswers(state)
	}

	if discoveryOf(state).hasKey("mode") {
		return approveDiscoveryAnswers(state)
	}

	next, err := approveDiscoveryReviewState(state, r.prefix)
	if err != nil {
		if refinementStage(state) == "stage-c" {
			spec := "<name>"
			if name, ok := state.strOK("spec"); ok {
				spec = name
			}

			return nil, lifecycleError("%s — Your CEO review is saved and will be preserved (run '%s spec %s next' to see remaining gaps).",
				err.Error(), r.prefix, spec)
		}

		return nil, err
	}

	r.snapshotProposal(next)

	return next, nil
}

func (r *nextRun) refinementAnswer(ctx context.Context, state *JSObject, answer string) (*JSObject, error) { //nolint:cyclop,funlen,gocognit // the seven steps of handleRefinementAnswer
	trimmed := strings.ToLower(jsTrim(answer))
	stage := refinementStage(state)

	if posture, ok := postureOf(trimmed); ok {
		return setReviewPosture(state, posture)
	}

	if parsed, err := parseJSON(answer); err == nil {
		if o, isObject := parsed.(*JSObject); isObject {
			if next, handled := r.refinementJSON(state, o, stage); handled {
				return next, nil
			}
		}
	}

	if stage == "stage-c" {
		switch trimmed {
		case "approve", "y", "yes":
			return r.approveAnswer(state, answer)
		case "revise", "r":
			return clearRefinement(state)
		}
	}

	switch trimmed {
	case "save-posture":
		if posture, ok := discoveryOf(state).obj("refinement").strOK("reviewPosture"); ok {
			if manifest, found := readManifestSection(r.root); found {
				if err := WriteManifestSection(r.root, manifest.with("defaultReviewPosture", posture)); err == nil {
					r.env.notice("Saved '" + posture + "' as project default posture.")
				}
			}
		}

		return state, nil
	case "clear-posture":
		if manifest, found := readManifestSection(r.root); found {
			if err := WriteManifestSection(r.root, manifest.without("defaultReviewPosture")); err == nil {
				r.env.notice("Cleared project default posture.")
			}
		}

		return state, nil
	case "approve":
		next, err := r.approveAnswer(state, answer)
		if err != nil {
			return nil, err
		}

		if next != state {
			refinement := discoveryOf(state).obj("refinement")
			initial, hasInitial := refinement.obj("initialCompletenessScore").get("overall")
			final, hasFinal := refinement.obj("completenessScore").get("overall")

			switch {
			case hasInitial && hasFinal && initial != final:
				r.env.notice("Completeness improved from " + jsDisplay(initial) + " to " + jsDisplay(final) + "/10 through review.")
			case hasFinal:
				r.env.notice("Spec reviewed at " + jsDisplay(final) + "/10.")
			}

			return next, nil
		}
	case "split":
		children := detectedChildren(state)
		if len(children) == 0 {
			return state, nil
		}

		return SplitSpec(r.env, state, children, r.prefix)
	case "keep":
		decision := JSObjectOf(
			"id", "decision-split-keep-"+strconv.FormatInt(r.env.now().UnixMilli(), 10),
			"question", "Split spec into separate areas?",
			"choice", "Chose to keep as single spec despite multiple areas detected",
			"promoted", false,
			"timestamp", r.env.nowISO(),
		)

		next, err := approveDiscoveryReviewState(addDecisionState(state, decision), r.prefix)
		if err != nil {
			return nil, err
		}

		r.snapshotProposal(next)

		return next, nil
	}

	discovery := discoveryOf(state)
	if discovery.isTrue("approved") && !discovery.isTrue("alternativesPresented") {
		return r.alternativesAnswer(ctx, state, answer, trimmed)
	}

	parsed, err := parseJSON(answer)
	if err != nil {
		return state, nil
	}

	o, _ := parsed.(*JSObject)

	revise := o.obj("revise")
	if revise == nil {
		return state, nil
	}

	token, ok := r.consumeAskTokens(state, []string{"refinement"})["refinement"]
	if !ok {
		token = notAsked()
	}

	user := r.env.ResolveUser(ctx)
	next := state

	for _, id := range revise.Keys() {
		text, isString := revise.values[id].(string)
		if !isString || text == "" {
			continue
		}

		// A revision the machine refuses leaves the whole answer unapplied,
		// as the TypeScript code's catch does.
		if next, err = addDiscoveryAnswer(next, id, text, user, r.env.nowISO()); err != nil {
			return state, nil //nolint:nilerr // the TypeScript CLI ignores the refused revision
		}

		next = applyTokenSource(next, id, token)
	}

	return next, nil
}

// refinementJSON is step 2 of handleRefinementAnswer: a completeness
// score, a posture or a CEO review as JSON. handled is false for any other
// object.
func (r *nextRun) refinementJSON(state, parsed *JSObject, stage string) (*JSObject, bool) {
	if parsed.hasKey("posture") || parsed.hasKey("completeness") {
		next := state

		if completeness := parsed.obj("completeness"); completeness != nil {
			_, isNumber := completeness.getOr("overall").(float64)
			_, isList := completeness.getOr("dimensions").([]any)

			if isNumber && isList {
				var err error
				if next, err = setCompletenessScore(next, completeness); err != nil {
					return nil, false
				}

				if stage == "stage-a" && r.manifest.has("defaultReviewPosture") && !parsed.hasKey("posture") {
					if next, err = setReviewPosture(next, jsDisplay(r.manifest.getOr("defaultReviewPosture"))); err != nil {
						return nil, false
					}
				}
			}
		}

		if parsed.hasKey("posture") {
			if posture, ok := postureOf(jsDisplay(parsed.getOr("posture"))); ok {
				var err error
				if next, err = setReviewPosture(next, posture); err != nil {
					return nil, false
				}
			}
		}

		return next, true
	}

	if parsed.hasKey("ceoReview") {
		var reflection any
		if text, ok := parsed.strOK("reflection"); ok {
			reflection = text
		}

		next, err := setCeoReview(state, parsed.getOr("ceoReview"), reflection)
		if err != nil {
			return nil, false
		}

		return next, true
	}

	return nil, false
}

func (r *nextRun) alternativesAnswer(ctx context.Context, state *JSObject, answer, trimmed string) (*JSObject, error) {
	var updated *JSObject

	var err error

	if trimmed == "skip" || trimmed == "none" {
		updated, err = skipAlternatives(state)
	} else {
		parsed, parseErr := parseJSON(answer)
		o, _ := parsed.(*JSObject)

		if parseErr == nil && o.hasKey("approach") {
			user := r.env.ResolveUser(ctx)
			text := func(key, fallback string) string {
				if value, ok := o.get(key); ok && value != nil {
					return jsString(value)
				}

				return fallback
			}

			approach := JSObjectOf(
				"id", jsString(o.getOr("approach")),
				"name", text("name", jsString(o.getOr("approach"))),
				"summary", text("summary", ""),
				"effort", text("effort", ""),
				"risk", text("risk", ""),
				"user", user.Name,
				"timestamp", r.env.nowISO(),
			)
			updated, err = selectApproach(state, approach)
		} else {
			updated, err = skipAlternatives(state)
		}
	}

	if err != nil {
		return nil, err
	}

	next, err := approveDiscoveryReviewState(updated, r.prefix)
	if err != nil {
		return nil, err
	}

	r.snapshotProposal(next)

	return next, nil
}

// jsString is String(value) for a JSON value.
func jsString(value any) string {
	switch v := value.(type) {
	case *JSObject:
		return "[object Object]"
	case []any:
		parts := make([]string, len(v))
		for i, item := range v {
			if item != nil {
				parts[i] = jsString(item)
			}
		}

		return strings.Join(parts, ",")
	default:
		return jsDisplay(v)
	}
}

func (r *nextRun) executionAnswer(ctx context.Context, state *JSObject, answer string) *JSObject {
	execution := executionOf(state)

	if !execution.isTrue("awaitingStatusReport") {
		next := withExecution(state, "lastProgress", answer)

		if command, ok := r.manifest.strOK("verifyCommand"); ok && command != "" {
			verification := runVerification(ctx, r.env, r.root, command, verificationTimeout)
			next = withExecution(next, "lastVerification", verification)

			if !verification.isTrue("passed") {
				return next
			}
		}

		return withExecution(next, "awaitingStatusReport", true)
	}

	return r.statusReport(state, answer)
}

const (
	verificationTimeout     = 60 * time.Second
	verificationOutputLimit = 4000
)

// runVerification runs the manifest's verifyCommand in the project root.
func runVerification(ctx context.Context, e *LifecycleEnv, root, command string, timeout time.Duration) *JSObject {
	timestamp := e.nowISO()

	if e.RunShell == nil {
		return JSObjectOf("passed", false, "output", "Verification command failed to execute: no shell", "timestamp", timestamp)
	}

	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	stdout, stderr, ok, err := e.RunShell(runCtx, command, root)
	timedOut := runCtx.Err() != nil

	if err != nil && !timedOut {
		return JSObjectOf("passed", false, "output", "Verification command failed to execute: "+err.Error(), "timestamp", timestamp)
	}

	if ok && !timedOut {
		return JSObjectOf("passed", true, "output", jsSliceUnits(stdout, verificationOutputLimit), "timestamp", timestamp)
	}

	output := jsSliceUnits(stdout+stderr, verificationOutputLimit)

	if timedOut {
		text := "Verification command did not finish within " + jsNumberString(timeout.Seconds()) + " seconds and was stopped: " + command
		if output != "" {
			text += "\n" + output
		}

		return JSObjectOf("passed", false, "output", text, "timestamp", timestamp)
	}

	if output == "" {
		output = "Verification failed with no output"
	}

	return JSObjectOf("passed", false, "output", output, "timestamp", timestamp)
}

func idList(report *JSObject, key string) []string {
	items := report.arr(key)
	out := make([]string, 0, len(items))

	for _, item := range items {
		out = append(out, jsDisplay(item))
	}

	return out
}

// statusReport is processStatusReport.
func (r *nextRun) statusReport(state *JSObject, answer string) *JSObject { //nolint:cyclop,funlen,gocognit,maintidx // processStatusReport, one rule after another
	parsed, err := parseJSON(answer)
	if err != nil {
		return withExecution(state, "lastProgress", answer, "awaitingStatusReport", false)
	}

	report, _ := parsed.(*JSObject)
	current := state
	execution := executionOf(current)

	if debt := execution.obj("debt"); debt != nil {
		if items := debt.arr("items"); len(items) > 0 {
			if _, legacy := items[0].(string); legacy {
				migrated := make([]any, len(items))
				for i, item := range items {
					migrated[i] = JSObjectOf("id", "legacy-"+strconv.Itoa(i+1), "text", item, "since", debt.getOr("fromIteration"))
				}

				current = withExecution(current, "debt", debt.with("items", migrated))
				r.env.notice("noskills: migrated legacy string[] debt to DebtItem[] format")
			}
		}
	}

	execution = executionOf(current)
	na := idList(report, "na")

	var rejected []string

	for _, id := range na {
		if id == "mandatory-tests" || id == "mandatory-docs" {
			rejected = append(rejected, id)
		}
	}

	if len(rejected) > 0 {
		return withExecution(current,
			"lastProgress", "REJECTED: Tests and documentation ACs require explicit justification to mark as N/A. Explain why tests or docs are not needed for this spec. Rejected IDs: "+strings.Join(rejected, ", "),
			"awaitingStatusReport", true,
		)
	}

	completed := idList(report, "completed")
	newIssues := idList(report, "newIssues")
	remaining := idList(report, "remaining")
	blocked := idList(report, "blocked")
	debt := execution.obj("debt")
	previousUnaddressed := debt.num("unaddressedIterations")

	var surviving []any

	for _, item := range debt.arr("items") {
		id := ""
		if o, ok := item.(*JSObject); ok {
			id = o.str("id")
		}

		if !containsString(completed, id) && !containsString(na, id) {
			surviving = append(surviving, item)
		}
	}

	counter := int(execution.num("debtCounter"))
	allDebt := append([]any{}, surviving...)

	for i, text := range newIssues {
		allDebt = append(allDebt, JSObjectOf("id", "debt-"+strconv.Itoa(counter+i+1), "text", text, "since", execution.getOr("iteration")))
	}

	explicitlyComplete := len(remaining) == 0 && len(blocked) == 0 && len(newIssues) == 0

	var mergedDebt any

	if !explicitlyComplete && len(allDebt) > 0 {
		from := debt.getOr("fromIteration")
		if from == nil {
			from = execution.getOr("iteration")
		}

		unaddressed := 1.0
		if len(surviving) > 0 {
			unaddressed = previousUnaddressed + 1
		}

		mergedDebt = JSObjectOf("items", allDebt, "fromIteration", from, "unaddressedIterations", unaddressed)
	}

	naItems := stringsOf(execution.arr("naItems"))
	for _, id := range na {
		if !containsString(naItems, id) {
			naItems = append(naItems, id)
		}
	}

	var parts []string
	if len(completed) > 0 {
		parts = append(parts, "Completed: "+strings.Join(completed, ", "))
	}

	if len(na) > 0 {
		parts = append(parts, "N/A: "+strings.Join(na, ", "))
	}

	summary := "Status report submitted"
	if len(parts) > 0 {
		summary = strings.Join(parts, "; ")
	}

	verifyPassed := true
	if verification := execution.obj("lastVerification"); verification != nil {
		verifyPassed = verification.isTrue("passed")
	} else if value, ok := execution.get("lastVerification"); ok && value != nil {
		verifyPassed = false
	}

	taskComplete := mergedDebt == nil && verifyPassed
	debtCounter := float64(counter + len(newIssues))
	spec, hasSpec := current.strOK("spec")

	if execution.str("criteriaScope") == "review-gate" {
		cursor := int(execution.num("gateConcernCursor"))

		if !explicitlyComplete {
			return withExecution(current,
				"awaitingStatusReport", true,
				"debt", mergedDebt,
				"debtCounter", debtCounter,
				"naItems", anyOf(naItems),
				"lastProgress", "Review gate: "+strconv.Itoa(len(remaining))+" dimension(s) still remaining — verify them and resubmit with remaining:[]",
			)
		}

		var withDims []ConcernDefinition

		for _, concern := range r.active {
			if len(reviewDimensionsFor(&concern, r.classification(current))) > 0 {
				withDims = append(withDims, concern)
			}
		}

		if next := cursor + 1; next < len(withDims) {
			return withExecution(current,
				"criteriaScope", "review-gate",
				"gateConcernCursor", float64(next),
				"awaitingStatusReport", true,
				"debt", mergedDebt,
				"debtCounter", debtCounter,
				"naItems", anyOf(naItems),
				"lastProgress", "Review gate: concern "+withDims[next].Name+" — submit findings",
			)
		}

		name := "<name>"
		if hasSpec {
			name = spec
		}

		gateDone := withExecution(current,
			"awaitingStatusReport", false,
			"debt", mergedDebt,
			"debtCounter", debtCounter,
			"naItems", anyOf(naItems),
			"lastProgress", "Review gate complete: all concern dimensions satisfied. Run `"+r.prefix+" spec "+name+" done` to finish.",
		)

		return gateDone.with("execution", executionOf(gateDone).without("criteriaScope", "gateConcernCursor"))
	}

	if taskComplete && hasSpec {
		if parsedSpec := ReadParsedSpec(r.root, spec); parsedSpec != nil {
			done := stringsOf(execution.arr("completedTasks"))

			var batch []string

			if previous, err := parseJSON(jsDisplay(execution.getOr("lastProgress"))); err == nil {
				if o, ok := previous.(*JSObject); ok {
					for _, id := range o.arr("completed") {
						s := jsDisplay(id)
						if !containsString(done, s) && parsedTaskExists(parsedSpec, s) {
							batch = append(batch, s)
						}
					}
				}
			}

			if len(batch) == 0 {
				for _, task := range parsedSpec.Tasks {
					if !containsString(done, task.ID) {
						batch = []string{task.ID}

						break
					}
				}
			}

			for _, id := range batch {
				markTaskCompleted(r.root, spec, id)
				updateProgressTask(r.root, spec, id, "done", r.env.nowISO())
			}

			if len(batch) > 0 {
				label := "Task " + batch[0] + " accepted"
				if len(batch) > 1 {
					label = "Tasks " + strings.Join(batch, ", ") + " accepted"
				}

				updatedDone := append(append([]string{}, done...), batch...)
				allDone := true

				for _, task := range parsedSpec.Tasks {
					if !containsString(updatedDone, task.ID) {
						allDone = false

						break
					}
				}

				if allDone {
					hasDims := false

					for _, concern := range r.active {
						if len(reviewDimensionsFor(&concern, r.classification(current))) > 0 {
							hasDims = true

							break
						}
					}

					if hasDims {
						return withExecution(current,
							"lastProgress", label+": "+summary+". All spec tasks complete — entering review gate.",
							"awaitingStatusReport", true,
							"criteriaScope", "review-gate",
							"gateConcernCursor", 0.0,
							"debt", mergedDebt,
							"completedTasks", anyOf(updatedDone),
							"debtCounter", debtCounter,
							"naItems", anyOf(naItems),
						)
					}
				}

				return withExecution(current,
					"lastProgress", label+": "+summary,
					"awaitingStatusReport", false,
					"debt", mergedDebt,
					"completedTasks", anyOf(updatedDone),
					"debtCounter", debtCounter,
					"naItems", anyOf(naItems),
				)
			}
		}
	}

	progress := summary
	if !taskComplete {
		progress = "Task not accepted — remaining items must be addressed first. " + summary
	}

	return withExecution(current,
		"lastProgress", progress,
		"awaitingStatusReport", false,
		"debt", mergedDebt,
		"debtCounter", debtCounter,
		"naItems", anyOf(naItems),
	)
}

func parsedTaskExists(parsed *ParsedSpec, id string) bool {
	for _, task := range parsed.Tasks {
		if task.ID == id {
			return true
		}
	}

	return false
}

func (r *nextRun) classification(state *JSObject) *SpecClassification {
	return classificationFromObject(state.obj("classification"))
}
