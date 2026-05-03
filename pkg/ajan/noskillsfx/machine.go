// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"fmt"
	"strings"
)

// validTransitions mirrors VALID_TRANSITIONS in machine.ts.
//
//nolint:gochecknoglobals
var validTransitions = map[Phase][]Phase{
	PhaseUninitialized:       {PhaseIdle},
	PhaseIdle:                {PhaseDiscovery, PhaseCompleted},
	PhaseDiscovery:           {PhaseDiscoveryRefinement, PhaseCompleted},
	PhaseDiscoveryRefinement: {PhaseDiscoveryRefinement, PhaseSpecProposal, PhaseCompleted},
	PhaseSpecProposal:        {PhaseSpecProposal, PhaseSpecApproved, PhaseCompleted},
	PhaseSpecApproved:        {PhaseExecuting, PhaseCompleted},
	PhaseExecuting:           {PhaseCompleted, PhaseBlocked},
	PhaseBlocked:             {PhaseExecuting, PhaseCompleted},
	PhaseCompleted:           {PhaseIdle, PhaseDiscovery},
}

// CanTransition reports whether a phase hop from → to is valid.
func CanTransition(from, to Phase) bool {
	allowed, ok := validTransitions[from]
	if !ok {
		return false
	}

	for _, p := range allowed {
		if p == to {
			return true
		}
	}

	return false
}

// AssertTransition panics with a descriptive message if the transition is invalid.
func AssertTransition(from, to Phase) error {
	if CanTransition(from, to) {
		return nil
	}

	allowed := validTransitions[from]
	names := make([]string, len(allowed))
	copy(names, allowed)

	return fmt.Errorf(
		"%w: %s → %s. allowed: %s",
		ErrInvalidTransition, from, to, strings.Join(names, ", "),
	)
}

// Transition returns a copy of state with phase set to `to`.
// Returns an error if the transition is not valid.
func Transition(state StateFile, to Phase) (StateFile, error) {
	if err := AssertTransition(state.Phase, to); err != nil {
		return state, err
	}

	result := state
	result.Phase = to

	return result, nil
}

// StartSpec transitions IDLE → DISCOVERY and initialises the spec fields.
func StartSpec(state StateFile, specName, branch string, description *string) (StateFile, error) {
	if err := AssertTransition(state.Phase, PhaseDiscovery); err != nil {
		return state, err
	}

	result := state
	result.Phase = PhaseDiscovery
	result.Spec = &specName
	result.SpecDescription = description
	result.Branch = &branch
	result.Discovery = DiscoveryState{
		Answers:         []DiscoveryAnswer{},
		Completed:       false,
		CurrentQuestion: 0,
		Audience:        "human",
		Approved:        false,
		PlanPath:        nil,
	}
	result.SpecState = SpecState{
		Path:         nil,
		Status:       "none",
		Metadata:     EmptySpecMetadata(),
		Placeholders: []PlaceholderStatus{},
	}
	result.Execution = ExecutionState{
		Iteration:            0,
		LastProgress:         nil,
		ModifiedFiles:        []string{},
		LastVerification:     nil,
		AwaitingStatusReport: false,
		Debt:                 nil,
		CompletedTasks:       []string{},
		DebtCounter:          0,
		NaItems:              []string{},
	}
	result.Decisions = []Decision{}
	result.Classification = nil
	result.CompletionReason = nil
	result.CompletedAt = nil
	result.CompletionNote = nil
	result.RevisitHistory = []RevisitEntry{}

	return result, nil
}

// AddDiscoveryAnswer appends an answer to the discovery state (immutably).
func AddDiscoveryAnswer(state StateFile, answer DiscoveryAnswer) StateFile {
	result := state
	answers := make([]DiscoveryAnswer, len(state.Discovery.Answers)+1)
	copy(answers, state.Discovery.Answers)
	answers[len(answers)-1] = answer

	disc := state.Discovery
	disc.Answers = answers
	result.Discovery = disc

	return result
}

// CompleteDiscovery marks discovery as completed.
func CompleteDiscovery(state StateFile) (StateFile, error) {
	result := state
	disc := state.Discovery
	disc.Completed = true
	result.Discovery = disc

	return result, nil
}

// ApproveDiscoveryReview transitions DISCOVERY → DISCOVERY_REFINEMENT.
func ApproveDiscoveryReview(state StateFile) (StateFile, error) {
	if err := AssertTransition(state.Phase, PhaseDiscoveryRefinement); err != nil {
		return state, err
	}

	result := state
	result.Phase = PhaseDiscoveryRefinement

	disc := result.Discovery
	disc.Approved = true
	result.Discovery = disc

	return result, nil
}

// ApproveSpec transitions SPEC_PROPOSAL → SPEC_APPROVED.
func ApproveSpec(state StateFile) (StateFile, error) {
	if err := AssertTransition(state.Phase, PhaseSpecApproved); err != nil {
		return state, err
	}

	result := state
	result.Phase = PhaseSpecApproved

	sp := result.SpecState
	sp.Status = "approved"
	result.SpecState = sp

	return result, nil
}

// StartExecution transitions SPEC_APPROVED → EXECUTING.
func StartExecution(state StateFile) (StateFile, error) {
	if err := AssertTransition(state.Phase, PhaseExecuting); err != nil {
		return state, err
	}

	result := state
	result.Phase = PhaseExecuting

	return result, nil
}

// AdvanceExecution increments the iteration counter and clears awaitingStatusReport.
func AdvanceExecution(state StateFile, progress string) StateFile {
	result := state
	exec := state.Execution
	exec.Iteration++
	exec.LastProgress = &progress
	exec.AwaitingStatusReport = false
	result.Execution = exec

	return result
}

// BlockExecution transitions EXECUTING → BLOCKED.
func BlockExecution(state StateFile) (StateFile, error) {
	if err := AssertTransition(state.Phase, PhaseBlocked); err != nil {
		return state, err
	}

	result := state
	result.Phase = PhaseBlocked

	return result, nil
}

// CompleteSpec transitions current phase → COMPLETED.
func CompleteSpec(state StateFile, reason CompletionReason, note *string, completedAt string) (StateFile, error) {
	if err := AssertTransition(state.Phase, PhaseCompleted); err != nil {
		return state, err
	}

	result := state
	result.Phase = PhaseCompleted
	result.CompletionReason = &reason
	result.CompletedAt = &completedAt
	result.CompletionNote = note

	return result, nil
}

// ResetToIdle transitions COMPLETED → IDLE.
func ResetToIdle(state StateFile) (StateFile, error) {
	if err := AssertTransition(state.Phase, PhaseIdle); err != nil {
		return state, err
	}

	fresh := CreateInitialState()
	fresh.Phase = PhaseIdle

	return fresh, nil
}

// ReopenSpec transitions COMPLETED → DISCOVERY, preserving revisit history.
func ReopenSpec(state StateFile, reason, timestamp string) (StateFile, error) {
	if err := AssertTransition(state.Phase, PhaseDiscovery); err != nil {
		return state, err
	}

	entry := RevisitEntry{
		From:           state.Phase,
		Reason:         reason,
		CompletedTasks: append([]string{}, state.Execution.CompletedTasks...),
		Timestamp:      timestamp,
	}

	result := state
	result.Phase = PhaseDiscovery
	result.ReopenedFrom = state.CompletedAt
	result.CompletionReason = nil
	result.CompletedAt = nil
	result.CompletionNote = nil

	history := make([]RevisitEntry, len(state.RevisitHistory)+1)
	copy(history, state.RevisitHistory)
	history[len(history)-1] = entry
	result.RevisitHistory = history

	return result, nil
}

// AddDecision appends a binding decision to the state.
func AddDecision(state StateFile, decision Decision) StateFile {
	result := state
	decisions := make([]Decision, len(state.Decisions)+1)
	copy(decisions, state.Decisions)
	decisions[len(decisions)-1] = decision
	result.Decisions = decisions

	return result
}

// SetCompletenessScore updates the refinement sub-state's completeness score.
func SetCompletenessScore(state StateFile, score CompletenessScore, initial bool) StateFile {
	result := state
	disc := state.Discovery

	refinement := disc.Refinement
	if refinement == nil {
		refinement = &RefinementSubState{}
	}

	r := *refinement

	if initial {
		r.InitialCompletenessScore = &score
	} else {
		r.CompletenessScore = &score
	}

	disc.Refinement = &r
	result.Discovery = disc

	return result
}

// SetReviewPosture sets the posture for the refinement phase.
func SetReviewPosture(state StateFile, posture ReviewPosture) StateFile {
	result := state
	disc := state.Discovery

	refinement := disc.Refinement
	if refinement == nil {
		refinement = &RefinementSubState{}
	}

	r := *refinement
	r.ReviewPosture = &posture
	disc.Refinement = &r
	result.Discovery = disc

	return result
}

// AddConfidenceFinding appends a confidence-scored finding to execution state.
func AddConfidenceFinding(state StateFile, finding ConfidenceFinding) StateFile {
	result := state
	exec := state.Execution

	findings := make([]ConfidenceFinding, len(exec.ConfidenceFindings)+1)
	copy(findings, exec.ConfidenceFindings)
	findings[len(findings)-1] = finding
	exec.ConfidenceFindings = findings
	result.Execution = exec

	return result
}

// GetLowConfidenceFindings returns findings below the given threshold.
func GetLowConfidenceFindings(state StateFile, threshold int) []ConfidenceFinding {
	var low []ConfidenceFinding

	for _, f := range state.Execution.ConfidenceFindings {
		if f.Confidence < threshold {
			low = append(low, f)
		}
	}

	return low
}
