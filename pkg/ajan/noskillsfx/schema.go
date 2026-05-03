// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import "errors"

// Sentinel errors.
var (
	ErrInvalidTransition = errors.New("invalid phase transition")
	ErrManifestNotFound  = errors.New("manifest file not found")
)

// =============================================================================
// Phases
// =============================================================================

// Phase is the workflow lifecycle phase.
type Phase = string

const (
	PhaseUninitialized       Phase = "UNINITIALIZED"
	PhaseIdle                Phase = "IDLE"
	PhaseDiscovery           Phase = "DISCOVERY"
	PhaseDiscoveryRefinement Phase = "DISCOVERY_REFINEMENT"
	PhaseSpecProposal        Phase = "SPEC_PROPOSAL"
	PhaseSpecApproved        Phase = "SPEC_APPROVED"
	PhaseExecuting           Phase = "EXECUTING"
	PhaseBlocked             Phase = "BLOCKED"
	PhaseCompleted           Phase = "COMPLETED"
)

// CompletionReason is the reason a spec was completed.
type CompletionReason = string

const (
	CompletionDone      CompletionReason = "done"
	CompletionCancelled CompletionReason = "cancelled"
	CompletionWontfix   CompletionReason = "wontfix"
)

// DiscoveryMode controls how exhaustive the discovery interview is.
type DiscoveryMode = string

const (
	DiscoveryModeFull           DiscoveryMode = "full"
	DiscoveryModeValidate       DiscoveryMode = "validate"
	DiscoveryModeTechnicalDepth DiscoveryMode = "technical-depth"
	DiscoveryModeShipFast       DiscoveryMode = "ship-fast"
	DiscoveryModeExplore        DiscoveryMode = "explore"
)

// =============================================================================
// Discovery
// =============================================================================

// DiscoveryAnswer is the minimal (legacy) format for a question answer.
type DiscoveryAnswer struct {
	QuestionID string `json:"questionId"`
	Answer     string `json:"answer"`
}

// AttributedDiscoveryAnswer is the extended format with authorship metadata.
type AttributedDiscoveryAnswer struct {
	QuestionID    string  `json:"questionId"`
	Answer        string  `json:"answer"`
	User          string  `json:"user"`
	Email         string  `json:"email"`
	Timestamp     string  `json:"timestamp"`
	Type          string  `json:"type"` // "original" | "addition" | "revision"
	Confidence    *int    `json:"confidence,omitempty"`
	Basis         *string `json:"basis,omitempty"`
	Source        *string `json:"source,omitempty"`        // "STATED" | "INFERRED" | "CONFIRMED"
	QuestionMatch *string `json:"questionMatch,omitempty"` // "exact" | "modified" | "not-asked"
}

// ConfidenceFinding is an agent-scored finding from analysis.
type ConfidenceFinding struct {
	Finding    string `json:"finding"`
	Confidence int    `json:"confidence"` // 1–10
	Basis      string `json:"basis"`
}

// Premise is a scoped assumption the user agreed to (or revised).
type Premise struct {
	Text      string  `json:"text"`
	Agreed    bool    `json:"agreed"`
	Revision  *string `json:"revision,omitempty"`
	User      string  `json:"user"`
	Timestamp string  `json:"timestamp"`
}

// SelectedApproach records which proposed approach the user chose.
type SelectedApproach struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Summary   string `json:"summary"`
	Effort    string `json:"effort"`
	Risk      string `json:"risk"`
	User      string `json:"user"`
	Timestamp string `json:"timestamp"`
}

// PhaseTransition records an audit entry for each phase hop.
type PhaseTransition struct {
	From      Phase   `json:"from"`
	To        Phase   `json:"to"`
	User      string  `json:"user"`
	Email     string  `json:"email"`
	Timestamp string  `json:"timestamp"`
	Reason    *string `json:"reason,omitempty"`
}

// CustomAC is a user-added acceptance criterion.
type CustomAC struct {
	ID           string `json:"id"`
	Text         string `json:"text"`
	User         string `json:"user"`
	Email        string `json:"email"`
	Timestamp    string `json:"timestamp"`
	AddedInPhase Phase  `json:"addedInPhase"`
}

// SpecNote is a free-form note attached to a spec.
type SpecNote struct {
	ID        string `json:"id"`
	Text      string `json:"text"`
	User      string `json:"user"`
	Email     string `json:"email"`
	Timestamp string `json:"timestamp"`
	Phase     Phase  `json:"phase"`
}

// FollowUp is a sub-question spawned during discovery.
type FollowUp struct {
	ID               string  `json:"id"`
	ParentQuestionID string  `json:"parentQuestionId"`
	Question         string  `json:"question"`
	Answer           *string `json:"answer"`
	Status           string  `json:"status"` // "pending" | "answered" | "skipped"
	CreatedBy        string  `json:"createdBy"`
	CreatedAt        string  `json:"createdAt"`
	AnsweredAt       *string `json:"answeredAt,omitempty"`
}

// Delegation routes a question to another contributor.
type Delegation struct {
	QuestionID  string  `json:"questionId"`
	DelegatedTo string  `json:"delegatedTo"`
	DelegatedBy string  `json:"delegatedBy"`
	Status      string  `json:"status"` // "pending" | "answered"
	DelegatedAt string  `json:"delegatedAt"`
	Answer      *string `json:"answer,omitempty"`
	AnsweredBy  *string `json:"answeredBy,omitempty"`
	AnsweredAt  *string `json:"answeredAt,omitempty"`
}

// CompletenessScoreDimension is one axis in a completeness score.
type CompletenessScoreDimension struct {
	ID    string `json:"id"`
	Score int    `json:"score"` // 1–10
	Notes string `json:"notes"`
}

// CompletenessScore is the overall completeness assessment.
type CompletenessScore struct {
	Overall    int                          `json:"overall"` // 1–10
	Dimensions []CompletenessScoreDimension `json:"dimensions"`
	Gaps       []string                     `json:"gaps"`
	AssessedAt string                       `json:"assessedAt"`
}

// ReviewPosture controls how the refinement phase expands/contracts scope.
type ReviewPosture = string

const (
	ReviewPostureSelectiveExpansion ReviewPosture = "selective-expansion"
	ReviewPostureHoldScope          ReviewPosture = "hold-scope"
	ReviewPostureScopeExpansion     ReviewPosture = "scope-expansion"
	ReviewPostureScopeReduction     ReviewPosture = "scope-reduction"
)

// CeoReviewReadiness is the CEO-eye readiness score for the spec.
type CeoReviewReadiness struct {
	Overall    int                          `json:"overall"`
	Dimensions []CompletenessScoreDimension `json:"dimensions"`
	Verdict    string                       `json:"verdict"` // "approved" | "needs-work"
}

// CeoReview holds both the readiness score and an optional reflection.
type CeoReview struct {
	ReadinessScore CeoReviewReadiness `json:"readinessScore"`
	Reflection     *string            `json:"reflection,omitempty"`
}

// RefinementSubState holds the sub-state for DISCOVERY_REFINEMENT.
type RefinementSubState struct {
	InitialCompletenessScore *CompletenessScore `json:"initialCompletenessScore,omitempty"`
	CompletenessScore        *CompletenessScore `json:"completenessScore,omitempty"`
	ReviewPosture            *ReviewPosture     `json:"reviewPosture,omitempty"`
	CeoReview                *CeoReview         `json:"ceoReview,omitempty"`
}

// DiscoveryState is the sub-state for the DISCOVERY* phases.
type DiscoveryState struct {
	Answers               []DiscoveryAnswer   `json:"answers"`
	Completed             bool                `json:"completed"`
	CurrentQuestion       int                 `json:"currentQuestion"`
	Audience              string              `json:"audience"` // "agent" | "human"
	Approved              bool                `json:"approved"`
	PlanPath              *string             `json:"planPath"`
	Mode                  *DiscoveryMode      `json:"mode,omitempty"`
	Premises              []Premise           `json:"premises,omitempty"`
	SelectedApproach      *SelectedApproach   `json:"selectedApproach,omitempty"`
	PremisesCompleted     *bool               `json:"premisesCompleted,omitempty"`
	AlternativesPresented *bool               `json:"alternativesPresented,omitempty"`
	Contributors          []string            `json:"contributors,omitempty"`
	Delegations           []Delegation        `json:"delegations,omitempty"`
	FollowUps             []FollowUp          `json:"followUps,omitempty"`
	UserContext           []string            `json:"userContext,omitempty"`
	UserContextProcessed  *bool               `json:"userContextProcessed,omitempty"`
	EntryComplete         *bool               `json:"entryComplete,omitempty"`
	BatchSubmitted        *bool               `json:"batchSubmitted,omitempty"`
	Refinement            *RefinementSubState `json:"refinement,omitempty"`
}

// =============================================================================
// Spec
// =============================================================================

// SpecSectionDefinition describes one section contributed by a concern.
type SpecSectionDefinition struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Placeholder string  `json:"placeholder"`
	Condition   *string `json:"condition"`
	Position    string  `json:"position"`
}

// ContributorEntry records a contributor's last action on a spec.
type ContributorEntry struct {
	User       string `json:"user"       yaml:"user"`
	LastAction string `json:"lastAction" yaml:"lastAction"`
	Date       string `json:"date"       yaml:"date"`
}

// ApprovalEntry records one reviewer's approval status.
type ApprovalEntry struct {
	User   string  `json:"user"             yaml:"user"`
	Status string  `json:"status"           yaml:"status"` // "approved" | "pending"
	Date   *string `json:"date,omitempty"   yaml:"date,omitempty"`
}

// PendingDecision records an open decision awaiting stakeholder input.
type PendingDecision struct {
	Section    string   `json:"section"    yaml:"section"`
	Question   string   `json:"question"   yaml:"question"`
	WaitingFor []string `json:"waitingFor" yaml:"waitingFor"`
}

// SpecMetadata holds authorship and approval records for a living spec.
type SpecMetadata struct {
	Created struct {
		Date string `json:"date" yaml:"date"`
		User string `json:"user" yaml:"user"`
	} `json:"created" yaml:"created"`
	LastModified struct {
		Date string `json:"date" yaml:"date"`
		User string `json:"user" yaml:"user"`
	} `json:"lastModified" yaml:"lastModified"`
	Contributors     []ContributorEntry `json:"contributors"     yaml:"contributors"`
	Approvals        []ApprovalEntry    `json:"approvals"        yaml:"approvals"`
	PendingDecisions []PendingDecision  `json:"pendingDecisions" yaml:"pendingDecisions"`
}

// PlaceholderStatus tracks whether a spec section has been filled.
type PlaceholderStatus struct {
	SectionID     string  `json:"sectionId"`
	SectionTitle  string  `json:"sectionTitle"`
	Status        string  `json:"status"` // "placeholder" | "filled" | "na" | "conditional-hidden"
	FilledBy      *string `json:"filledBy,omitempty"`
	FilledAt      *string `json:"filledAt,omitempty"`
	Source        *string `json:"source,omitempty"` // "STATED" | "INFERRED"
	ConcernSource *string `json:"concernSource,omitempty"`
	NaReason      *string `json:"naReason,omitempty"`
	NaBy          *string `json:"naBy,omitempty"`
	NaAt          *string `json:"naAt,omitempty"`
}

// SpecState is the sub-state tracking the living spec document.
type SpecState struct {
	Path         *string             `json:"path"`
	Status       string              `json:"status"` // "none" | "draft" | "approved"
	Metadata     SpecMetadata        `json:"metadata"`
	Placeholders []PlaceholderStatus `json:"placeholders"`
}

// EmptySpecMetadata returns a zero SpecMetadata (matches EMPTY_SPEC_METADATA).
func EmptySpecMetadata() SpecMetadata {
	return SpecMetadata{
		Contributors:     []ContributorEntry{},
		Approvals:        []ApprovalEntry{},
		PendingDecisions: []PendingDecision{},
	}
}

// =============================================================================
// Execution
// =============================================================================

// VerificationResult records the outcome of a verify command run.
type VerificationResult struct {
	Passed    bool   `json:"passed"`
	Output    string `json:"output"`
	Timestamp string `json:"timestamp"`
}

// StatusReport is a mid-execution progress snapshot.
type StatusReport struct {
	Completed []string `json:"completed"`
	Remaining []string `json:"remaining"`
	Blocked   []string `json:"blocked"`
	Iteration int      `json:"iteration"`
	Timestamp string   `json:"timestamp"`
}

// DebtItem is a skipped task tracked across iterations.
type DebtItem struct {
	ID    string `json:"id"`
	Text  string `json:"text"`
	Since int    `json:"since"`
}

// DebtState aggregates unresolved debt items.
type DebtState struct {
	Items                 []DebtItem `json:"items"`
	FromIteration         int        `json:"fromIteration"`
	UnaddressedIterations int        `json:"unaddressedIterations"`
}

// SpecTask is a parsed task from the living spec.
type SpecTask struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Completed bool   `json:"completed"`
}

// SpecClassification flags which surface areas the spec touches.
type SpecClassification struct {
	InvolvesWebUI        bool     `json:"involvesWebUI"`
	InvolvesCLI          bool     `json:"involvesCLI"`
	InvolvesPublicAPI    bool     `json:"involvesPublicAPI"`
	InvolvesMigration    bool     `json:"involvesMigration"`
	InvolvesDataHandling bool     `json:"involvesDataHandling"`
	Source               *string  `json:"source,omitempty"` // "inferred" | "confirmed" | "manual"
	InferredFrom         []string `json:"inferredFrom,omitempty"`
}

// ExecutionState is the sub-state for the EXECUTING phase.
type ExecutionState struct {
	Iteration            int                 `json:"iteration"`
	LastProgress         *string             `json:"lastProgress"`
	ModifiedFiles        []string            `json:"modifiedFiles"`
	LastVerification     *VerificationResult `json:"lastVerification"`
	AwaitingStatusReport bool                `json:"awaitingStatusReport"`
	Debt                 *DebtState          `json:"debt"`
	CompletedTasks       []string            `json:"completedTasks"`
	DebtCounter          int                 `json:"debtCounter"`
	NaItems              []string            `json:"naItems"`
	ConfidenceFindings   []ConfidenceFinding `json:"confidenceFindings,omitempty"`
	CriteriaScope        *string             `json:"criteriaScope,omitempty"` // "task" | "review-gate"
	GateConcernCursor    *int                `json:"gateConcernCursor,omitempty"`
}

// =============================================================================
// Decision & Revisit
// =============================================================================

// Decision records a binding choice made during the spec lifecycle.
type Decision struct {
	ID        string `json:"id"`
	Question  string `json:"question"`
	Choice    string `json:"choice"`
	Promoted  bool   `json:"promoted"`
	Timestamp string `json:"timestamp"`
}

// RevisitEntry records when a spec was re-opened from COMPLETED.
type RevisitEntry struct {
	From           Phase    `json:"from"`
	Reason         string   `json:"reason"`
	CompletedTasks []string `json:"completedTasks"`
	Timestamp      string   `json:"timestamp"`
}

// =============================================================================
// StateFile (.eser/.state/progresses/state.json)
// =============================================================================

// StateFile is the root state persisted to disk. Field names use camelCase
// JSON tags to match the TypeScript schema exactly (shared on-disk format).
type StateFile struct {
	Version           string              `json:"version"`
	Phase             Phase               `json:"phase"`
	Spec              *string             `json:"spec"`
	SpecDescription   *string             `json:"specDescription"`
	Branch            *string             `json:"branch"`
	Discovery         DiscoveryState      `json:"discovery"`
	SpecState         SpecState           `json:"specState"`
	Execution         ExecutionState      `json:"execution"`
	Decisions         []Decision          `json:"decisions"`
	LastCalledAt      *string             `json:"lastCalledAt"`
	Classification    *SpecClassification `json:"classification"`
	CompletionReason  *CompletionReason   `json:"completionReason"`
	CompletedAt       *string             `json:"completedAt"`
	CompletionNote    *string             `json:"completionNote"`
	ReopenedFrom      *string             `json:"reopenedFrom"`
	RevisitHistory    []RevisitEntry      `json:"revisitHistory"`
	TransitionHistory []PhaseTransition   `json:"transitionHistory,omitempty"`
	CustomACs         []CustomAC          `json:"customACs,omitempty"`
	SpecNotes         []SpecNote          `json:"specNotes,omitempty"`
}

// CreateInitialState returns a fresh IDLE state (matches createInitialState() in TS).
func CreateInitialState() StateFile {
	return StateFile{
		Version:         "0.1.0",
		Phase:           PhaseIdle,
		Spec:            nil,
		SpecDescription: nil,
		Branch:          nil,
		Discovery: DiscoveryState{
			Answers:         []DiscoveryAnswer{},
			Completed:       false,
			CurrentQuestion: 0,
			Audience:        "human",
			Approved:        false,
			PlanPath:        nil,
		},
		SpecState: SpecState{
			Path:         nil,
			Status:       "none",
			Metadata:     EmptySpecMetadata(),
			Placeholders: []PlaceholderStatus{},
		},
		Execution: ExecutionState{
			Iteration:            0,
			LastProgress:         nil,
			ModifiedFiles:        []string{},
			LastVerification:     nil,
			AwaitingStatusReport: false,
			Debt:                 nil,
			CompletedTasks:       []string{},
			DebtCounter:          0,
			NaItems:              []string{},
		},
		Decisions:        []Decision{},
		LastCalledAt:     nil,
		Classification:   nil,
		CompletionReason: nil,
		CompletedAt:      nil,
		CompletionNote:   nil,
		ReopenedFrom:     nil,
		RevisitHistory:   []RevisitEntry{},
	}
}

// =============================================================================
// Manifest (.eser/manifest.yml)
// =============================================================================

// CodingToolID is a supported coding assistant identifier.
type CodingToolID = string

const (
	CodingToolClaudeCode CodingToolID = "claude-code"
	CodingToolCursor     CodingToolID = "cursor"
	CodingToolKiro       CodingToolID = "kiro"
	CodingToolCopilot    CodingToolID = "copilot"
	CodingToolWindsurf   CodingToolID = "windsurf"
	CodingToolOpencode   CodingToolID = "opencode"
	CodingToolCodex      CodingToolID = "codex"
	CodingToolCopilotCLI CodingToolID = "copilot-cli"
)

// ProjectTraits describes the detected tech stack.
type ProjectTraits struct {
	Languages  []string `json:"languages"  yaml:"languages"`
	Frameworks []string `json:"frameworks" yaml:"frameworks"`
	CI         []string `json:"ci"         yaml:"ci"`
	TestRunner *string  `json:"testRunner" yaml:"testRunner"`
}

// NoskillsUserConfig is the per-user section in the manifest.
type NoskillsUserConfig struct {
	Name  string `json:"name"  yaml:"name"`
	Email string `json:"email" yaml:"email"`
}

// NosManifest mirrors the noskills section inside .eser/manifest.yml.
type NosManifest struct {
	Concerns                   []string            `json:"concerns"                  yaml:"concerns"`
	Tools                      []CodingToolID      `json:"tools"                     yaml:"tools"`
	Providers                  []string            `json:"providers"                 yaml:"providers"`
	Project                    ProjectTraits       `json:"project"                   yaml:"project"`
	MaxIterationsBeforeRestart int                 `json:"maxIterationsBeforeRestart" yaml:"maxIterationsBeforeRestart"`
	VerifyCommand              *string             `json:"verifyCommand"             yaml:"verifyCommand"`
	AllowGit                   bool                `json:"allowGit"                  yaml:"allowGit"`
	Command                    string              `json:"command"                   yaml:"command"`
	User                       *NoskillsUserConfig `json:"user,omitempty"            yaml:"user,omitempty"`
	DefaultReviewPosture       *ReviewPosture      `json:"defaultReviewPosture,omitempty" yaml:"defaultReviewPosture,omitempty"`
}

// =============================================================================
// Concern Definition (.eser/concerns/*.json)
// =============================================================================

// ConcernExtra is an additional discovery question added by a concern.
type ConcernExtra struct {
	QuestionID string `json:"questionId"`
	Text       string `json:"text"`
}

// ReviewDimension is a concern's review-gate evaluation axis.
type ReviewDimension struct {
	ID               string `json:"id"`
	Label            string `json:"label"`
	Prompt           string `json:"prompt"`
	EvidenceRequired bool   `json:"evidenceRequired"`
	Scope            string `json:"scope"` // "all" | "ui" | "api" | "data"
}

// ConcernLifecycle controls when and how a concern fires.
type ConcernLifecycle struct {
	Stage          *string  `json:"stage,omitempty"` // "ship" | "deploy" | "monitor" | "retro" | "document"
	OutsideVoice   *bool    `json:"outsideVoice,omitempty"`
	AppliesToKinds []string `json:"appliesToKinds,omitempty"`
}

// ConcernDefinition is a loaded .eser/concerns/*.json file.
type ConcernDefinition struct {
	ID                 string             `json:"id"`
	Name               string             `json:"name"`
	Description        string             `json:"description"`
	Extras             []ConcernExtra     `json:"extras"`
	SpecSections       []any              `json:"specSections"` // string | SpecSectionDefinition
	Reminders          []string           `json:"reminders"`
	AcceptanceCriteria []string           `json:"acceptanceCriteria"`
	ReviewDimensions   []ReviewDimension  `json:"reviewDimensions,omitempty"`
	Registries         []string           `json:"registries,omitempty"`
	DreamStatePrompt   *string            `json:"dreamStatePrompt,omitempty"`
	ConductRules       map[Phase][]string `json:"conductRules,omitempty"`
	Category           *string            `json:"category,omitempty"`
	Lifecycle          *ConcernLifecycle  `json:"lifecycle,omitempty"`
	PromptFile         *string            `json:"promptFile,omitempty"`
	SuggestsPosture    *ReviewPosture     `json:"suggestsPosture,omitempty"`
}
