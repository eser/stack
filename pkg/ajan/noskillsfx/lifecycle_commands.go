// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// The spec lifecycle commands besides `next`: spec new, spec list, status,
// approve, done and followup (commands/spec.ts, status.ts, approve.ts,
// done.ts and followup.ts). Each returns what happened as data; the CLI
// prints it, and noskills-server and the FFI bridge answer with it.

// SpecRefusal is a lifecycle command that did not run; Kind names why and
// Message is the TypeScript CLI's text for it.
type SpecRefusal struct {
	Kind    string
	Message string
	// Details are extra lines (the pending delegations, the open debt).
	Details []string
}

func (e *SpecRefusal) Error() string { return e.Message }

// Is makes errors.Is(err, ErrLifecycle) hold.
func (e *SpecRefusal) Is(target error) bool { return target == ErrLifecycle }

func refuse(kind, message string, details ...string) error {
	return &SpecRefusal{Kind: kind, Message: message, Details: details}
}

// reservedSpecNames are the words `spec <name>` reads as subcommands.
func reservedSpecNames() []string {
	return []string{
		"new", "list", "help", "next", "approve", "done", "block", "reset", "cancel", "wontfix", "reopen", "revisit",
		"split", "ac", "task", "note", "section", "review", "delegate", "followup", "plan-export", "ledger",
	}
}

// IsReservedSpecName reports whether name is a `spec` subcommand.
func IsReservedSpecName(name string) bool {
	return containsString(reservedSpecNames(), name)
}

var specNamePattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`) //nolint:gochecknoglobals // compiled once

// SpecNamePatternText is the pattern the invalid-name message shows.
const SpecNamePatternText = `/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/`

// SpecNameMaxLength is the longest spec name.
const SpecNameMaxLength = 50

// IsValidSpecName is isValidSpecName.
func IsValidSpecName(name string) bool {
	return jsLength(name) <= SpecNameMaxLength && specNamePattern.MatchString(name) && !IsReservedSpecName(name)
}

// SpecNewOptions are the parsed arguments of `spec new`.
type SpecNewOptions struct {
	// Name is the spec name; "" derives one from Description.
	Name        string
	Description string
	// PlanPath is the --from-plan file, relative to the working directory.
	PlanPath string
}

// SpecNewResult is a started spec. Interactive is set instead when neither
// a name nor a description was given: the agent is to ask for one.
type SpecNewResult struct {
	Name        string
	Branch      string
	Directory   string
	PlanPath    string
	Interactive *JSObject
}

// SpecNewInteractive is the answer to `spec new` without a description.
func SpecNewInteractive() *JSObject {
	return JSObjectOf(
		"phase", PhaseIdle,
		"action", "spec-new-interactive",
		"instruction", "Ask the user what they want to build. Accept any input — one sentence, detailed requirements, meeting notes, a Linear task. Then call spec new again with their description.",
		"prompt", "What do you want to build?",
	)
}

// uniqueSpecName is the slug of description with -2, -3 and so on when the
// name is reserved or taken.
func uniqueSpecName(root, description string) string {
	base := SlugFromDescription(description)
	candidate := base

	for suffix := 2; ; suffix++ {
		if !IsReservedSpecName(candidate) && !pathExists(filepath.Join(root, specsDir, candidate)) {
			return candidate
		}

		candidate = fmt.Sprintf("%s-%d", base, suffix)
	}
}

func pathExists(path string) bool {
	_, err := os.Stat(path)

	return err == nil
}

// SpecNew is `spec new`: a spec directory, spec.md, the per-spec state in
// DISCOVERY and a spec-created event. The global state stays as it is.
func SpecNew(ctx context.Context, e *LifecycleEnv, opts SpecNewOptions) (SpecNewResult, error) { //nolint:cyclop,funlen // the checks of specNew, in order
	root := e.Root
	manifest, _ := readManifestSection(root)
	prefix := CommandPrefixOf(manifest)

	if !IsHookInitialized(root) {
		return SpecNewResult{}, refuse("not-initialized", "noskills is not initialized.")
	}

	name := opts.Name
	if name == "" && opts.Description != "" {
		name = uniqueSpecName(root, opts.Description)
	}

	if name == "" {
		return SpecNewResult{Interactive: SpecNewInteractive()}, nil
	}

	if IsReservedSpecName(name) {
		return SpecNewResult{}, refuse("reserved", `"`+name+`" is a reserved name.`)
	}

	if !IsValidSpecName(name) {
		return SpecNewResult{}, refuse("invalid-name", "Invalid spec name: ", name)
	}

	if opts.Description == "" {
		return SpecNewResult{}, refuse("no-description", "Please provide a description: ", prefix+` spec new "Add photo upload support"`)
	}

	if opts.PlanPath != "" {
		info, err := os.Stat(filepath.Join(e.Cwd, opts.PlanPath))
		if filepath.IsAbs(opts.PlanPath) {
			info, err = os.Stat(opts.PlanPath)
		}

		switch {
		case err != nil:
			return SpecNewResult{}, refuse("plan-not-found", "Plan file not found: "+opts.PlanPath)
		case info.Size() > maxPlanSize:
			return SpecNewResult{}, refuse("plan-too-large", "Plan file too large. Maximum 50KB.")
		}
	}

	branch := "spec/" + name
	directory := specsDir + "/" + name

	if pathExists(filepath.Join(root, specsDir, name)) {
		return SpecNewResult{}, refuse("exists", `Spec "`+name+`" already exists.`,
			" Use a different --name or run `"+prefix+" reset --spec="+name+"` first.")
	}

	started, err := startSpecState(InitialState(), name, branch, opts.Description)
	if err != nil {
		return SpecNewResult{}, err
	}

	user := e.ResolveUser(ctx)
	toSave := recordTransition(started, PhaseIdle, PhaseDiscovery, user, e.nowISO())

	if opts.PlanPath != "" {
		toSave = withDiscovery(toSave, "planPath", opts.PlanPath)
	}

	if err := os.MkdirAll(filepath.Join(root, specsDir, name), 0o750); err != nil {
		return SpecNewResult{}, fmt.Errorf("create the spec directory: %w", err)
	}

	active := activeConcernsOf(root, manifest, e.Warn)
	initial := GenerateInitialSpecObject(name, active, nil, user.Name, e.nowISO())

	if err := os.WriteFile(specFilePath(root, name), []byte(initial.Content), stateFilePerm); err != nil { //nolint:gosec // G306: spec.md is not secret
		return SpecNewResult{}, fmt.Errorf("write spec.md: %w", err)
	}

	withSpec := toSave.with("specState", JSObjectOf(
		"path", directory+"/spec.md",
		"status", "draft",
		"metadata", initial.Metadata,
		"placeholders", initial.Placeholders,
	))

	if err := WriteSpecStateObject(root, name, withSpec, e.Warn); err != nil {
		return SpecNewResult{}, err
	}

	if err := appendEvent(root, JSObjectOf(
		"ts", e.nowISO(),
		"type", "spec-created",
		"spec", name,
		"user", user.Name,
		"description", opts.Description,
	)); err != nil {
		return SpecNewResult{}, fmt.Errorf("log the spec-created event: %w", err)
	}

	return SpecNewResult{Name: name, Branch: branch, Directory: directory, PlanPath: opts.PlanPath}, nil
}

// SpecList is `spec list`: every per-spec state, then every spec
// directory without one, as IDLE.
func SpecList(e *LifecycleEnv) []any {
	specs := []any{}

	entriesWithState := ListSpecStateObjects(e.Root, e.Warn)
	known := make([]string, 0, len(entriesWithState))

	for _, entry := range entriesWithState {
		known = append(known, entry.Name)
		specs = append(specs, JSObjectOf("name", entry.Name, "phase", entry.State.getOr("phase"),
			"iteration", executionOf(entry.State).getOr("iteration")))
	}

	entries, err := os.ReadDir(filepath.Join(e.Root, specsDir))
	if err != nil {
		return specs
	}

	for _, entry := range entries {
		if entry.IsDir() && !containsString(known, entry.Name()) {
			specs = append(specs, JSObjectOf("name", entry.Name(), "phase", PhaseIdle, "iteration", 0.0))
		}
	}

	return specs
}

// Status is `status` with the JSON output: the status fields, then the
// compiled instruction. A spec name that has no directory is an error.
func Status(e *LifecycleEnv, specName string) (*JSObject, error) {
	root := e.Root
	manifest, _ := readManifestSection(root)
	prefix := CommandPrefixOf(manifest)

	if !IsHookInitialized(root) {
		return nil, refuse("not-initialized", "noskills is not initialized")
	}

	state, err := ResolveState(root, specName, prefix, e.Warn)
	if err != nil {
		return nil, err
	}

	phase := phaseOf(state)
	execution := executionOf(state)
	out := NewJSObject()
	copyField(out, state, "phase")
	copyField(out, state, "spec")
	copyField(out, state, "branch")

	if phase == PhaseDiscovery || phase == PhaseDiscoveryRefinement {
		out.set("discovery", JSObjectOf("answered", jsInteger(len(discoveryOf(state).arr("answers"))), "total", jsInteger(len(questions))))
	}

	if phase == PhaseExecuting || phase == PhaseBlocked {
		status := NewJSObject()
		copyField(status, execution, "iteration")
		copyField(status, execution, "lastProgress")
		status.set("debt", jsInteger(len(execution.obj("debt").arr("items"))))

		passed := any(nil)
		if verification := execution.obj("lastVerification"); verification != nil {
			if value, ok := verification.get("passed"); ok && value != nil {
				passed = value
			}
		}

		status.set("verificationPassed", passed)
		out.set("execution", status)
	}

	concerns, tools := []any{}, []any{}
	if manifest != nil {
		if value, ok := manifest.get("concerns"); ok && value != nil {
			concerns, _ = value.([]any)
		}

		if value, ok := manifest.get("tools"); ok && value != nil {
			tools, _ = value.([]any)
		}
	}

	out.set("concerns", concerns)
	out.set("tools", tools)
	out.set("decisions", jsInteger(len(state.arr("decisions"))))

	compiled := CompileNext(&NextInput{
		State:          state,
		ActiveConcerns: activeConcernsOf(root, manifest, e.Warn),
		Rules:          ruleTexts(LoadScopedRules(root)),
		Manifest:       manifest,
		Hints:          ResolveInteractionHints(stringsOf(manifest.arr("tools"))),
		CommandPrefix:  prefix,
		Now:            e.now(),
	})

	for _, key := range compiled.Keys() {
		out.set(key, compiled.values[key])
	}

	return out, nil
}

// ApproveResult is what `approve` did: the phase it left and the one it
// reached, or Message for a phase approve does not move.
type ApproveResult struct {
	From    string
	To      string
	Message string
}

func (e *LifecycleEnv) checkSpecDirectory(state *JSObject, prefix string) error {
	spec, ok := state.strOK("spec")
	if !ok || specDirExists(e.Root, spec) {
		return nil
	}

	return refuse("no-directory", "Active spec '"+spec+"' directory not found.",
		"Run `"+prefix+" spec "+spec+" reset` to return to idle.")
}

// Approve is `approve`: DISCOVERY_REFINEMENT to SPEC_PROPOSAL through the
// completeness gate, and SPEC_PROPOSAL to SPEC_APPROVED. Pending
// delegations block both.
func Approve(ctx context.Context, e *LifecycleEnv, specName string) (ApproveResult, error) { //nolint:cyclop,funlen // the phases of approve.ts
	root := e.Root
	manifest, _ := readManifestSection(root)
	prefix := CommandPrefixOf(manifest)

	state, err := ResolveState(root, specName, prefix, e.Warn)
	if err != nil {
		return ApproveResult{}, err
	}

	if err := e.checkSpecDirectory(state, prefix); err != nil {
		return ApproveResult{}, err
	}

	phase := phaseOf(state)

	if pending := pendingDelegations(state); len(pending) > 0 && (phase == PhaseSpecProposal || phase == PhaseDiscoveryRefinement) {
		lines := make([]string, len(pending))
		for i, d := range pending {
			lines[i] = d.str("questionId") + "\x00" + d.str("delegatedTo") + "\x00" + jsSliceUnits(d.str("delegatedAt"), 10)
		}

		return ApproveResult{}, refuse("pending-delegations",
			"Cannot approve — "+jsNumberString(float64(len(pending)))+" pending delegation(s):", lines...)
	}

	user := e.ResolveUser(ctx)

	switch {
	case phase == PhaseSpecProposal:
		if value, ok := state.get("classification"); ok && value == nil {
			if _, hasSpec := state.strOK("spec"); hasSpec {
				_ = generateSpecDocument(root, state, activeConcernsOf(root, manifest, e.Warn), e.nowISO())
			}
		}

		next, err := approveSpecState(state)
		if err != nil {
			return ApproveResult{}, err
		}

		next = recordTransition(next, PhaseSpecProposal, PhaseSpecApproved, user, e.nowISO())
		if err := WriteStateAndSpec(root, next, e.Warn); err != nil {
			return ApproveResult{}, err
		}

		if spec, ok := next.strOK("spec"); ok && validSpecPathName(spec) {
			updateSpecStatus(root, spec, "approved")
			updateProgressStatus(root, spec, "approved", e.nowISO())
		}

		return ApproveResult{From: PhaseSpecProposal, To: PhaseSpecApproved}, nil
	case phase == PhaseDiscoveryRefinement:
		next, err := approveDiscoveryReviewState(state, prefix)
		if err != nil {
			return ApproveResult{}, err
		}

		next = recordTransition(next, PhaseDiscoveryRefinement, PhaseSpecProposal, user, e.nowISO())
		if err := WriteStateAndSpec(root, next, e.Warn); err != nil {
			return ApproveResult{}, err
		}

		return ApproveResult{From: PhaseDiscoveryRefinement, To: PhaseSpecProposal}, nil
	case phase == PhaseDiscovery && discoveryOf(state).isTrue("completed"):
		return ApproveResult{From: phase, To: phase, Message: "discovery-complete"}, nil
	default:
		return ApproveResult{From: phase, To: phase, Message: "Cannot approve in phase: " + phase}, nil
	}
}

// DoneResult is a completed spec.
type DoneResult struct {
	Spec       string
	Iterations any
	Decisions  int
	Promoted   int
	// OpenDebt are the debt items left, as "id: text".
	OpenDebt []string
}

// Done is `done`: EXECUTING to COMPLETED in the per-spec file, IDLE in the
// global state. note is the completion note ("" for none; the CLI has no
// way to give one).
func Done(ctx context.Context, e *LifecycleEnv, specName, note string) (DoneResult, error) { //nolint:cyclop,funlen // the checks of done.ts, in order
	root := e.Root
	manifest, _ := readManifestSection(root)
	prefix := CommandPrefixOf(manifest)

	state, err := ResolveState(root, specName, prefix, e.Warn)
	if err != nil {
		return DoneResult{}, err
	}

	if phase := phaseOf(state); phase != PhaseExecuting {
		return DoneResult{}, refuse("phase", "Cannot complete in phase: "+phase, "Only EXECUTING phase can transition to COMPLETED.")
	}

	execution := executionOf(state)
	if execution.isTrue("awaitingStatusReport") {
		return DoneResult{}, refuse("status-report", "Cannot complete: status report is pending.",
			"Submit a status report first: "+prefix+" spec "+specName+` next --answer='{"completed":[...],"remaining":[...]}'`)
	}

	var openDebt []string

	for _, item := range objectsOf(execution.obj("debt").arr("items")) {
		openDebt = append(openDebt, jsDisplay(item.getOr("id"))+": "+jsDisplay(item.getOr("text")))
	}

	if err := e.checkSpecDirectory(state, prefix); err != nil {
		return DoneResult{OpenDebt: openDebt}, err
	}

	user := e.ResolveUser(ctx)

	completed, err := completeSpecState(state, CompletionDone, note, e.nowISO())
	if err != nil {
		return DoneResult{}, err
	}

	completed = recordTransition(completed, PhaseExecuting, PhaseCompleted, user, e.nowISO())

	spec, hasSpec := completed.strOK("spec")
	if hasSpec {
		if err := WriteSpecStateObject(root, spec, completed, e.Warn); err != nil {
			return DoneResult{}, err
		}
	}

	idle, err := resetToIdleState(completed)
	if err != nil {
		return DoneResult{}, err
	}

	if err := WriteStateObject(root, idle); err != nil {
		return DoneResult{}, err
	}

	if hasSpec && validSpecPathName(spec) {
		updateSpecStatus(root, spec, "completed")
		updateProgressStatus(root, spec, "completed", e.nowISO())
	}

	eventSpec := "unknown"
	if name, ok := state.strOK("spec"); ok {
		eventSpec = name
	}

	if err := appendEvent(root, JSObjectOf("ts", e.nowISO(), "type", "phase-change", "spec", eventSpec, "user", user.Name,
		"from", PhaseExecuting, "to", PhaseCompleted)); err != nil {
		return DoneResult{}, fmt.Errorf("log the phase-change event: %w", err)
	}

	promoted := 0
	for _, d := range objectsOf(state.arr("decisions")) {
		if jsTruthy(d.getOr("promoted")) {
			promoted++
		}
	}

	return DoneResult{
		Spec:       eventSpec,
		Iterations: execution.getOr("iteration"),
		Decisions:  len(state.arr("decisions")),
		Promoted:   promoted,
		OpenDebt:   openDebt,
	}, nil
}

// FollowUpOptions are the arguments of `followup`.
type FollowUpOptions struct {
	// ID is the question id to add a follow-up to, or the follow-up's id.
	ID string
	// Question is the follow-up's text when one is added.
	Question string
	// Answer settles the follow-up; nil when there is none.
	Answer *string
	Skip   bool
}

// FollowUpResult says what `followup` did.
type FollowUpResult struct {
	// Added is the id of a new follow-up ("" when none was added).
	Added string
	// Settled is the follow-up answered or skipped.
	Settled string
	// DiscoveryComplete is set when settling it moved the spec on.
	DiscoveryComplete bool
}

// FollowUpCommand is `followup`: add a follow-up to a question, or answer or skip
// a pending one; the last one settled completes discovery.
func FollowUpCommand(ctx context.Context, e *LifecycleEnv, specName string, opts FollowUpOptions) (FollowUpResult, error) {
	root := e.Root
	manifest, _ := readManifestSection(root)
	prefix := CommandPrefixOf(manifest)

	state, err := ResolveState(root, specName, prefix, e.Warn)
	if err != nil {
		return FollowUpResult{}, err
	}

	if opts.Answer != nil || opts.Skip {
		pending := pendingFollowUps(state)
		ids := make([]string, len(pending))

		for i, f := range pending {
			ids[i] = f.str("id")
		}

		if !containsString(ids, opts.ID) {
			list := "none"
			if len(ids) > 0 {
				list = strings.Join(ids, ", ")
			}

			return FollowUpResult{}, refuse("no-follow-up", `No pending follow-up "`+opts.ID+`". Pending: `+list+".")
		}

		settled := settleFollowUp(state, opts.ID, opts.Answer, e.nowISO())

		next, err := completeDiscoveryWhenReady(settled)
		if err != nil {
			return FollowUpResult{}, err
		}

		if err := WriteStateAndSpec(root, next, e.Warn); err != nil {
			return FollowUpResult{}, err
		}

		return FollowUpResult{Settled: opts.ID, DiscoveryComplete: phaseOf(next) != phaseOf(state)}, nil
	}

	if opts.Question == "" {
		return FollowUpResult{}, refuse("no-question", "Follow-up question text is required.")
	}

	if phase := phaseOf(state); phase != PhaseDiscovery && phase != PhaseDiscoveryRefinement {
		return FollowUpResult{}, refuse("phase", "Cannot add follow-ups in phase: "+phase)
	}

	user := e.ResolveUser(ctx)
	next := addFollowUp(state, opts.ID, opts.Question, user.Name, e.nowISO())

	if err := WriteSpecStateObject(root, specName, next, e.Warn); err != nil {
		return FollowUpResult{}, err
	}

	added := opts.ID
	if followUps := followUpsFor(next, opts.ID); len(followUps) > 0 {
		added = followUps[len(followUps)-1].str("id")
	}

	return FollowUpResult{Added: added}, nil
}

// IsRefusal reports whether err is a refusal a command prints and exits 1
// for, as opposed to an error the TypeScript CLI would crash on.
func IsRefusal(err error) (*SpecRefusal, bool) {
	var refusal *SpecRefusal
	if errors.As(err, &refusal) {
		return refusal, true
	}

	return nil, false
}

// Block is `block` (commands/block.ts): EXECUTING to BLOCKED with the
// reason as the last progress note and the transition's reason. An empty
// reason is "No reason given".
func Block(ctx context.Context, e *LifecycleEnv, specName, reason string) error {
	root := e.Root
	manifest, _ := readManifestSection(root)
	prefix := CommandPrefixOf(manifest)

	if reason == "" {
		reason = "No reason given"
	}

	state, err := ResolveState(root, specName, prefix, e.Warn)
	if err != nil {
		return err
	}

	if err := e.checkSpecDirectory(state, prefix); err != nil {
		return err
	}

	if phase := phaseOf(state); phase != PhaseExecuting {
		return refuse("phase", "Cannot block in phase: "+phase)
	}

	user := e.ResolveUser(ctx)

	next, err := blockExecutionState(state, reason)
	if err != nil {
		return err
	}

	return WriteStateAndSpec(root, recordTransition(next, PhaseExecuting, PhaseBlocked, user, e.nowISO(), reason), e.Warn)
}

// InitWithoutPrompts is `init --agent` without the tool files: the .eser/
// tree, the detected project, tools and providers, the manifest and the
// initial state. An initialized project keeps its tools and concerns.
// noskills-server and the FFI bridge initialize a project with it.
func InitWithoutPrompts(e *LifecycleEnv, probe ProviderProbe, command string) (*InitPlan, error) {
	root := e.Root
	alreadyInitialized := IsHookInitialized(root)

	if err := ScaffoldEserDir(root); err != nil {
		return nil, err
	}

	plan := &InitPlan{
		Concerns:  []string{},
		Tools:     DetectCodingTools(root),
		Providers: DetectProviders(probe),
		Project:   DetectProject(root),
		Command:   command,
	}

	if tool := e.AgentToolOf(); tool != "" && !containsString(plan.Tools, tool) {
		plan.Tools = append([]string{tool}, plan.Tools...)
	}

	if alreadyInitialized {
		existing := ReadHookManifest(root)
		plan.Tools = existing.Tools
		plan.Concerns = existing.Concerns
	}

	if plan.Tools == nil {
		plan.Tools = []string{}
	}

	if plan.Concerns == nil {
		plan.Concerns = []string{}
	}

	if err := WriteInit(root, plan, alreadyInitialized); err != nil {
		return nil, err
	}

	return plan, nil
}
