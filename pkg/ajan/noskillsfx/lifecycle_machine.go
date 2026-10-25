// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"errors"
	"fmt"
	"strings"
)

// The state machine (state/machine.ts) on state objects. Each function
// returns a new state, built by spreading as the TypeScript code does, so
// the keys of the written file come in the same order; the error messages
// are the TypeScript ones.

// ErrLifecycle marks an answer or a transition the machine refuses; the
// message says why and what to do.
var ErrLifecycle = errors.New("noskills refused the step")

// lifecycleError is a refusal with the TypeScript message.
func lifecycleError(format string, args ...any) error {
	return &refusal{message: fmt.Sprintf(format, args...)}
}

type refusal struct{ message string }

func (r *refusal) Error() string        { return r.message }
func (r *refusal) Is(target error) bool { return target == ErrLifecycle }

// transitionTargets is VALID_TRANSITIONS.
func transitionTargets(from string) []string {
	switch from {
	case PhaseUninitialized:
		return []string{PhaseIdle}
	case PhaseIdle:
		return []string{PhaseDiscovery, PhaseCompleted}
	case PhaseDiscovery:
		return []string{PhaseDiscoveryRefinement, PhaseCompleted}
	case PhaseDiscoveryRefinement:
		return []string{PhaseDiscoveryRefinement, PhaseSpecProposal, PhaseCompleted}
	case PhaseSpecProposal:
		return []string{PhaseSpecProposal, PhaseSpecApproved, PhaseCompleted}
	case PhaseSpecApproved:
		return []string{PhaseExecuting, PhaseCompleted}
	case PhaseExecuting:
		return []string{PhaseCompleted, PhaseBlocked}
	case PhaseBlocked:
		return []string{PhaseExecuting, PhaseCompleted}
	case PhaseCompleted:
		return []string{PhaseIdle, PhaseDiscovery}
	default:
		return nil
	}
}

func assertStateTransition(from, to string) error {
	allowed := transitionTargets(from)
	if !containsString(allowed, to) {
		return lifecycleError("Invalid phase transition: %s → %s. Allowed: %s", from, to, strings.Join(allowed, ", "))
	}

	return nil
}

func phaseOf(state *JSObject) string { return state.str("phase") }

func discoveryOf(state *JSObject) *JSObject { return state.objOrEmpty("discovery") }

func executionOf(state *JSObject) *JSObject { return state.objOrEmpty("execution") }

func withDiscovery(state *JSObject, pairs ...any) *JSObject {
	return state.with("discovery", discoveryOf(state).with(pairs...))
}

func withExecution(state *JSObject, pairs ...any) *JSObject {
	return state.with("execution", executionOf(state).with(pairs...))
}

// transitionState is transition().
func transitionState(state *JSObject, to string) (*JSObject, error) {
	if err := assertStateTransition(phaseOf(state), to); err != nil {
		return nil, err
	}

	return state.with("phase", to), nil
}

// startSpecState is startSpec().
func startSpecState(state *JSObject, specName, branch, description string) (*JSObject, error) {
	if err := assertStateTransition(phaseOf(state), PhaseDiscovery); err != nil {
		return nil, err
	}

	return state.with(
		"phase", PhaseDiscovery,
		"spec", specName,
		"specDescription", description,
		"branch", branch,
		"discovery", initialDiscovery(),
		"specState", JSObjectOf("path", nil, "status", "none", "metadata", emptySpecMetadata(), "placeholders", []any{}),
		"execution", initialExecution(),
		"decisions", []any{},
	), nil
}

// recordTransition appends a transitionHistory entry; reason is the
// optional last argument.
func recordTransition(state *JSObject, from, to string, user User, nowISO string, reason ...string) *JSObject {
	entry := JSObjectOf("from", from, "to", to, "user", user.Name, "email", user.Email, "timestamp", nowISO)
	if len(reason) > 0 {
		entry.set("reason", reason[0])
	}

	return state.with("transitionHistory", appendAny(state.arr("transitionHistory"), entry))
}

func setDiscoveryMode(state *JSObject, mode string) (*JSObject, error) {
	if phaseOf(state) != PhaseDiscovery {
		return nil, lifecycleError("Cannot set discovery mode in phase: %s", phaseOf(state))
	}

	return withDiscovery(state, "mode", mode, "entryComplete", true), nil
}

func completePremises(state *JSObject, premises []any) (*JSObject, error) {
	if phaseOf(state) != PhaseDiscovery {
		return nil, lifecycleError("Cannot complete premises in phase: %s", phaseOf(state))
	}

	return withDiscovery(state, "premises", premises, "premisesCompleted", true), nil
}

func selectApproach(state *JSObject, approach *JSObject) (*JSObject, error) {
	if phaseOf(state) != PhaseDiscoveryRefinement {
		return nil, lifecycleError("Cannot select approach in phase: %s", phaseOf(state))
	}

	return withDiscovery(state, "selectedApproach", approach, "alternativesPresented", true), nil
}

func skipAlternatives(state *JSObject) (*JSObject, error) {
	if phaseOf(state) != PhaseDiscoveryRefinement {
		return nil, lifecycleError("Cannot skip alternatives in phase: %s", phaseOf(state))
	}

	return withDiscovery(state, "alternativesPresented", true), nil
}

// addDiscoveryAnswer is addDiscoveryAnswer(): it replaces the question's
// answer with an attributed one, refusing answers under 20 characters.
func addDiscoveryAnswer(state *JSObject, questionID, answer string, user User, nowISO string) (*JSObject, error) {
	if phase := phaseOf(state); phase != PhaseDiscovery && phase != PhaseDiscoveryRefinement {
		return nil, lifecycleError("Cannot add discovery answer in phase: %s", phase)
	}

	if jsLength(jsTrim(answer)) < 20 {
		return nil, lifecycleError("Answer too short. Discovery answers must be meaningful (minimum 20 characters).")
	}

	kept := make([]any, 0)

	for _, item := range discoveryOf(state).arr("answers") {
		if a, ok := item.(*JSObject); ok && a.str("questionId") == questionID {
			continue
		}

		kept = append(kept, item)
	}

	entry := JSObjectOf(
		"questionId", questionID,
		"answer", answer,
		"user", user.Name,
		"email", user.Email,
		"timestamp", nowISO,
		"type", "original",
	)

	return withDiscovery(state, "answers", append(kept, entry)), nil
}

// pendingFollowUps is getPendingFollowUps().
func pendingFollowUps(state *JSObject) []*JSObject {
	var pending []*JSObject

	for _, f := range objectsOf(discoveryOf(state).arr("followUps")) {
		if f.str("status") == "pending" {
			pending = append(pending, f)
		}
	}

	return pending
}

// answersObjects are discovery.answers.
func answersObjects(state *JSObject) []*JSObject {
	return objectsOf(discoveryOf(state).arr("answers"))
}

// discoveryCompleteObject is isDiscoveryComplete(): every base question has
// an answer.
func discoveryCompleteObject(answers []any) bool {
	answered := answeredQuestionIDs(answers)
	for _, q := range questions {
		if !answered[q.ID] {
			return false
		}
	}

	return true
}

// completeDiscoveryState is completeDiscovery(): it moves to
// DISCOVERY_REFINEMENT unless a follow-up is pending.
func completeDiscoveryState(state *JSObject) (*JSObject, error) {
	if phaseOf(state) != PhaseDiscovery {
		return nil, lifecycleError("Cannot complete discovery in phase: %s", phaseOf(state))
	}

	if pending := pendingFollowUps(state); len(pending) > 0 {
		return nil, lifecycleError(
			"Cannot complete discovery: %d pending follow-up(s). Answer or skip them first.", len(pending))
	}

	specState := state.objOrEmpty("specState")

	return state.with(
		"phase", PhaseDiscoveryRefinement,
		"discovery", discoveryOf(state).with("completed", true),
		"specState", specState.with("path", specsDir+"/"+state.str("spec")+"/spec.md", "status", "draft"),
	), nil
}

// completeDiscoveryWhenReady is completeDiscoveryWhenReady().
func completeDiscoveryWhenReady(state *JSObject) (*JSObject, error) {
	if phaseOf(state) != PhaseDiscovery || !discoveryCompleteObject(discoveryOf(state).arr("answers")) ||
		len(pendingFollowUps(state)) > 0 {
		return state, nil
	}

	return completeDiscoveryState(state)
}

// autoClassifyIfMissing infers a classification when there is none.
func autoClassifyIfMissing(state *JSObject) *JSObject {
	if value, ok := state.get("classification"); !ok || value != nil {
		return state
	}

	return state.with("classification", inferClassificationObject(state))
}

// sectionCommandsHint is sectionCommandsHint(): the sentence that names the
// commands which record a section the user resolved.
func sectionCommandsHint(prefix, specName string) string {
	spec := prefix + " spec " + specName + " section "

	return "Record each answer with `" + spec + `<id> fill "text"` + "`, or mark a section that does not apply with `" +
		spec + `<id> na "reason"` + "`; `" + spec + "list` shows the ids."
}

// approveDiscoveryReviewState is approveDiscoveryReview(): the completeness
// gate, then SPEC_PROPOSAL with a classification. prefix is the command the
// refusal names.
func approveDiscoveryReviewState(state *JSObject, prefix string) (*JSObject, error) {
	report := CheckSpecCompletenessObject(state.objOrEmpty("specState"))
	if !report.CanAdvance {
		var b strings.Builder

		b.WriteString("Spec incomplete — cannot advance to SPEC_PROPOSAL.\n")

		if len(report.Unresolved) > 0 {
			lines := make([]string, len(report.Unresolved))
			for i, s := range report.Unresolved {
				lines[i] = "  - " + s.Title + " (" + s.ID + ")"
			}

			b.WriteString("\nUnresolved sections:\n" + strings.Join(lines, "\n"))
		}

		if len(report.PendingDecisions) > 0 {
			lines := make([]string, len(report.PendingDecisions))
			for i, d := range report.PendingDecisions {
				lines[i] = "  - " + d.str("section") + ": " + d.str("question") + " (waiting for " +
					strings.Join(stringsOf(d.arr("waitingFor")), ", ") + ")"
			}

			b.WriteString("\nPending decisions:\n" + strings.Join(lines, "\n"))
		}

		b.WriteString("\n\nAsk the user to resolve every item. Do not guess, infer, or fill in yourself.")

		if len(report.Unresolved) > 0 {
			spec, ok := state.strOK("spec")
			if !ok {
				spec = "<name>"
			}

			b.WriteString("\n" + sectionCommandsHint(prefix, spec))
		}

		return nil, lifecycleError("%s", b.String())
	}

	if err := assertStateTransition(phaseOf(state), PhaseSpecProposal); err != nil {
		return nil, err
	}

	return autoClassifyIfMissing(state.with("phase", PhaseSpecProposal)), nil
}

func approveDiscoveryAnswers(state *JSObject) (*JSObject, error) {
	if phaseOf(state) != PhaseDiscoveryRefinement {
		return nil, lifecycleError("Cannot approve discovery answers in phase: %s", phaseOf(state))
	}

	return withDiscovery(state, "approved", true), nil
}

func advanceDiscoveryQuestion(state *JSObject) (*JSObject, error) {
	if phaseOf(state) != PhaseDiscovery {
		return nil, lifecycleError("Cannot advance discovery question in phase: %s", phaseOf(state))
	}

	return withDiscovery(state, "currentQuestion", discoveryOf(state).num("currentQuestion")+1), nil
}

func approveSpecState(state *JSObject) (*JSObject, error) {
	if err := assertStateTransition(phaseOf(state), PhaseSpecApproved); err != nil {
		return nil, err
	}

	return state.with("phase", PhaseSpecApproved, "specState", state.objOrEmpty("specState").with("status", "approved")), nil
}

func startExecutionState(state *JSObject) (*JSObject, error) {
	if err := assertStateTransition(phaseOf(state), PhaseExecuting); err != nil {
		return nil, err
	}

	return state.with(
		"phase", PhaseExecuting,
		"discovery", discoveryOf(state).with("completed", true, "approved", false),
		"execution", initialExecution(),
	), nil
}

func blockExecutionState(state *JSObject, reason string) (*JSObject, error) {
	if err := assertStateTransition(phaseOf(state), PhaseBlocked); err != nil {
		return nil, err
	}

	return withExecution(state.with("phase", PhaseBlocked), "lastProgress", "BLOCKED: "+reason), nil
}

func addDecisionState(state *JSObject, decision *JSObject) *JSObject {
	return state.with("decisions", appendAny(state.arr("decisions"), decision))
}

// completeSpecState is completeSpec(); note is "" for none.
func completeSpecState(state *JSObject, reason, note, nowISO string) (*JSObject, error) {
	if err := assertStateTransition(phaseOf(state), PhaseCompleted); err != nil {
		return nil, err
	}

	var noteValue any
	if note != "" {
		noteValue = note
	}

	return state.with("phase", PhaseCompleted, "completionReason", reason, "completedAt", nowISO, "completionNote", noteValue), nil
}

// resetRefusal is machine.ts resetRefusal: why reset refuses a phase, or ""
// when it resets. Only execution and the terminal phases reset (Jidoka: a
// planning phase is not escaped by reset).
func resetRefusal(phase string) string {
	switch phase {
	case PhaseIdle, PhaseExecuting, PhaseBlocked, PhaseCompleted:
		return ""
	default:
		return "Cannot reset from " + phase + ". Use `cancel` or `wontfix` instead."
	}
}

// resetToIdleState is resetToIdle().
func resetToIdleState(state *JSObject) (*JSObject, error) {
	if refusal := resetRefusal(phaseOf(state)); refusal != "" {
		return nil, lifecycleError("%s", refusal)
	}

	return state.with(
		"phase", PhaseIdle,
		"spec", nil,
		"branch", nil,
		"discovery", initialDiscovery(),
		"specState", JSObjectOf("path", nil, "status", "none", "metadata", emptySpecMetadata(), "placeholders", []any{}),
		"execution", initialExecution(),
		"decisions", []any{},
		"classification", nil,
		"completionReason", nil,
		"completedAt", nil,
		"completionNote", nil,
		"reopenedFrom", nil,
	), nil
}

// refinementStage is getDiscoveryRefinementStage().
func refinementStage(state *JSObject) string {
	refinement := discoveryOf(state).obj("refinement")

	switch {
	case !refinement.has("reviewPosture"):
		return "stage-a"
	case !refinement.has("ceoReview"):
		return "stage-b"
	default:
		return "stage-c"
	}
}

func setCompletenessScore(state *JSObject, score any) (*JSObject, error) {
	if phaseOf(state) != PhaseDiscoveryRefinement {
		return nil, lifecycleError("setCompletenessScore: invalid phase %s", phaseOf(state))
	}

	existing := discoveryOf(state).obj("refinement")
	initial, ok := existing.get("initialCompletenessScore")

	if !ok || initial == nil {
		initial = score
	}

	refinement := existing.clone().with("initialCompletenessScore", initial, "completenessScore", score)

	return withDiscovery(state, "refinement", refinement), nil
}

func setReviewPosture(state *JSObject, posture string) (*JSObject, error) {
	if phaseOf(state) != PhaseDiscoveryRefinement {
		return nil, lifecycleError("setReviewPosture: invalid phase %s", phaseOf(state))
	}

	return withDiscovery(state, "refinement", discoveryOf(state).obj("refinement").clone().with("reviewPosture", posture)), nil
}

// setCeoReview stores the readiness and the reflection; reflection is nil
// when the answer has none, which JSON.stringify leaves out.
func setCeoReview(state *JSObject, readiness, reflection any) (*JSObject, error) {
	if phaseOf(state) != PhaseDiscoveryRefinement {
		return nil, lifecycleError("setCeoReviewReadiness: invalid phase %s", phaseOf(state))
	}

	review := JSObjectOf("readinessScore", readiness)
	if reflection != nil {
		review.set("reflection", reflection)
	}

	return withDiscovery(state, "refinement", discoveryOf(state).obj("refinement").clone().with("ceoReview", review)), nil
}

func clearRefinement(state *JSObject) (*JSObject, error) {
	if phaseOf(state) != PhaseDiscoveryRefinement {
		return nil, lifecycleError("clearRefinement: invalid phase %s", phaseOf(state))
	}

	return state.with("discovery", discoveryOf(state).without("refinement")), nil
}

func setUserContext(state *JSObject, context string) *JSObject {
	return withDiscovery(state,
		"userContext", appendAny(discoveryOf(state).arr("userContext"), context),
		"userContextProcessed", false,
	)
}

func importDetectedPlan(state *JSObject, content, planPath string) *JSObject {
	return withDiscovery(state, "userContext", []any{content}, "planPath", planPath)
}

const maxFollowUpsPerQuestion = 3

// addFollowUp is addFollowUp(): at most three per question, with ids
// Q3a, Q3b, Q3c; more are dropped without a word.
func addFollowUp(state *JSObject, parentID, question, createdBy, nowISO string) *JSObject {
	existing := discoveryOf(state).arr("followUps")

	count := 0
	for _, f := range objectsOf(existing) {
		if f.str("parentQuestionId") == parentID {
			count++
		}
	}

	if count >= maxFollowUpsPerQuestion {
		return state
	}

	followUp := JSObjectOf(
		"id", parentID+string(rune('a'+count)),
		"parentQuestionId", parentID,
		"question", question,
		"answer", nil,
		"status", "pending",
		"createdBy", createdBy,
		"createdAt", nowISO,
	)

	return withDiscovery(state, "followUps", appendAny(existing, followUp))
}

// settleFollowUp answers (answer non-nil) or skips a pending follow-up.
func settleFollowUp(state *JSObject, id string, answer *string, nowISO string) *JSObject {
	followUps := discoveryOf(state).arr("followUps")
	updated := make([]any, len(followUps))

	for i, item := range followUps {
		updated[i] = item

		f, ok := item.(*JSObject)
		if !ok || f.str("id") != id || f.str("status") != "pending" {
			continue
		}

		if answer != nil {
			updated[i] = f.with("answer", *answer, "status", "answered", "answeredAt", nowISO)
		} else {
			updated[i] = f.with("status", "skipped")
		}
	}

	return withDiscovery(state, "followUps", updated)
}

// followUpsFor is getFollowUpsForQuestion().
func followUpsFor(state *JSObject, parentID string) []*JSObject {
	var out []*JSObject

	for _, f := range objectsOf(discoveryOf(state).arr("followUps")) {
		if f.str("parentQuestionId") == parentID {
			out = append(out, f)
		}
	}

	return out
}

// pendingDelegations is getPendingDelegations().
func pendingDelegations(state *JSObject) []*JSObject {
	var out []*JSObject

	for _, d := range objectsOf(discoveryOf(state).arr("delegations")) {
		if d.str("status") == "pending" {
			out = append(out, d)
		}
	}

	return out
}
