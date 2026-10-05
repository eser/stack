// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"fmt"
	"strconv"
)

// CompileOptions configures how the compiler assembles the NextOutput.
type CompileOptions struct {
	// Hints describes agent tool capabilities. Defaults to DefaultInteractionHints.
	Hints *InteractionHints
	// AllConcerns is the full list of loaded concern definitions.
	// Compile filters to those listed in manifest.Concerns.
	AllConcerns []ConcernDefinition
}

// Compile produces a NextOutput for the given state and manifest.
// This is the Go equivalent of the `noskills next` command's core logic —
// it dispatches to per-phase builders and assembles the full JSON payload.
//
// Every command in the output starts with manifest.Command, the prefix the
// user runs noskills with, or DefaultCommandPrefix when it is empty. A bare
// `noskills` fails wherever the CLI is not on PATH.
//
//nolint:cyclop,funlen // inherently complex phase dispatch
func Compile(state StateFile, manifest NosManifest, opts CompileOptions) NextOutput { //nolint:gocritic // hugeParam: StateFile is copied on purpose; transitions return a new state
	hints := DefaultInteractionHints
	if opts.Hints != nil {
		hints = *opts.Hints
	}

	prefix := commandPrefixOrDefault(manifest.Command)

	specName := specNameOrPlaceholder(state)

	activeConcerns := FilterActiveConcerns(opts.AllConcerns, manifest.Concerns)
	activeConcernIDs := make([]string, len(activeConcerns))

	for i, c := range activeConcerns {
		activeConcernIDs[i] = c.ID
	}

	maxIter := manifest.MaxIterationsBeforeRestart
	if maxIter == 0 {
		maxIter = 15
	}

	behavioral := BuildBehavioral(
		state,
		manifest.AllowGit,
		activeConcerns,
		hints,
		prefix,
	)
	meta := BuildMeta(state, activeConcernIDs, buildResumeHint(state))
	roadmap := BuildRoadmap(state.Phase)
	modeDirective := buildModeDirective(state.Phase)

	out := NextOutput{
		Phase:         state.Phase,
		Meta:          meta,
		Behavioral:    behavioral,
		Roadmap:       roadmap,
		ModeDirective: modeDirective,
	}

	switch state.Phase {
	case PhaseIdle:
		welcome := "Welcome to noskills. Tell me what you want to build."
		out.Instruction = "Create a spec or manage concerns and rules."
		out.Welcome = &welcome

		existingSpecs, _ := ListSpecStates("") // best-effort, empty root = cwd
		specs := make([]SpecSummary, 0, len(existingSpecs))

		for _, name := range existingSpecs {
			specs = append(specs, SpecSummary{
				Name:  name,
				Phase: PhaseIdle,
			})
		}

		out.ExistingSpecs = specs
		out.AvailableConcerns = buildConcernInfos(opts.AllConcerns)
		out.ActiveConcerns = activeConcernIDs

		count := 0
		out.ActiveRulesCount = &count

	case PhaseDiscovery:
		compileDiscoveryQuestions(
			&out,
			state,
			GetQuestionsWithExtras(activeConcerns),
			hints,
			prefix,
			specName,
		)

		out.Context = &ContextBlock{
			Rules:            []string{},
			ConcernReminders: GetReminders(activeConcerns, state.Classification),
		}

		if len(state.RevisitHistory) > 0 {
			revisited := true
			out.Revisited = &revisited

			last := state.RevisitHistory[len(state.RevisitHistory)-1]
			out.RevisitReason = &last.Reason
		}

	case PhaseDiscoveryRefinement:
		answers := make([]DiscoveryReviewAnswer, 0, len(state.Discovery.Answers))

		for _, a := range state.Discovery.Answers {
			answers = append(answers, DiscoveryReviewAnswer{
				QuestionID: a.QuestionID,
				Question:   findQuestionText(a.QuestionID),
				Answer:     a.Answer,
			})
		}

		out.Answers = answers
		out.Instruction = "Review discovery answers and apply posture-guided refinement."

		stage := getDiscoveryRefinementStage(state)
		out.SubPhase = &stage

		if state.Discovery.Refinement != nil {
			out.CompletenessScore = state.Discovery.Refinement.CompletenessScore
			out.ReviewPosture = state.Discovery.Refinement.ReviewPosture
		}

		// Auto-infer classification if not yet set
		if state.Classification == nil {
			cl := InferClassification(state)
			preview := FormatClassificationPreview(cl)
			out.ClassificationPreview = &preview
		}

	case PhaseSpecProposal:
		specPath := fmt.Sprintf(".eser/specs/%s/spec.md", specName)
		out.SpecPath = &specPath
		out.Instruction = fmt.Sprintf("Review and approve the spec at %s.", specPath)

		if state.Classification == nil {
			classReq := true
			out.ClassificationRequired = &classReq
		}

	case PhaseSpecApproved:
		specPath := fmt.Sprintf(".eser/specs/%s/spec.md", specName)
		out.SpecPath = &specPath
		out.Instruction = "Spec is approved. Trigger execution when ready."

	case PhaseExecuting:
		iter := state.Execution.Iteration
		out.Iteration = &iter

		onComplete := specCommand(
			prefix,
			specName,
			"next --answer='{\"completed\":[...],\"remaining\":[...],\"blocked\":[]}'",
		)
		out.OnComplete = &onComplete

		// A flag for formatters and dashboards only; the agent's rules carry
		// no iteration countdown (mirrors compileExecution in compiler.ts).
		if iter >= maxIter {
			restart := true
			out.RestartRecommended = &restart
		}

		if state.Execution.LastVerification != nil && !state.Execution.LastVerification.Passed {
			failed := true
			out.VerificationFailed = &failed
			out.VerificationOutput = &state.Execution.LastVerification.Output
		}

		out.Instruction = fmt.Sprintf(
			"Execute iteration %d. Complete tasks, then report progress.",
			iter+1,
		)
		// Scoped reminders are file-specific: the PreToolUse hook adds them
		// when the agent edits a matching file, so the instruction carries
		// only the unscoped ones and counts the rest (mirrors compile in
		// compiler.ts).
		tier1, tier2 := SplitRemindersByTier(activeConcerns, state.Classification)
		out.Context = &ContextBlock{
			Rules:            []string{},
			ConcernReminders: tier1,
		}

		if len(tier2) > 0 {
			summary := fmt.Sprintf(
				"%d file-specific rules delivered via PreToolUse hook when editing matching files.",
				len(tier2),
			)
			out.Behavioral.Tier2Summary = &summary
		}

		tensionCount := len(DetectTensions(activeConcerns))
		_ = tensionCount // surfaced in behavioral

	case PhaseBlocked:
		out.Instruction = "Execution is blocked. Analyze the blocker and present options."
		reason := "Awaiting user decision."

		if state.Execution.LastProgress != nil {
			reason = fmt.Sprintf("Blocked after: %s", *state.Execution.LastProgress)
		}

		out.Reason = &reason

		onResolved := specCommand(prefix, specName, "next --answer='{\"unblocked\": true}'")
		out.OnResolved = &onResolved

	case PhaseCompleted:
		out.Instruction = "Spec completed. Review the summary."
		out.Summary = &CompletedSummary{
			Spec:             state.Spec,
			Iterations:       state.Execution.Iteration,
			DecisionsCount:   len(state.Decisions),
			CompletionReason: state.CompletionReason,
			CompletionNote:   state.CompletionNote,
		}

	default:
		out.Instruction = fmt.Sprintf("Unknown phase: %s", state.Phase)
	}

	return out
}

// =============================================================================
// Helpers
// =============================================================================

// specNameOrPlaceholder returns the active spec's name, or "<name>" for a
// command that needs one while no spec is active.
func specNameOrPlaceholder(state StateFile) string { //nolint:gocritic // hugeParam: StateFile is copied on purpose; transitions return a new state
	if state.Spec == nil {
		return "<name>"
	}

	return *state.Spec
}

// commandPrefixOrDefault returns prefix, or DefaultCommandPrefix when it is
// empty, so no command string starts with a space.
func commandPrefixOrDefault(prefix string) string {
	if prefix == "" {
		return DefaultCommandPrefix
	}

	return prefix
}

// specCommand builds a spec-scoped command such as
// `npx eser@latest noskills spec my-spec next` (mirrors cs() in compiler.ts).
func specCommand(prefix string, specName string, subcommand string) string {
	return prefix + " spec " + specName + " " + subcommand
}

func buildResumeHint(state StateFile) string { //nolint:gocritic // hugeParam: StateFile is copied on purpose; transitions return a new state
	spec := "(none)"
	if state.Spec != nil {
		spec = *state.Spec
	}

	return fmt.Sprintf(
		"phase=%s spec=%s iter=%s",
		state.Phase, spec, strconv.Itoa(state.Execution.Iteration),
	)
}

func buildModeDirective(phase Phase) *string {
	var s string

	switch phase {
	case PhaseDiscovery, PhaseDiscoveryRefinement, PhaseSpecProposal, PhaseSpecApproved, PhaseBlocked:
		s = "plan"
	case PhaseExecuting:
		s = "normal"
	default:
		return nil
	}

	return &s
}

func buildConcernInfos(all []ConcernDefinition) []ConcernInfo {
	infos := make([]ConcernInfo, len(all))

	for i, c := range all {
		infos[i] = ConcernInfo{ID: c.ID, Description: c.Description}
	}

	return infos
}

// findQuestionText looks up a question's text from the hardcoded list.
func findQuestionText(questionID string) string {
	for _, q := range questions {
		if q.ID == questionID {
			return q.Text
		}
	}

	return questionID
}

// FormatClassificationPreview renders inferred classification as prose
// (mirrors formatClassificationPreview in compiler.ts).
func FormatClassificationPreview(cl SpecClassification) string {
	type entry struct {
		key   string
		label string
		flag  bool
	}

	entries := []entry{
		{"involvesWebUI", "Web UI", cl.InvolvesWebUI},
		{"involvesPublicAPI", "Public API", cl.InvolvesPublicAPI},
		{"involvesCLI", "CLI", cl.InvolvesCLI},
		{"involvesMigration", "Migration", cl.InvolvesMigration},
		{"involvesDataHandling", "Data Handling", cl.InvolvesDataHandling},
	}

	// Build evidence map from InferredFrom
	evidence := make(map[string][]string)

	for _, e := range cl.InferredFrom {
		idx := len(e) - 1
		for i, c := range e {
			if c == ':' {
				idx = i

				break
			}
		}

		key := e[:idx]
		keyword := e[idx+1:]

		evidence[key] = append(evidence[key], keyword)
	}

	lines := []string{"Based on your answers, this spec involves:"}

	for _, en := range entries {
		marker := "\u2717"
		if en.flag {
			marker = "\u2713"
		}

		if en.flag {
			if kws := evidence[en.key]; len(kws) > 0 {
				quoted := make([]string, len(kws))
				for i, k := range kws {
					quoted[i] = `"` + k + `"`
				}

				lines = append(lines, fmt.Sprintf("  %s %s  (mentions: %s)", marker, en.label, joinStrings(quoted)))
			} else {
				lines = append(lines, fmt.Sprintf("  %s %s", marker, en.label))
			}
		} else {
			lines = append(lines, fmt.Sprintf("  %s %s", marker, en.label))
		}
	}

	return joinLines(lines)
}

func joinStrings(ss []string) string {
	result := ""

	for i, s := range ss {
		if i > 0 {
			result += ", "
		}

		result += s
	}

	return result
}

func joinLines(lines []string) string {
	result := ""

	for i, l := range lines {
		if i > 0 {
			result += "\n"
		}

		result += l
	}

	return result
}
