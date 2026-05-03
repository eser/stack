// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"fmt"
	"regexp"
	"strings"
)

// =============================================================================
// Output types (mirrors compiler.ts NextOutput and friends)
// =============================================================================

// GateInfo is a prominent gate message shown to the agent.
type GateInfo struct {
	Message string `json:"message"`
	Action  string `json:"action"`
	Phase   string `json:"phase"`
}

// InteractiveOption is one choice in an interactive prompt.
type InteractiveOption struct {
	Label       string `json:"label"`
	Description string `json:"description"`
}

// ClearContextAction instructs the agent to clear its context window.
type ClearContextAction struct {
	Action string `json:"action"` // always "clear_context"
	Reason string `json:"reason"`
}

// EnforcementInfo describes how constraints are enforced for this session.
type EnforcementInfo struct {
	Level        string   `json:"level"` // "enforced" | "behavioral"
	Capabilities []string `json:"capabilities"`
	Gaps         []string `json:"gaps,omitempty"`
}

// MetaBlock is the self-documenting resume context included in every output.
type MetaBlock struct {
	Protocol       string           `json:"protocol"`
	Spec           *string          `json:"spec"`
	Branch         *string          `json:"branch"`
	Iteration      int              `json:"iteration"`
	LastProgress   *string          `json:"lastProgress"`
	ActiveConcerns []string         `json:"activeConcerns"`
	ResumeHint     string           `json:"resumeHint"`
	Enforcement    *EnforcementInfo `json:"enforcement,omitempty"`
}

// ProtocolGuide explains the protocol to a first-time agent.
type ProtocolGuide struct {
	What         string `json:"what"`
	How          string `json:"how"`
	CurrentPhase string `json:"currentPhase"`
}

// BehavioralBlock carries phase-aware guardrails for agent behavior.
type BehavioralBlock struct {
	ModeOverride *string  `json:"modeOverride,omitempty"`
	Rules        []string `json:"rules"`
	Tone         string   `json:"tone"`
	Urgency      *string  `json:"urgency,omitempty"`
	OutOfScope   []string `json:"outOfScope,omitempty"`
	Tier2Summary *string  `json:"tier2Summary,omitempty"`
}

// ContextBlock carries rules and concern reminders for DISCOVERY/EXECUTING phases.
type ContextBlock struct {
	Rules            []string `json:"rules"`
	ConcernReminders []string `json:"concernReminders"`
}

// DiscoveryQuestion is one question in the discovery interview.
type DiscoveryQuestion struct {
	ID       string   `json:"id"`
	Text     string   `json:"text"`
	Concerns []string `json:"concerns"`
	Extras   []string `json:"extras"`
}

// ModeSelectionOutput offers discovery mode options.
type ModeSelectionOutput struct {
	Required    bool   `json:"required"`
	Instruction string `json:"instruction"`
	Options     []struct {
		ID          string `json:"id"`
		Label       string `json:"label"`
		Description string `json:"description"`
	} `json:"options"`
}

// DiscoveryOutput is the compiled output for the DISCOVERY phase.
type DiscoveryOutput struct {
	Phase           string              `json:"phase"` // "DISCOVERY"
	Instruction     string              `json:"instruction"`
	Questions       []DiscoveryQuestion `json:"questions"`
	AnsweredCount   int                 `json:"answeredCount"`
	CurrentQuestion *int                `json:"currentQuestion,omitempty"`
	TotalQuestions  *int                `json:"totalQuestions,omitempty"`
	Context         ContextBlock        `json:"context"`
	Transition      struct {
		OnComplete string `json:"onComplete"`
	} `json:"transition"`
	Revisited     *bool                `json:"revisited,omitempty"`
	RevisitReason *string              `json:"revisitReason,omitempty"`
	ModeSelection *ModeSelectionOutput `json:"modeSelection,omitempty"`
}

// DiscoveryReviewAnswer is one answered question shown during refinement.
type DiscoveryReviewAnswer struct {
	QuestionID string `json:"questionId"`
	Question   string `json:"question"`
	Answer     string `json:"answer"`
}

// ReviewChecklistDimension is one axis in the review-gate checklist.
type ReviewChecklistDimension struct {
	ID               string `json:"id"`
	Label            string `json:"label"`
	Prompt           string `json:"prompt"`
	EvidenceRequired bool   `json:"evidenceRequired"`
	IsRegistry       bool   `json:"isRegistry"`
	ConcernID        string `json:"concernId"`
}

// ReviewChecklist is the review-gate dimensional checklist.
type ReviewChecklist struct {
	Dimensions          []ReviewChecklistDimension `json:"dimensions"`
	Instruction         string                     `json:"instruction"`
	RegistryInstruction *string                    `json:"registryInstruction,omitempty"`
}

// DiscoveryReviewOutput is the compiled output for DISCOVERY_REFINEMENT.
type DiscoveryReviewOutput struct {
	Phase       string                  `json:"phase"` // "DISCOVERY_REFINEMENT"
	Instruction string                  `json:"instruction"`
	Answers     []DiscoveryReviewAnswer `json:"answers"`
	Transition  struct {
		OnApprove string `json:"onApprove"`
		OnRevise  string `json:"onRevise"`
	} `json:"transition"`
	SubPhase              *string            `json:"subPhase,omitempty"`
	ReviewChecklist       *ReviewChecklist   `json:"reviewChecklist,omitempty"`
	ClassificationPreview *string            `json:"classificationPreview,omitempty"`
	CompletenessScore     *CompletenessScore `json:"completenessScore,omitempty"`
	ReviewPosture         *ReviewPosture     `json:"reviewPosture,omitempty"`
}

// ClassificationOption is one option in the classification prompt.
type ClassificationOption struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// ClassificationPrompt asks the user to confirm inferred classification.
type ClassificationPrompt struct {
	Options     []ClassificationOption `json:"options"`
	Instruction string                 `json:"instruction"`
}

// SelfReview is a self-review checklist for the spec author.
type SelfReview struct {
	Required    bool     `json:"required"`
	Checks      []string `json:"checks"`
	Instruction string   `json:"instruction"`
}

// SpecDraftOutput is the compiled output for SPEC_PROPOSAL.
type SpecDraftOutput struct {
	Phase       string `json:"phase"` // "SPEC_PROPOSAL"
	Instruction string `json:"instruction"`
	SpecPath    string `json:"specPath"`
	Transition  struct {
		OnApprove string `json:"onApprove"`
	} `json:"transition"`
	ClassificationRequired *bool                 `json:"classificationRequired,omitempty"`
	ClassificationPrompt   *ClassificationPrompt `json:"classificationPrompt,omitempty"`
	SelfReview             *SelfReview           `json:"selfReview,omitempty"`
	Saved                  *bool                 `json:"saved,omitempty"`
}

// SpecApprovedOutput is the compiled output for SPEC_APPROVED.
type SpecApprovedOutput struct {
	Phase       string `json:"phase"` // "SPEC_APPROVED"
	Instruction string `json:"instruction"`
	SpecPath    string `json:"specPath"`
	Transition  struct {
		OnStart string `json:"onStart"`
	} `json:"transition"`
	Saved *bool `json:"saved,omitempty"`
}

// AcceptanceCriterion is one AC in the status-report request.
type AcceptanceCriterion struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// StatusReportRequest asks the executor to report completed/remaining/blocked.
type StatusReportRequest struct {
	Criteria     []AcceptanceCriterion `json:"criteria"`
	ReportFormat struct {
		Completed string  `json:"completed"`
		Remaining string  `json:"remaining"`
		Blocked   string  `json:"blocked"`
		Na        *string `json:"na,omitempty"`
		NewIssues *string `json:"newIssues,omitempty"`
	} `json:"reportFormat"`
}

// TaskBlock summarises the current task for the executor.
type TaskBlock struct {
	ID             string   `json:"id"`
	Title          string   `json:"title"`
	TotalTasks     int      `json:"totalTasks"`
	CompletedTasks int      `json:"completedTasks"`
	Files          []string `json:"files,omitempty"`
}

// ExecutionOutput is the compiled output for the EXECUTING phase.
type ExecutionOutput struct {
	Phase       string       `json:"phase"` // "EXECUTING"
	Instruction string       `json:"instruction"`
	Task        *TaskBlock   `json:"task,omitempty"`
	BatchTasks  []string     `json:"batchTasks,omitempty"`
	Context     ContextBlock `json:"context"`
	Transition  struct {
		OnComplete string  `json:"onComplete"`
		OnBlocked  *string `json:"onBlocked,omitempty"`
		Iteration  int     `json:"iteration"`
	} `json:"transition"`
	RestartRecommended   *bool                `json:"restartRecommended,omitempty"`
	VerificationFailed   *bool                `json:"verificationFailed,omitempty"`
	VerificationOutput   *string              `json:"verificationOutput,omitempty"`
	StatusReportRequired *bool                `json:"statusReportRequired,omitempty"`
	StatusReport         *StatusReportRequest `json:"statusReport,omitempty"`
}

// BlockedOutput is the compiled output for the BLOCKED phase.
type BlockedOutput struct {
	Phase       string `json:"phase"` // "BLOCKED"
	Instruction string `json:"instruction"`
	Reason      string `json:"reason"`
	Transition  struct {
		OnResolved string `json:"onResolved"`
	} `json:"transition"`
}

// CompletedSummary is the summary block inside CompletedOutput.
type CompletedSummary struct {
	Spec             *string           `json:"spec"`
	Iterations       int               `json:"iterations"`
	DecisionsCount   int               `json:"decisionsCount"`
	CompletionReason *CompletionReason `json:"completionReason"`
	CompletionNote   *string           `json:"completionNote"`
}

// CompletedOutput is the compiled output for the COMPLETED phase.
type CompletedOutput struct {
	Phase            string           `json:"phase"` // "COMPLETED"
	Summary          CompletedSummary `json:"summary"`
	LearningsPending *bool            `json:"learningsPending,omitempty"`
}

// ConcernInfo is a minimal concern entry in IdleOutput.
type ConcernInfo struct {
	ID          string `json:"id"`
	Description string `json:"description"`
}

// SpecSummary is a spec entry in IdleOutput.
type SpecSummary struct {
	Name      string  `json:"name"`
	Phase     string  `json:"phase"`
	Iteration int     `json:"iteration"`
	Detail    *string `json:"detail,omitempty"`
}

// IdleOutput is the compiled output for the IDLE phase.
type IdleOutput struct {
	Phase             string        `json:"phase"` // "IDLE"
	Instruction       string        `json:"instruction"`
	Welcome           string        `json:"welcome"`
	ExistingSpecs     []SpecSummary `json:"existingSpecs"`
	AvailableConcerns []ConcernInfo `json:"availableConcerns"`
	ActiveConcerns    []string      `json:"activeConcerns"`
	ActiveRulesCount  int           `json:"activeRulesCount"`
	BehavioralNote    *string       `json:"behavioralNote,omitempty"`
	Hint              *string       `json:"hint,omitempty"`
}

// NextOutput is the top-level output for `noskills next`.
// All phase-specific fields are optional (omitempty); `Phase` is always set
// and tells consumers which fields to expect. This flattened struct mirrors
// the TypeScript PhaseOutput intersection type approach.
type NextOutput struct {
	// --- common / always present ---
	Phase       string `json:"phase"`
	Instruction string `json:"instruction,omitempty"`

	// --- meta / behavioral (always present) ---
	Meta       MetaBlock       `json:"meta"`
	Behavioral BehavioralBlock `json:"behavioral"`
	Roadmap    string          `json:"roadmap"`

	// --- optional wrappers ---
	Gate               *GateInfo           `json:"gate,omitempty"`
	InteractiveOptions []InteractiveOption `json:"interactiveOptions,omitempty"`
	CommandMap         map[string]string   `json:"commandMap,omitempty"`
	ToolHint           *string             `json:"toolHint,omitempty"`
	ClearContext       *ClearContextAction `json:"clearContext,omitempty"`
	ModeDirective      *string             `json:"modeDirective,omitempty"`
	ProtocolGuide      *ProtocolGuide      `json:"protocolGuide,omitempty"`

	// --- IDLE ---
	Welcome           *string       `json:"welcome,omitempty"`
	ExistingSpecs     []SpecSummary `json:"existingSpecs,omitempty"`
	AvailableConcerns []ConcernInfo `json:"availableConcerns,omitempty"`
	ActiveConcerns    []string      `json:"activeConcerns,omitempty"`
	ActiveRulesCount  *int          `json:"activeRulesCount,omitempty"`

	// --- DISCOVERY ---
	Questions       []DiscoveryQuestion  `json:"questions,omitempty"`
	AnsweredCount   *int                 `json:"answeredCount,omitempty"`
	CurrentQuestion *int                 `json:"currentQuestion,omitempty"`
	TotalQuestions  *int                 `json:"totalQuestions,omitempty"`
	Context         *ContextBlock        `json:"context,omitempty"`
	Revisited       *bool                `json:"revisited,omitempty"`
	RevisitReason   *string              `json:"revisitReason,omitempty"`
	ModeSelection   *ModeSelectionOutput `json:"modeSelection,omitempty"`

	// --- DISCOVERY_REFINEMENT ---
	Answers               []DiscoveryReviewAnswer `json:"answers,omitempty"`
	SubPhase              *string                 `json:"subPhase,omitempty"`
	ReviewChecklist       *ReviewChecklist        `json:"reviewChecklist,omitempty"`
	ClassificationPreview *string                 `json:"classificationPreview,omitempty"`
	CompletenessScore     *CompletenessScore      `json:"completenessScore,omitempty"`
	ReviewPosture         *ReviewPosture          `json:"reviewPosture,omitempty"`

	// --- SPEC_PROPOSAL ---
	SpecPath               *string               `json:"specPath,omitempty"`
	ClassificationRequired *bool                 `json:"classificationRequired,omitempty"`
	ClassificationPrompt   *ClassificationPrompt `json:"classificationPrompt,omitempty"`
	SelfReview             *SelfReview           `json:"selfReview,omitempty"`
	Saved                  *bool                 `json:"saved,omitempty"`

	// --- EXECUTING ---
	Task                 *TaskBlock           `json:"task,omitempty"`
	BatchTasks           []string             `json:"batchTasks,omitempty"`
	RestartRecommended   *bool                `json:"restartRecommended,omitempty"`
	VerificationFailed   *bool                `json:"verificationFailed,omitempty"`
	VerificationOutput   *string              `json:"verificationOutput,omitempty"`
	StatusReportRequired *bool                `json:"statusReportRequired,omitempty"`
	StatusReport         *StatusReportRequest `json:"statusReport,omitempty"`
	Iteration            *int                 `json:"iteration,omitempty"`
	OnComplete           *string              `json:"onComplete,omitempty"`
	OnBlocked            *string              `json:"onBlocked,omitempty"`

	// --- BLOCKED ---
	Reason     *string `json:"reason,omitempty"`
	OnResolved *string `json:"onResolved,omitempty"`

	// --- COMPLETED ---
	Summary          *CompletedSummary `json:"summary,omitempty"`
	LearningsPending *bool             `json:"learningsPending,omitempty"`
}

// =============================================================================
// Classification inference
// =============================================================================

type classificationPattern struct {
	key     string
	pattern *regexp.Regexp
}

//nolint:gochecknoglobals
var classificationPatterns = []classificationPattern{
	{
		key:     "involvesWebUI",
		pattern: regexp.MustCompile(`(?i)\b(ui|frontend|component|react|css|html|button|modal|form|page|screen|layout|design|loading state|empty state|error state)\b`),
	},
	{
		key:     "involvesCLI",
		pattern: regexp.MustCompile(`(?i)\b(cli|terminal|command.?line|stdout|stdin|ansi|tui|console)\b`),
	},
	{
		key:     "involvesPublicAPI",
		pattern: regexp.MustCompile(`(?i)\b(api|endpoint|rest|graphql|webhook|public.?facing|sdk|client.?library)\b`),
	},
	{
		key:     "involvesMigration",
		pattern: regexp.MustCompile(`(?i)\b(migrat\w*|schema.?change|breaking.?change|backward.?compat|upgrade|deprecat\w*)\b`),
	},
	{
		key:     "involvesDataHandling",
		pattern: regexp.MustCompile(`(?i)\b(pii|gdpr|encrypt|personal.?data|user.?data|data.?retention|data.?safety|sensitive)\b`),
	},
}

// InferClassification infers a SpecClassification from the state using
// keyword matching (mirrors inferClassification in compiler.ts).
func InferClassification(state StateFile) SpecClassification {
	var parts []string

	if state.Spec != nil {
		parts = append(parts, *state.Spec)
	}

	if state.SpecDescription != nil {
		parts = append(parts, *state.SpecDescription)
	}

	parts = append(parts, state.Discovery.UserContext...)

	for _, a := range state.Discovery.Answers {
		parts = append(parts, a.Answer)
	}

	allText := strings.Join(parts, " ")

	result := SpecClassification{
		Source:       ptrString("inferred"),
		InferredFrom: []string{},
	}

	for _, cp := range classificationPatterns {
		match := cp.pattern.FindString(allText)
		if match == "" {
			continue
		}

		switch cp.key {
		case "involvesWebUI":
			result.InvolvesWebUI = true
		case "involvesCLI":
			result.InvolvesCLI = true
		case "involvesPublicAPI":
			result.InvolvesPublicAPI = true
		case "involvesMigration":
			result.InvolvesMigration = true
		case "involvesDataHandling":
			result.InvolvesDataHandling = true
		}

		result.InferredFrom = append(result.InferredFrom, cp.key+":"+strings.ToLower(match))
	}

	return result
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
}

// DefaultInteractionHints are Claude Code defaults.
//
//nolint:gochecknoglobals
var DefaultInteractionHints = InteractionHints{
	HasAskUserTool:        true,
	OptionPresentation:    "tool",
	HasSubAgentDelegation: true,
	SubAgentMethod:        "task",
}

const gitReadonlyRule = "NEVER run git write commands (commit, add, push, checkout, stash, reset, merge, rebase, cherry-pick). Git is read-only for agents. The user controls git. You may read: git log, git diff, git status, git show, git blame."

//nolint:gochecknoglobals
var discoveryConduct = []string{
	"Interview the user relentlessly about every aspect of this plan until you reach a shared understanding.",
	"Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.",
	"For each question, provide your recommended answer — don't just ask, offer your informed opinion.",
	"Ask questions ONE AT A TIME. Do not batch questions. Each question deserves its own focused exchange.",
	"If a question can be answered by exploring the codebase, explore the codebase INSTEAD of asking. Only ask the user what the codebase cannot tell you.",
	"You are an honest engineer. Do NOT fill placeholders with assumptions.",
	"You are investing in this spec like a CEO invests in a product — get the details right.",
	"You are doing academic-level due diligence — no hand-waving, no 'we'll figure it out later.'",
	"If a section is not applicable, ask the user to confirm it's N/A with a specific reason — don't decide yourself.",
	"If two answers conflict, surface the conflict to the user — don't resolve it yourself.",
	"If an answer is vague, push back and ask for specifics — don't accept vague.",
}

// BuildBehavioral constructs the BehavioralBlock for a given phase.
// This is a Go port of buildBehavioral() in compiler.ts.
func BuildBehavioral(
	state StateFile,
	maxIterations int,
	allowGit bool,
	activeConcerns []ConcernDefinition,
	hints InteractionHints,
) BehavioralBlock {
	stale := state.Execution.Iteration >= maxIterations

	askMethod := "Use AskUserQuestion for all decision points."
	if !hints.HasAskUserTool {
		askMethod = "Present options as a numbered list at every decision point."
	}

	mandatoryRules := []string{}
	if !allowGit {
		mandatoryRules = append(mandatoryRules, gitReadonlyRule)
	}

	mandatoryRules = append(mandatoryRules,
		"Report progress honestly. Not done = 'not done'. Partial = 'partial: [works]/[doesn't]'. Untested = 'untested'. 4 of 6 = '4 of 6 done, 2 remaining'.",
		fmt.Sprintf("Never skip steps or infer decisions. %s Recommend first, then ask. One noskills call per interaction — never batch-submit or backfill.", askMethod),
		"Display `roadmap` before other content. Display `gate` prominently.",
		"NEVER suggest bypassing, skipping, or 'breaking out of' noskills. Discovery helps the user — it is not an obstacle. If scope changes: revise spec, reset and create new, or split.",
		"NEVER ask permission to run the next noskills command. After spec new → run next immediately. After answering questions → run next. After approve → run next. After task completion → run next. The workflow is sequential — each step has one next step. Just run it.",
	)

	switch state.Phase {
	case PhaseIdle:
		optionRule := "Pass interactiveOptions DIRECTLY to AskUserQuestion options array (header max 12 chars). Use commandMap to resolve selections."
		if hints.OptionPresentation != "tool" {
			optionRule = "Present interactiveOptions as numbered list. Use commandMap to resolve selections."
		}

		return BehavioralBlock{
			Rules: append([]string{
				"If the user described a feature/bug/task, create a spec immediately: `noskills spec new \"description\"` — name is auto-generated. Do NOT present menus or ask 'What would you like to do?' unless the conversation has no prior context.",
			}, append(mandatoryRules, optionRule)...),
			Tone: "Welcoming. Present choices, then wait.",
		}

	case PhaseDiscovery:
		questionMethod := "Ask each question via AskUserQuestion. One question per call."
		if !hints.HasAskUserTool {
			questionMethod = "Ask one question at a time as text."
		}

		modeOverride := "plan mode. DO NOT create, edit, or write any files. DO NOT run state-modifying commands. MAY read files and run read-only commands (cat, ls, grep, git log, git diff)."

		concernConductRules := []string{}
		for _, c := range activeConcerns {
			concernConductRules = append(concernConductRules, c.ConductRules[PhaseDiscovery]...)
		}

		extra := []string{
			"MODE: You MUST be in plan mode during discovery. Do not exit plan mode.",
			fmt.Sprintf("%s Never answer questions yourself. Never submit answers without user confirmation.", questionMethod),
			"DO NOT create, edit, or write any files.",
			"DO NOT run shell commands that modify state.",
			"You MAY read files and run read-only commands (cat, ls, grep, git log, git diff).",
			"Pre-discovery: read README, CLAUDE.md, design docs, last 20 commits, TODOs, existing specs, directory structure. Present a brief audit summary.",
			"Before starting discovery questions, challenge the user's initial spec description against codebase findings.",
		}
		rules := make([]string, 0, len(mandatoryRules)+len(extra)+len(discoveryConduct)+len(concernConductRules))
		rules = append(rules, mandatoryRules...)
		rules = append(rules, extra...)
		rules = append(rules, discoveryConduct...)
		rules = append(rules, concernConductRules...)

		return BehavioralBlock{
			ModeOverride: &modeOverride,
			Rules:        rules,
			Tone:         "Curious interviewer with a stake in the answers. Comes PREPARED — read the codebase first.",
		}

	case PhaseDiscoveryRefinement:
		modeOverride := "You are in plan mode. Do not create, edit, or write any files."

		concernConductRules := []string{}
		for _, c := range activeConcerns {
			concernConductRules = append(concernConductRules, c.ConductRules[PhaseDiscoveryRefinement]...)
		}

		stage := getDiscoveryRefinementStage(state)

		var stageRules []string
		switch stage {
		case "stage-a":
			stageRules = []string{
				"COMPLETENESS ASSESSMENT: Before presenting answers for review, evaluate the spec's completeness across 6 dimensions. Score each 1-10: problem-clarity, scope-definition, technical-feasibility, verification-strategy, risk-identification, user-impact-analysis. Identify concrete gaps.",
				"Scoring guide: 9-10 = fully addressed; 7-8 = mostly addressed; 5-6 = partially; 3-4 = weakly; 1-2 = not addressed.",
				"After presenting the completeness assessment, present the 4 review posture options: (a) Selective expansion; (b) Hold scope; (c) Scope expansion; (d) Scope reduction.",
			}
		case "stage-b":
			posture := ""
			if state.Discovery.Refinement != nil && state.Discovery.Refinement.ReviewPosture != nil {
				posture = *state.Discovery.Refinement.ReviewPosture
			}

			postureRule := "REVIEW POSTURE: Selective expansion. Hold core scope rigid. Only suggest additions that address gaps from the completeness assessment."
			switch posture {
			case ReviewPostureHoldScope:
				postureRule = "REVIEW POSTURE: Hold scope. Do NOT propose any additions or changes. Surface risks as observations, not change requests."
			case ReviewPostureScopeExpansion:
				postureRule = "REVIEW POSTURE: Scope expansion. Actively look for adjacent concerns and missing features."
			case ReviewPostureScopeReduction:
				postureRule = "REVIEW POSTURE: Scope reduction. Identify everything that can be deferred."
			}

			stageRules = []string{postureRule, "When posture-guided review is complete, produce the CEO REVIEW ANALYSIS."}
		default:
			stageRules = []string{
				"CEO review is complete. Present the updated completeness score delta, the readiness dashboard verdict, and ask the user to advance, revise, or park the spec.",
			}
		}

		toneByStage := map[string]string{
			"stage-a": "Structured evaluator. Score honestly — do not inflate.",
			"stage-b": "Posture-guided reviewer. Follow the posture rules exactly.",
			"stage-c": "Decisive closer. Present delta and get a final decision.",
		}

		rules := make([]string, 0, len(mandatoryRules)+1+len(stageRules)+len(discoveryConduct)+len(concernConductRules))
		rules = append(rules, mandatoryRules...)
		rules = append(rules, "DO NOT create, edit, or write any files.")
		rules = append(rules, stageRules...)
		rules = append(rules, discoveryConduct...)
		rules = append(rules, concernConductRules...)

		return BehavioralBlock{
			ModeOverride: &modeOverride,
			Rules:        rules,
			Tone:         toneByStage[stage],
		}

	case PhaseSpecProposal:
		modeOverride := "plan mode. DO NOT create, edit, or write any files. DO NOT run state-modifying commands. MAY read files and run read-only commands."

		return BehavioralBlock{
			ModeOverride: &modeOverride,
			Rules: append(mandatoryRules,
				"DO NOT create, edit, or write any files.",
				"Read the spec and present a summary to the user.",
				"Flag any tasks that are too vague to execute.",
				"Flag any missing acceptance criteria.",
				"No placeholders in specs.",
				"Ask the user if they want to refine before approving.",
			),
			Tone: "Thoughtful reviewer preparing to hand off to an implementer.",
		}

	case PhaseSpecApproved:
		return BehavioralBlock{
			Rules: append(mandatoryRules,
				"The spec is approved but execution has not started.",
				"Do not start coding until the user triggers execution.",
				"If the user wants changes, they must reset and re-spec.",
			),
			Tone: "Patient. Wait for the go signal.",
		}

	case PhaseExecuting:
		hasSubAgents := hints.SubAgentMethod != "none"

		var spawnInstruction string
		switch hints.SubAgentMethod {
		case "task":
			spawnInstruction = "Spawn noskills-executor via Agent tool. Pass: task title, description, ACs, rules, scope constraints, concern reminders, file paths."
		case "spawn":
			spawnInstruction = "Use spawn_agent for noskills-executor. Pass: task, ACs, rules, scope, file paths. Use wait_agent to collect."
		case "fleet":
			spawnInstruction = "Use /fleet for parallel executors. Pass each: task, ACs, rules, scope, file paths."
		default:
			spawnInstruction = "Execute tasks sequentially yourself. Verify (type-check + tests) after each."
		}

		orchestratorRule := spawnInstruction
		if hasSubAgents {
			orchestratorRule = "You are the orchestrator. NEVER edit files directly — delegate ALL edits to noskills-executor. " + spawnInstruction
		}

		execRules := []string{
			"MODE: You MUST NOT be in plan mode during execution. If you are in plan mode, exit it now.",
			orchestratorRule,
			"Do not explore beyond current task. Do not refactor outside scope. Do not add features, tests, or docs not in the spec.",
			"Edit discipline: (1) Re-read file before editing. (2) Re-read after to confirm. (3) Files >500 LOC: read in chunks. (4) Run type-check + lint after edits.",
			"RATIONALIZATION ALERT: Never use 'should work now', 'looks correct', 'I'm confident'. Run the command, read the output, report what happened.",
			"TDD: (1) Write test. (2) Run it — MUST fail. (3) Implement. (4) Run test — must pass.",
			"VERIFICATION REQUIRED: After EVERY task completion, you MUST spawn noskills-verifier before reporting done.",
		}
		base := make([]string, 0, len(mandatoryRules)+len(execRules)+1)
		base = append(base, mandatoryRules...)
		base = append(base, execRules...)

		if state.Execution.LastVerification != nil && !state.Execution.LastVerification.Passed {
			base = append(base, "Tests are failing. Fix ONLY the failing tests. Do not refactor passing code.")
		}

		behavioral := BehavioralBlock{
			Rules: base,
			Tone:  "Direct. Orchestrate immediately — spawn sub-agents.",
		}

		if stale {
			urgency := fmt.Sprintf("%d+ iterations — context degrading. Finish current task, recommend fresh session.", state.Execution.Iteration)
			behavioral.Urgency = &urgency
		}

		return behavioral

	case PhaseBlocked:
		return BehavioralBlock{
			Rules: append(mandatoryRules,
				"MODE: Enter plan mode. Analyze the blocker. Present options to the user. Do not edit files.",
				"Present the decision to the user exactly as described.",
				"Do not suggest a preferred option unless the user asks for your opinion.",
				"After the user decides, relay the answer immediately. Do not elaborate.",
			),
			Tone: "Brief. The user is making a decision, not having a discussion.",
		}

	case PhaseCompleted:
		return BehavioralBlock{
			Rules: append(mandatoryRules,
				"Report the completion summary. Do not start new work.",
				"If the user wants to continue, they start a new spec.",
			),
			Tone: "Concise. Celebrate briefly, then stop.",
		}

	default:
		return BehavioralBlock{
			Rules: mandatoryRules,
			Tone:  "Neutral.",
		}
	}
}

// getDiscoveryRefinementStage mirrors getDiscoveryRefinementStage in machine.ts.
// Returns "stage-a" (no score), "stage-b" (has posture, no CEO review),
// or "stage-c" (CEO review done).
func getDiscoveryRefinementStage(state StateFile) string {
	r := state.Discovery.Refinement
	if r == nil {
		return "stage-a"
	}

	if r.ReviewPosture == nil {
		return "stage-a"
	}

	if r.CeoReview == nil {
		return "stage-b"
	}

	return "stage-c"
}

// BuildMeta constructs the MetaBlock for a given state and concern IDs.
func BuildMeta(state StateFile, activeConcernIDs []string, resumeHint string) MetaBlock {
	return MetaBlock{
		Protocol:       "noskillsfx/1.0",
		Spec:           state.Spec,
		Branch:         state.Branch,
		Iteration:      state.Execution.Iteration,
		LastProgress:   state.Execution.LastProgress,
		ActiveConcerns: activeConcernIDs,
		ResumeHint:     resumeHint,
	}
}

// BuildRoadmap builds a one-line roadmap string showing phase progress.
func BuildRoadmap(phase Phase) string {
	phases := []Phase{
		PhaseDiscovery,
		PhaseDiscoveryRefinement,
		PhaseSpecProposal,
		PhaseSpecApproved,
		PhaseExecuting,
		PhaseCompleted,
	}

	var parts []string

	for _, p := range phases {
		if p == phase {
			parts = append(parts, fmt.Sprintf("[%s]", p))
		} else {
			parts = append(parts, p)
		}
	}

	return strings.Join(parts, " → ")
}

// =============================================================================
// Helpers
// =============================================================================

func ptrString(s string) *string { return &s }
