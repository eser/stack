// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// The spec state commands of TASK-258.1: reset, cancel, wontfix, reopen,
// revisit, the custom ACs, tasks and notes, delegations and their review,
// validate, plan-export and split (commands/reset.ts, cancel.ts, wontfix.ts,
// reopen.ts, review.ts, delegate.ts, validate.ts, plan-export.ts and the
// subcommands of commands/spec.ts). Each reads and writes the state files as
// the TypeScript command does; the CLI prints the messages.

// ResetResult is what `reset` did.
type ResetResult struct {
	// AlreadyIdle is set when there was nothing to reset.
	AlreadyIdle bool
	// MissingDirectory is set when the active spec had no directory; the
	// reset goes ahead.
	MissingDirectory bool
	// Spec is the spec whose state was cleared, or "" for none.
	Spec string
	// ActiveSpec is the spec the state named before the reset.
	ActiveSpec string
}

// Reset is `reset`: back to IDLE in the global state and, when the state
// named a spec, in that spec's file. Its files under .eser/specs/ stay.
func Reset(e *LifecycleEnv, specName string) (ResetResult, error) {
	root := e.Root
	manifest, _ := readManifestSection(root)

	state, err := ResolveState(root, specName, CommandPrefixOf(manifest), e.Warn)
	if err != nil {
		return ResetResult{}, err
	}

	if phase := phaseOf(state); phase == PhaseIdle || phase == PhaseUninitialized {
		return ResetResult{AlreadyIdle: true}, nil
	}

	if refusal := resetRefusal(phaseOf(state)); refusal != "" {
		return ResetResult{}, refuse("phase", refusal)
	}

	result := ResetResult{}

	if spec, ok := state.strOK("spec"); ok {
		result.ActiveSpec = spec
		result.MissingDirectory = !specDirExists(root, spec)
	}

	idle, err := resetToIdleState(state)
	if err != nil {
		return result, err
	}

	if err := WriteStateObject(root, idle); err != nil {
		return result, err
	}

	if spec, ok := state.strOK("spec"); ok {
		result.Spec = spec

		if err := WriteSpecStateObject(root, spec, idle, e.Warn); err != nil {
			return result, err
		}
	}

	return result, nil
}

// Terminate is `cancel` (reason "cancelled") and `wontfix` (reason
// "wontfix", with note as the completion note): COMPLETED in the spec's
// file, IDLE in the global state, the spec document's status, and a
// phase-change event.
func Terminate(ctx context.Context, e *LifecycleEnv, specName, reason, note string) error {
	root := e.Root
	manifest, _ := readManifestSection(root)
	prefix := CommandPrefixOf(manifest)

	state, err := ResolveState(root, specName, prefix, e.Warn)
	if err != nil {
		return err
	}

	phase := phaseOf(state)
	if phase == PhaseIdle || phase == PhaseUninitialized || phase == PhaseCompleted {
		if reason == CompletionWontfix {
			return refuse("phase", "Cannot mark as won't fix in phase: "+phase)
		}

		return refuse("phase", "Cannot cancel in phase: "+phase)
	}

	if err := e.checkSpecDirectory(state, prefix); err != nil {
		return err
	}

	user := e.ResolveUser(ctx)

	completed, err := completeSpecState(state, reason, note, e.nowISO())
	if err != nil {
		return err
	}

	transitionReason := reason
	if reason == CompletionWontfix {
		transitionReason = note
	}

	completed = recordTransition(completed, phase, PhaseCompleted, user, e.nowISO(), transitionReason)

	spec, hasSpec := completed.strOK("spec")
	if hasSpec {
		if err := WriteSpecStateObject(root, spec, completed, e.Warn); err != nil {
			return err
		}
	}

	idle, err := resetToIdleState(completed)
	if err != nil {
		return err
	}

	if err := WriteStateObject(root, idle); err != nil {
		return err
	}

	if hasSpec && validSpecPathName(spec) {
		updateSpecStatus(root, spec, reason)
		updateProgressStatus(root, spec, reason, e.nowISO())
	}

	eventSpec := "unknown"
	if name, ok := state.strOK("spec"); ok {
		eventSpec = name
	}

	if err := appendEvent(root, JSObjectOf("ts", e.nowISO(), "type", "phase-change", "spec", eventSpec, "user", user.Name,
		"from", phase, "to", PhaseCompleted, "reason", reason)); err != nil {
		return fmt.Errorf("log the phase-change event: %w", err)
	}

	return nil
}

// Reopen is `reopen`: a COMPLETED spec back to DISCOVERY with its answers.
func Reopen(ctx context.Context, e *LifecycleEnv, specName string) error {
	root := e.Root
	manifest, _ := readManifestSection(root)

	state, err := ResolveState(root, specName, CommandPrefixOf(manifest), e.Warn)
	if err != nil {
		return err
	}

	if phase := phaseOf(state); phase != PhaseCompleted {
		return refuse("phase", "Cannot reopen in phase: "+phase, "Only COMPLETED specs can be reopened.")
	}

	user := e.ResolveUser(ctx)
	reopened := reopenSpecState(state)

	return WriteStateAndSpec(root, recordTransition(reopened, PhaseCompleted, PhaseDiscovery, user, e.nowISO(), "reopened"), e.Warn)
}

// reopenSpecState is reopenSpec().
func reopenSpecState(state *JSObject) *JSObject {
	return state.with(
		"phase", PhaseDiscovery,
		"reopenedFrom", state.getOr("completionReason"),
		"completionReason", nil,
		"completedAt", nil,
		"completionNote", nil,
		"discovery", discoveryOf(state).with("completed", false, "currentQuestion", 0.0).without("refinement"),
		"execution", initialExecution(),
		"classification", nil,
	)
}

// RevisitResult is what `revisit` did.
type RevisitResult struct {
	// From is the phase the spec left.
	From string
	// CompletedTasks is how many tasks were done before.
	CompletedTasks int
}

// Revisit is `spec <name> revisit "reason"`: EXECUTING or BLOCKED back to
// DISCOVERY, keeping the answers and recording the progress so far. Only
// the spec's own file is written, as the TypeScript command does.
func Revisit(e *LifecycleEnv, specName, reason string) (RevisitResult, error) {
	root := e.Root
	manifest, _ := readManifestSection(root)
	prefix := CommandPrefixOf(manifest)

	state, err := ResolveState(root, specName, prefix, e.Warn)
	if err != nil {
		return RevisitResult{}, refuse("state", "Error: "+err.Error())
	}

	switch phase := phaseOf(state); phase {
	case PhaseDiscovery, PhaseDiscoveryRefinement, PhaseSpecProposal, PhaseSpecApproved:
		return RevisitResult{}, refuse("phase", "Already in planning phase, no need to revisit.")
	case PhaseCompleted:
		return RevisitResult{}, refuse("phase", "Spec is completed. Use `"+prefix+" reopen --spec="+specName+"` instead.")
	case PhaseIdle:
		return RevisitResult{}, refuse("phase", "No active spec to revisit.")
	case PhaseExecuting, PhaseBlocked:
	default:
		return RevisitResult{}, lifecycleError("Cannot revisit in phase: %s. Only EXECUTING or BLOCKED can revisit.", phase)
	}

	completedTasks := executionOf(state).arr("completedTasks")
	entry := JSObjectOf(
		"from", phaseOf(state),
		"reason", reason,
		"completedTasks", appendAny(completedTasks),
		"timestamp", e.nowISO(),
	)

	revisited := state.with(
		"phase", PhaseDiscovery,
		"discovery", discoveryOf(state).with("completed", false, "currentQuestion", 0.0, "approved", false).without("refinement"),
		"execution", initialExecution(),
		"classification", nil,
		"revisitHistory", appendAny(state.arr("revisitHistory"), entry),
	)

	// state.json moves with the spec it names, as every other transition
	// does; a state.json on another spec stays.
	write := func() error { return WriteSpecStateObject(root, specName, revisited, e.Warn) }
	if global, _ := ReadHookState(root, e.Warn).strOK("spec"); global == specName {
		write = func() error { return WriteStateAndSpec(root, revisited, e.Warn) }
	}

	if err := write(); err != nil {
		return RevisitResult{}, err
	}

	return RevisitResult{From: phaseOf(state), CompletedTasks: len(completedTasks)}, nil
}

// SpecEntry is a custom AC or a note as `ac list`, `task list` and
// `note list` print it.
type SpecEntry struct {
	Text  string
	User  string
	Phase string
}

// SpecEntries is a spec's custom ACs or notes, with the phase it is in.
type SpecEntries struct {
	Phase   string
	Entries []SpecEntry
}

// AddCustomAC is `spec <name> ac add`: a custom acceptance criterion,
// written to the spec's file. It returns the state's phase before the
// change and who added it. A missing spec is an error the TypeScript
// command does not catch.
func AddCustomAC(ctx context.Context, e *LifecycleEnv, specName, text string) (string, User, error) {
	return addSpecItem(ctx, e, specName, func(state *JSObject, user User) *JSObject {
		existing := state.arr("customACs")
		ac := JSObjectOf(
			"id", "custom-ac-"+jsNumberString(float64(len(existing)+1)),
			"text", text,
			"user", user.Name,
			"email", user.Email,
			"timestamp", e.nowISO(),
			"addedInPhase", phaseOf(state),
		)

		return state.with("customACs", appendAny(existing, ac))
	}, nil)
}

// AddSpecNote is `spec <name> note add` and, with the "[TASK] " prefix,
// `task add`. refuseIn lists the phases that refuse it.
func AddSpecNote(ctx context.Context, e *LifecycleEnv, specName, text string, refuseIn []string) (string, User, error) {
	return addSpecItem(ctx, e, specName, func(state *JSObject, user User) *JSObject {
		existing := state.arr("specNotes")
		note := JSObjectOf(
			"id", "note-"+jsNumberString(float64(len(existing)+1)),
			"text", text,
			"user", user.Name,
			"email", user.Email,
			"timestamp", e.nowISO(),
			"phase", phaseOf(state),
		)

		return state.with("specNotes", appendAny(existing, note))
	}, refuseIn)
}

func addSpecItem(ctx context.Context, e *LifecycleEnv, specName string, add func(state *JSObject, user User) *JSObject, refuseIn []string) (string, User, error) {
	root := e.Root
	manifest, _ := readManifestSection(root)

	state, err := ResolveState(root, specName, CommandPrefixOf(manifest), e.Warn)
	if err != nil {
		return "", User{}, err
	}

	phase := phaseOf(state)
	if containsString(refuseIn, phase) {
		return phase, User{}, refuse("phase", "Cannot add tasks during execution. Use `spec revisit` to go back to discovery.")
	}

	user := e.ResolveUser(ctx)
	if err := WriteSpecStateObject(root, specName, add(state, user), e.Warn); err != nil {
		return phase, user, err
	}

	return phase, user, nil
}

// CustomACs are the custom ACs of a spec.
func CustomACs(e *LifecycleEnv, specName string) (SpecEntries, error) {
	return specItems(e, specName, "customACs", "addedInPhase", func(string) bool { return true })
}

// SpecNotes are a spec's notes; tasks picks the "[TASK] " ones (without
// the prefix) instead of the others.
func SpecNotes(e *LifecycleEnv, specName string, tasks bool) (SpecEntries, error) {
	entries, err := specItems(e, specName, "specNotes", "phase", func(text string) bool {
		return strings.HasPrefix(text, "[TASK] ") == tasks
	})

	if tasks {
		for i := range entries.Entries {
			entries.Entries[i].Text = strings.Replace(entries.Entries[i].Text, "[TASK] ", "", 1)
		}
	}

	return entries, err
}

func specItems(e *LifecycleEnv, specName, key, phaseKey string, keep func(text string) bool) (SpecEntries, error) {
	root := e.Root
	manifest, _ := readManifestSection(root)

	state, err := ResolveState(root, specName, CommandPrefixOf(manifest), e.Warn)
	if err != nil {
		return SpecEntries{}, err
	}

	out := SpecEntries{Phase: phaseOf(state), Entries: []SpecEntry{}}

	for _, item := range objectsOf(state.arr(key)) {
		text := jsDisplayField(item, "text")
		if !keep(text) {
			continue
		}

		out.Entries = append(out.Entries, SpecEntry{Text: text, User: jsDisplayField(item, "user"), Phase: jsDisplayField(item, phaseKey)})
	}

	return out, nil
}

// JSTrim is String.prototype.trim, which trims the JavaScript white space
// and line terminators.
func JSTrim(s string) string {
	return jsTrim(s)
}

// jsDisplayField is `${o.key}`.
func jsDisplayField(o *JSObject, key string) string {
	value, ok := o.get(key)

	return templateOf(value, ok)
}

// Delegate is `spec <name> delegate <questionId> <userName>`: a pending
// delegation of a discovery question, in the spec's file, and a
// delegation-created event.
func Delegate(ctx context.Context, e *LifecycleEnv, specName, questionID, delegatedTo string) error {
	root := e.Root
	manifest, _ := readManifestSection(root)

	state, err := ResolveState(root, specName, CommandPrefixOf(manifest), e.Warn)
	if err != nil {
		return refuse("state", err.Error())
	}

	if phase := phaseOf(state); phase != PhaseDiscovery && phase != PhaseDiscoveryRefinement {
		return refuse("phase", "Cannot delegate in phase: "+phase+". Only during discovery.")
	}

	user := e.ResolveUser(ctx)
	delegation := JSObjectOf(
		"questionId", questionID,
		"delegatedTo", delegatedTo,
		"delegatedBy", user.Name,
		"status", "pending",
		"delegatedAt", e.nowISO(),
	)
	next := withDiscovery(state, "delegations", appendAny(discoveryOf(state).arr("delegations"), delegation))

	if err := WriteSpecStateObject(root, specName, next, e.Warn); err != nil {
		return err
	}

	if err := appendEvent(root, JSObjectOf("ts", e.nowISO(), "type", "delegation-created", "spec", specName, "user", user.Name,
		"question", questionID, "from", user.Name, "to", delegatedTo)); err != nil {
		return fmt.Errorf("log the delegation-created event: %w", err)
	}

	return nil
}

// ReviewItem is a delegation as `review` prints it.
type ReviewItem struct {
	QuestionID  string
	Question    string
	DelegatedBy string
	// DelegatedAt is the delegation's date (the first 10 characters).
	DelegatedAt string
	// Answer is the first 80 characters of the answer.
	Answer string
}

// ReviewResult is the current user's delegations on a spec, and the one
// answered when the command answered one ("" for none).
type ReviewResult struct {
	Pending  []ReviewItem
	Answered []ReviewItem
	Settled  string
}

// ReviewOptions are review's --question= (1-based, digits only) and --answer=.
type ReviewOptions struct {
	Question *string
	Answer   *string
}

// Review is `spec <name> review`: the delegations to the current user, and
// with --question=<n> --answer=<text> the answer to the nth pending one.
func Review(ctx context.Context, e *LifecycleEnv, specName string, opts ReviewOptions) (ReviewResult, error) {
	root := e.Root
	manifest, _ := readManifestSection(root)

	state, err := ResolveState(root, specName, CommandPrefixOf(manifest), e.Warn)
	if err != nil {
		return ReviewResult{}, refuse("state", err.Error())
	}

	user := e.ResolveUser(ctx)
	delegations := objectsOf(discoveryOf(state).arr("delegations"))

	var pending, answered []*JSObject

	for _, d := range delegations {
		if to, _ := d.get("delegatedTo"); to != user.Name {
			continue
		}

		switch status, _ := d.get("status"); status {
		case "pending":
			pending = append(pending, d)
		case "answered":
			answered = append(answered, d)
		}
	}

	result := ReviewResult{Pending: []ReviewItem{}, Answered: []ReviewItem{}}
	if len(pending) == 0 && len(answered) == 0 {
		return result, nil
	}

	texts := map[string]string{}
	for _, q := range GetQuestionsWithExtras(activeConcernsOf(root, manifest, e.Warn)) {
		texts[q.ID] = q.Text
	}

	item := func(d *JSObject) ReviewItem {
		id := d.str("questionId")

		text, known := texts[id]
		if !known {
			text = jsDisplayField(d, "questionId")
		}

		answer := ""
		if value, ok := d.strOK("answer"); ok {
			answer = jsSliceUnits(value, 80)
		}

		return ReviewItem{QuestionID: id, Question: text, DelegatedBy: jsDisplayField(d, "delegatedBy"),
			DelegatedAt: jsSliceUnits(d.str("delegatedAt"), 10), Answer: answer}
	}

	for _, d := range pending {
		result.Pending = append(result.Pending, item(d))
	}

	for _, d := range answered {
		result.Answered = append(result.Answered, item(d))
	}

	if opts.Answer == nil || opts.Question == nil {
		return result, nil
	}

	index, ok := questionNumber(*opts.Question)
	if !ok || index-1 < 0 || index-1 >= len(pending) {
		return result, nil
	}

	delegation := pending[index-1]
	questionID := delegation.str("questionId")
	settledDelegations := make([]any, 0, len(delegations))

	for _, raw := range discoveryOf(state).arr("delegations") {
		d, isObject := raw.(*JSObject)
		if isObject && d.str("questionId") == questionID && d.str("status") == "pending" {
			raw = d.with("status", "answered", "answer", *opts.Answer, "answeredBy", user.Name, "answeredAt", e.nowISO())
		}

		settledDelegations = append(settledDelegations, raw)
	}

	if err := WriteSpecStateObject(root, specName, withDiscovery(state, "delegations", settledDelegations), e.Warn); err != nil {
		return result, err
	}

	if err := appendEvent(root, JSObjectOf("ts", e.nowISO(), "type", "delegation-answered", "spec", specName, "user", user.Name,
		"question", questionID)); err != nil {
		return result, fmt.Errorf("log the delegation-answered event: %w", err)
	}

	result.Settled = questionID

	return result, nil
}

// ValidateDecision is a decision the spec waits for.
type ValidateDecision struct {
	Section    string
	Question   string
	WaitingFor []string
}

// ValidateResult is `validate`'s completeness report.
type ValidateResult struct {
	CanAdvance       bool
	VisibleSections  int
	Unresolved       []string
	PendingDecisions []ValidateDecision
}

// ValidateSpec is `validate <spec>`: the completeness gate on the spec's
// own state file, without a phase change. A spec without a state file is
// checked as the initial state, as the TypeScript command does.
func ValidateSpec(e *LifecycleEnv, specName string) ValidateResult {
	state := ReadSpecStateObject(e.Root, specName, e.Warn)
	specState := state.objOrEmpty("specState")
	report := CheckSpecCompletenessObject(specState)

	visible := 0

	for _, p := range objectsOf(specState.arr("placeholders")) {
		if p.str("status") != "conditional-hidden" {
			visible++
		}
	}

	result := ValidateResult{CanAdvance: report.CanAdvance, VisibleSections: visible}

	for _, section := range report.Unresolved {
		result.Unresolved = append(result.Unresolved, section.Title)
	}

	for _, d := range report.PendingDecisions {
		result.PendingDecisions = append(result.PendingDecisions, ValidateDecision{
			Section:    jsDisplayField(d, "section"),
			Question:   jsDisplayField(d, "question"),
			WaitingFor: stringsOfDisplay(d.arr("waitingFor")),
		})
	}

	return result
}

func stringsOfDisplay(items []any) []string {
	out := make([]string, len(items))
	for i, item := range items {
		out[i] = joinedString(item)
	}

	return out
}

// PlanExport is `spec <name> plan-export`: .claude/plan.md from the spec's
// state and spec.md, in SPEC_PROPOSAL, SPEC_APPROVED or EXECUTING. It
// returns the path written. A refusal's message is what the TypeScript
// command reports on stderr.
func PlanExport(e *LifecycleEnv, specName string) (string, error) {
	root := e.Root
	manifest, _ := readManifestSection(root)

	state, err := ResolveState(root, specName, CommandPrefixOf(manifest), e.Warn)
	if err != nil {
		return "", refuse("state", err.Error())
	}

	switch phase := phaseOf(state); phase {
	case PhaseSpecProposal, PhaseSpecApproved, PhaseExecuting:
	default:
		return "", refuse("phase", "Spec must be in SPEC_PROPOSAL, SPEC_APPROVED, or EXECUTING to export a plan (current: "+phase+").")
	}

	const undefinedSection = "(not yet defined)"

	parsed := ReadParsedSpec(root, specName)
	completed := stringsOf(executionOf(state).arr("completedTasks"))

	lines := []string{"# Plan: " + specName, "Generated by noskills " + e.nowISO() + " from spec/" + specName, "", "## Summary"}

	if description, ok := state.strOK("specDescription"); ok {
		lines = append(lines, jsTrim(description))
	} else {
		lines = append(lines, undefinedSection)
	}

	lines = append(lines, "", "## Tasks")

	if parsed != nil && len(parsed.Tasks) > 0 {
		for _, task := range parsed.Tasks {
			check := " "
			if containsString(completed, task.ID) {
				check = "x"
			}

			lines = append(lines, "- ["+check+"] "+task.Title)
		}
	} else {
		lines = append(lines, undefinedSection)
	}

	lines = append(lines, "", "## Acceptance Criteria")

	if acs := objectsOf(state.arr("customACs")); len(acs) > 0 {
		for _, ac := range acs {
			lines = append(lines, "- "+jsDisplayField(ac, "text"))
		}
	} else {
		lines = append(lines, undefinedSection)
	}

	answers := answersObjects(state)
	lines = append(lines, "", "## Out of Scope")

	if scope := answerFor(answers, "scope_boundary"); scope != nil && jsTrim(scope.str("answer")) != "" {
		for _, line := range strings.Split(scope.str("answer"), "\n") {
			if trimmed := jsTrim(line); trimmed != "" {
				lines = append(lines, "- "+trimmed)
			}
		}
	} else {
		lines = append(lines, undefinedSection)
	}

	lines = append(lines, "", "## Verification")

	if verification := answerFor(answers, "verification"); verification != nil && jsTrim(verification.str("answer")) != "" {
		lines = append(lines, jsTrim(verification.str("answer")))
	} else {
		lines = append(lines, undefinedSection)
	}

	lines = append(lines, "")

	planPath := root + "/.claude/plan.md"

	if err := os.MkdirAll(filepath.Join(root, ".claude"), 0o750); err != nil {
		return "", refuse("write", "Write "+planPath+": "+err.Error())
	}

	if err := os.WriteFile(filepath.Join(root, ".claude", "plan.md"), []byte(strings.Join(lines, "\n")), 0o644); err != nil { //nolint:gosec // G306: the plan is a project file
		return "", refuse("write", "Write "+planPath+": "+err.Error())
	}

	return planPath, nil
}

// ChildSpec is a spec split out of a parent.
type ChildSpec struct {
	Name string
	// Description is what the child covers; "" for none.
	Description string
	// Answers are the parent's discovery answers the child starts with.
	Answers []any
}

// SplitRefusedError is a split that cannot go ahead: a child name repeats
// or belongs to an existing spec.
type SplitRefusedError struct {
	Message string
	Names   []string
}

func (e *SplitRefusedError) Error() string { return e.Message }

// childSpecState is buildChildSpecState: discovery complete with the
// inherited answers, waiting in DISCOVERY_REFINEMENT.
func childSpecState(child ChildSpec) (*JSObject, error) {
	started, err := startSpecState(InitialState(), child.Name, "spec/"+child.Name, child.Description)
	if err != nil {
		return nil, err
	}

	if child.Description == "" {
		started = started.with("specDescription", nil)
	}

	return completeDiscoveryState(withDiscovery(started, "answers", appendAny(child.Answers)))
}

// SplitSpec is splitSpec: every child gets its directory and state file,
// and the parent comes back cancelled with a note naming them. The caller
// writes the parent. Every name is checked first, so a refused split
// creates nothing.
func SplitSpec(e *LifecycleEnv, parent *JSObject, children []ChildSpec, commandPrefix string) (*JSObject, error) {
	root := e.Root
	names := make([]string, len(children))

	for i, child := range children {
		names[i] = child.Name
	}

	quoted := func(list []string) string {
		seen := map[string]bool{}
		parts := []string{}

		for _, name := range list {
			if !seen[name] {
				seen[name] = true

				parts = append(parts, `"`+name+`"`)
			}
		}

		return strings.Join(parts, ", ")
	}

	var repeated []string

	for i, name := range names {
		if indexOfString(names, name) != i {
			repeated = append(repeated, name)
		}
	}

	if len(repeated) > 0 {
		return nil, &SplitRefusedError{
			Message: "Cannot split: child spec names must be unique, and these repeat: " + quoted(repeated) + ".",
			Names:   repeated,
		}
	}

	var existing []string

	for _, name := range names {
		if pathExists(filepath.Join(root, specsDir, name)) {
			existing = append(existing, name)
		}
	}

	if len(existing) > 0 {
		parentName := "<name>"
		if spec, ok := parent.strOK("spec"); ok {
			parentName = spec
		}

		return nil, &SplitRefusedError{
			Message: "Cannot split: these specs already exist: " + quoted(existing) + ". Choose other names with `" +
				commandPrefix + " spec " + parentName + ` split --into <first> "<description>" --into <second> "<description>"` + "`.",
			Names: existing,
		}
	}

	for _, child := range children {
		if !validSpecPathName(child.Name) {
			return nil, &SpecNotFoundError{Name: child.Name, CommandPrefix: commandPrefix}
		}

		if err := os.MkdirAll(filepath.Join(root, specsDir, child.Name), 0o750); err != nil {
			return nil, fmt.Errorf("create the spec directory of %q: %w", child.Name, err)
		}

		state, err := childSpecState(child)
		if err != nil {
			return nil, err
		}

		if err := WriteSpecStateObject(root, child.Name, state, e.Warn); err != nil {
			return nil, err
		}
	}

	return completeSpecState(parent, CompletionCancelled, "Split into: "+strings.Join(names, ", "), e.nowISO())
}

func indexOfString(items []string, value string) int {
	for i, item := range items {
		if item == value {
			return i
		}
	}

	return -1
}

// SplitInto is one `--into <name> ["description"]` of `spec split`.
type SplitInto struct {
	Name        string
	Description string
}

// SplitCommand is `spec <name> split [--into <name> "description"]...`:
// the --into children, each with every answer, or the areas the split
// detector finds, each with the answers it came from. It returns the
// children's names.
func SplitCommand(e *LifecycleEnv, specName string, into []SplitInto) ([]string, error) {
	root := e.Root
	manifest, _ := readManifestSection(root)
	prefix := CommandPrefixOf(manifest)

	parent, err := ResolveState(root, specName, prefix, e.Warn)
	if err != nil {
		return nil, refuse("state", "Error: "+err.Error())
	}

	if phase := phaseOf(parent); phase != PhaseDiscovery && phase != PhaseDiscoveryRefinement {
		return nil, refuse("phase", "Cannot split spec in phase "+phase+". Must be in DISCOVERY or DISCOVERY_REFINEMENT.")
	}

	answers := discoveryOf(parent).arr("answers")

	var children []ChildSpec

	if len(into) >= 2 {
		var invalid []string

		for _, entry := range into {
			if !IsValidSpecName(entry.Name) {
				invalid = append(invalid, entry.Name)
			}
		}

		if len(invalid) > 0 {
			return nil, refuse("invalid-name", "Invalid child spec name: ", strings.Join(invalid, ", "))
		}

		for _, entry := range into {
			children = append(children, ChildSpec{Name: entry.Name, Description: entry.Description, Answers: answers})
		}
	} else {
		children = detectedChildren(parent)
		if len(children) < 2 {
			return nil, refuse("no-areas",
				"Error: at least 2 --into entries required, or discovery answers must contain 2+ independent areas.")
		}
	}

	completed, err := SplitSpec(e, parent, children, prefix)
	if err != nil {
		return nil, err
	}

	if err := WriteSpecStateObject(root, specName, completed, e.Warn); err != nil {
		return nil, err
	}

	names := make([]string, len(children))
	for i, child := range children {
		names[i] = child.Name
	}

	return names, nil
}

// detectedChildren are the split detector's areas as child specs, each with
// the answers it came from; nil when it finds no split.
func detectedChildren(state *JSObject) []ChildSpec {
	proposal := AnalyzeForSplit(answersObjects(state))
	if !proposal.Detected {
		return nil
	}

	children := make([]ChildSpec, 0, len(proposal.Proposals))

	for _, item := range proposal.Proposals {
		var answers []any

		for _, raw := range discoveryOf(state).arr("answers") {
			if a, ok := raw.(*JSObject); ok && containsString(item.RelevantAnswers, a.str("questionId")) {
				answers = append(answers, raw)
			}
		}

		children = append(children, ChildSpec{Name: item.Name, Description: item.Description, Answers: answers})
	}

	return children
}

// StatusView is what `status` prints in the human mode.
type StatusView struct {
	Phase        string
	Spec         string
	Branch       string
	HasSpec      bool
	HasBranch    bool
	Answered     int
	Questions    int
	Iteration    string
	LastProgress *string
	DebtItems    *int
	HasConfig    bool
	Concerns     []string
	Tools        []string
	Decisions    int
}

// StatusHuman is `status` with -o markdown or text, which prints the
// status lines instead of the JSON. A missing spec is an error the
// TypeScript command does not catch.
func StatusHuman(e *LifecycleEnv, specName string) (StatusView, error) {
	root := e.Root
	manifest, hasManifest := readManifestSection(root)

	if !IsHookInitialized(root) {
		return StatusView{}, refuse("not-initialized", "noskills is not initialized.")
	}

	state, err := ResolveState(root, specName, CommandPrefixOf(manifest), e.Warn)
	if err != nil {
		return StatusView{}, err
	}

	execution := executionOf(state)
	view := StatusView{
		Phase:     jsDisplayField(state, "phase"),
		Answered:  len(discoveryOf(state).arr("answers")),
		Questions: len(questions),
		Iteration: jsDisplayField(execution, "iteration"),
		HasConfig: hasManifest && manifest != nil,
		Decisions: len(state.arr("decisions")),
	}

	if value, ok := state.get("spec"); !ok || value != nil {
		view.HasSpec = true
		view.Spec = templateOf(value, ok)
	}

	if value, ok := state.get("branch"); !ok || value != nil {
		view.HasBranch = true
		view.Branch = templateOf(value, ok)
	}

	if value, ok := execution.get("lastProgress"); !ok || value != nil {
		text := templateOf(value, ok)
		view.LastProgress = &text
	}

	if value, ok := execution.get("debt"); !ok || value != nil {
		count := len(execution.obj("debt").arr("items"))
		view.DebtItems = &count
	}

	if view.HasConfig {
		view.Concerns = stringsOfDisplay(manifest.arr("concerns"))
		view.Tools = stringsOfDisplay(manifest.arr("tools"))
	}

	return view, nil
}

// questionNumber is review.ts questionIndexOf plus one: the number of
// `--question=<n>` when n is digits only (parseInt took "1x" as 1).
func questionNumber(value string) (int, bool) {
	if value == "" || strings.Trim(value, "0123456789") != "" {
		return 0, false
	}

	n, err := strconv.Atoi(value)

	return n, err == nil
}
