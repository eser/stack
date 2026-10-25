// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// The parts of `noskills run` (commands/run.ts) that read and write the
// project: the phase check, the start of execution, the driver claim
// (state/iteration.ts setDriver), the headless compile of one turn, the
// prompt the turn sends and the blocked log. The loop itself, and the agent
// it drives, live in the CLI: this package links no AI provider, so the
// WASM build of the bridge stays free of them.

// RunDriver is the execution.driver value `noskills run` claims a turn
// with; the Stop hook stands down while a live process holds it.
const RunDriver = "acp"

const blockedLogFile = "blocked.log"

// ErrRunPhase means the state is in a phase `noskills run` does not start
// from; the message names it.
var ErrRunPhase = errors.New("noskills run cannot start from this phase")

// RunSettings are the manifest values the loop reads.
type RunSettings struct {
	CommandPrefix string
	// AllowGit lets the agent run git writes; when false the loop puts the
	// git wrapper first on the agent's PATH.
	AllowGit bool
	// AutoCommit makes the loop commit after each turn.
	AutoCommit bool
}

// ReadRunSettings is readManifest for the loop; ok is false when the
// manifest has no noskills section ("Config not found.").
func ReadRunSettings(root string) (RunSettings, bool) {
	section, ok := readManifestSection(root)
	if !ok || section == nil {
		return RunSettings{CommandPrefix: DefaultCommandPrefix, AllowGit: false, AutoCommit: false}, false
	}

	allowGit, _ := section.get("allowGit")
	autoCommit, _ := section.get("autoCommit")

	return RunSettings{
		CommandPrefix: CommandPrefixOf(section),
		AllowGit:      allowGit == true,
		AutoCommit:    autoCommit == true,
	}, true
}

// CheckRunPhase is the loop's starting check: SPEC_APPROVED and EXECUTING
// may run, any other phase is refused with "Cannot run from phase: X".
func CheckRunPhase(state *JSObject) error {
	switch phase := phaseOf(state); phase {
	case PhaseSpecApproved, PhaseExecuting:
		return nil
	default:
		return fmt.Errorf("%w: Cannot run from phase: %s", ErrRunPhase, phase)
	}
}

// StartRunExecution is machine.startExecution for a run that starts from
// SPEC_APPROVED: the state moves to EXECUTING with a fresh execution
// record. It is written to the global state and to the spec's own state
// file, where `spec <name> next` reads it.
func StartRunExecution(e *LifecycleEnv, state *JSObject) (*JSObject, error) {
	next, err := startExecutionState(state)
	if err != nil {
		return nil, err
	}

	if err := WriteStateAndSpec(e.Root, next, e.Warn); err != nil {
		return nil, err
	}

	return next, nil
}

// ResumeBlockedRun is the interactive answer to a BLOCKED turn: BLOCKED to
// EXECUTING, with "Resolved: <resolution>" as the last progress note,
// written to the global and the spec state.
func ResumeBlockedRun(e *LifecycleEnv, state *JSObject, resolution string) (*JSObject, error) {
	unblocked, err := transitionState(state, PhaseExecuting)
	if err != nil {
		return nil, err
	}

	next := withExecution(unblocked, "lastProgress", "Resolved: "+resolution)

	if err := WriteStateAndSpec(e.Root, next, e.Warn); err != nil {
		return nil, err
	}

	return next, nil
}

// RunTurnSummary is what the loop prints about the state before a turn.
type RunTurnSummary struct {
	Phase string
	// Iteration is execution.iteration as the TypeScript CLI prints it.
	Iteration string
	// LastProgress is execution.lastProgress; HasLastProgress is false when
	// it is null.
	LastProgress    string
	HasLastProgress bool
	// VerificationFailed is execution.lastVerification.passed === false.
	VerificationFailed bool
	// HasDebt is execution.debt !== null; DebtItems counts its items.
	HasDebt   bool
	DebtItems int
	// Decisions counts state.decisions.
	Decisions int
}

// SummarizeRunTurn reads the fields the loop prints.
func SummarizeRunTurn(state *JSObject) RunTurnSummary {
	execution := executionOf(state)

	summary := RunTurnSummary{
		Phase:              phaseOf(state),
		Iteration:          jsDisplay(execution.getOr("iteration")),
		LastProgress:       "",
		HasLastProgress:    false,
		VerificationFailed: false,
		HasDebt:            false,
		DebtItems:          0,
		Decisions:          len(state.arr("decisions")),
	}

	if value, ok := execution.get("lastProgress"); !ok || value != nil {
		summary.LastProgress = jsDisplay(execution.getOr("lastProgress"))
		summary.HasLastProgress = true
	}

	if verification := execution.obj("lastVerification"); verification != nil {
		passed, _ := verification.get("passed")
		summary.VerificationFailed = passed == false
	}

	if value, ok := execution.get("debt"); !ok || value != nil {
		summary.HasDebt = true
		summary.DebtItems = len(execution.objOrEmpty("debt").arr("items"))
	}

	return summary
}

// AutoCommitMessage is the message of the loop's commit after a turn:
// "noskills: iteration N: <last progress>", "progress" when there is none.
func AutoCommitMessage(state *JSObject) string {
	execution := executionOf(state)

	progress := "progress"
	if value, ok := execution.get("lastProgress"); ok && value != nil {
		progress = jsDisplay(value)
	}

	iteration, hasIteration := execution.get("iteration")

	return "noskills: iteration " + templatePart(iteration, hasIteration) + ": " + progress
}

// BlockedReason is execution.lastProgress, or "Unknown" when it is null.
func BlockedReason(state *JSObject) string {
	if value, ok := executionOf(state).get("lastProgress"); ok && value != nil {
		return jsDisplay(value)
	}

	return "Unknown"
}

// RunHints are the interaction hints of a loop turn: those of the provider
// the loop drives (Claude Code), whatever tools the manifest lists, marked
// headless, since nobody answers a question during the turn.
func RunHints() InteractionHints {
	hints := InteractionHintsForTool(DefaultAgentProvider)
	hints.Headless = true

	return hints
}

// CompileRunTurn is the compile one loop turn runs: the state, the active
// concerns, every rule text, the manifest and the headless hints, with no
// spec document, folder rules, user or project root, as run.ts calls
// compile.
func CompileRunTurn(e *LifecycleEnv, state *JSObject) *JSObject {
	manifest, _ := readManifestSection(e.Root)

	return CompileNext(&NextInput{
		State:          state,
		ActiveConcerns: activeConcernsOf(e.Root, manifest, e.Warn),
		Rules:          ruleTexts(LoadScopedRules(e.Root)),
		Manifest:       manifest,
		Parsed:         nil,
		FolderRules:    nil,
		Idle:           nil,
		Hints:          RunHints(),
		CurrentUser:    nil,
		Tier2Count:     0,
		ProjectRoot:    "",
		CommandPrefix:  CommandPrefixOf(manifest),
		Now:            e.now(),
	})
}

// joinPart is a value as Array.prototype.join writes it: null and a
// missing value as "", anything else as String(value).
func joinPart(value any, present bool) string {
	if !present || value == nil {
		return ""
	}

	return jsDisplay(value)
}

// templatePart is a value as a template literal writes it.
func templatePart(value any, present bool) string {
	if !present {
		return "undefined"
	}

	return jsDisplay(value)
}

// BuildRunPrompt is buildAgentPrompt: the text one loop turn sends to the
// agent, built from the compiled output.
func BuildRunPrompt(output *JSObject, commandPrefix string) string { //nolint:cyclop,funlen // the sections of buildAgentPrompt, in order
	var lines []string

	meta := output.objOrEmpty("meta")

	resumeHint, hasResumeHint := meta.get("resumeHint")
	lines = append(lines, joinPart(resumeHint, hasResumeHint), "")

	spec, hasSpec := meta.get("spec")
	specIsNull := hasSpec && spec == nil

	if !specIsNull {
		lines = append(lines, "Working on spec: "+templatePart(spec, hasSpec), "")
	}

	if instruction, ok := output.get("instruction"); ok {
		lines = append(lines, joinPart(instruction, true), "")
	}

	if debt := output.obj("previousIterationDebt"); debt != nil {
		from, hasFrom := debt.get("fromIteration")
		lines = append(lines, "DEBT from iteration "+templatePart(from, hasFrom)+" (address first):")

		for _, item := range objectsOf(debt.arr("items")) {
			id, hasID := item.get("id")
			text, hasText := item.get("text")
			lines = append(lines, "- "+templatePart(id, hasID)+": "+templatePart(text, hasText))
		}

		lines = append(lines, "")
	}

	if output.has("statusReportRequired") {
		if report := output.obj("statusReport"); report != nil {
			lines = append(lines, "Report against these acceptance criteria:")

			for _, criterion := range objectsOf(report.arr("criteria")) {
				id, hasID := criterion.get("id")
				text, hasText := criterion.get("text")
				lines = append(lines, "- "+templatePart(id, hasID)+": "+templatePart(text, hasText))
			}

			lines = append(lines, "")
		}
	}

	if failed, _ := output.get("verificationFailed"); failed == true {
		verification, hasVerification := output.get("verificationOutput")
		lines = append(lines, "Test output:", joinPart(verification, hasVerification), "")
	}

	if rules := output.objOrEmpty("behavioral").arr("rules"); len(rules) > 0 {
		lines = append(lines, "Rules:")

		for _, rule := range rules {
			lines = append(lines, "- "+jsDisplay(rule))
		}

		lines = append(lines, "")
	}

	if context := output.obj("context"); context != nil {
		if reminders := context.arr("concernReminders"); len(reminders) > 0 {
			lines = append(lines, "Reminders:")

			for _, reminder := range reminders {
				lines = append(lines, "- "+jsDisplay(reminder))
			}

			lines = append(lines, "")
		}
	}

	// The commands name the spec: once one is active, `next`, `block` and
	// `done` refuse to run without it.
	specCommand := func(sub string) string {
		if specIsNull {
			return commandPrefix + " " + sub
		}

		return commandPrefix + " spec " + templatePart(spec, hasSpec) + " " + sub
	}

	lines = append(lines,
		"When done, report progress: "+specCommand(`next --answer="your progress"`),
		"If blocked, run: "+specCommand(`block "reason"`),
		"When all tasks are complete: "+specCommand("done"),
	)

	return strings.Join(lines, "\n")
}

// LogBlockedRun appends a blocked iteration to
// .eser/.state/progresses/blocked.log, creating the directory when needed.
func LogBlockedRun(root, reason string, iteration int, now time.Time) error {
	dir := filepath.Join(root, progressesDir)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("create %s: %w", dir, err)
	}

	path := filepath.Join(dir, blockedLogFile)

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, stateFilePerm) //nolint:gosec // G302,G304: a log of the project
	if err != nil {
		return fmt.Errorf("open %s: %w", path, err)
	}

	defer func() { _ = f.Close() }()

	entry := "[" + ISOTime(now) + "] iteration=" + jsNumberString(float64(iteration)) + " reason=" + reason + "\n"
	if _, err := f.WriteString(entry); err != nil {
		return fmt.Errorf("append to %s: %w", path, err)
	}

	return nil
}

// RecordRunIteration records the turn the loop just watched end, as the
// Stop hook would: only while the global state is EXECUTING, so a turn that
// blocked or finished the spec is not counted. recorded is false then. The
// recorded execution is copied to the spec's own state file too, which
// `spec <name> next` reads first: without it the agent's next report would
// write the unrecorded count back over the global state.
func RecordRunIteration(ctx context.Context, e *LifecycleEnv, spec string, run GitRunner, git string) (*IterationRecord, bool, error) {
	if phaseOf(ReadHookState(e.Root, e.Warn)) != PhaseExecuting {
		return nil, false, nil
	}

	record, err := RecordIteration(ctx, e.Root, run, git, e.now())
	if err != nil {
		return nil, false, err
	}

	if spec == "" || !validSpecPathName(spec) {
		return record, true, nil
	}

	global := ReadHookState(e.Root, e.Warn)
	own := ReadSpecStateObject(e.Root, spec, e.Warn)

	if global.str("spec") != spec || own.str("spec") != spec {
		return record, true, nil
	}

	// The whole execution, the claim included: the claim is in both files.
	synced := own.with("execution", executionOf(global))
	if err := WriteSpecStateObject(e.Root, spec, synced, e.Warn); err != nil {
		return record, true, fmt.Errorf("copy the iteration to the state of spec %q: %w", spec, err)
	}

	return record, true, nil
}

// ErrRunStateUnreadable means state.json is missing or holds no JSON
// object, so the driver claim was left as it was.
var ErrRunStateUnreadable = errors.New("state.json cannot be read")

// ClaimRunDriver records in state.json that `noskills run`, as process pid,
// records the iterations, so the in-agent Stop hook stands down. The claim
// carries the pid so a claim left by a killed loop is not believed. It goes
// into the spec's own state file too: the agent's `spec <name> next` and
// `block` write that state over state.json, and a claim kept only in
// state.json would be gone after the agent's first report.
func ClaimRunDriver(root, spec string, pid int) error {
	return setRunDriver(root, spec, pid)
}

// ReleaseRunDriver removes the claim ClaimRunDriver wrote.
func ReleaseRunDriver(root, spec string) error {
	return setRunDriver(root, spec, 0)
}

// setRunDriver is setDriver: execution.driver and execution.driverPid set
// (pid > 0) or removed in state.json and, when it names the spec, in the
// spec's state file, every other field kept in its order. A missing or
// unreadable spec state is left alone.
func setRunDriver(root, spec string, pid int) error {
	if err := setDriverIn(filepath.Join(root, stateFile), "", pid); err != nil {
		return err
	}

	if spec == "" || !validSpecPathName(spec) {
		return nil
	}

	err := setDriverIn(filepath.Join(root, specStatesDir, spec+".json"), spec, pid)
	if errors.Is(err, ErrRunStateUnreadable) {
		return nil
	}

	return err
}

// setDriverIn sets or removes the claim in one raw state file; spec, when
// set, must be the file's spec.
func setDriverIn(path, spec string, pid int) error {
	data, err := os.ReadFile(path) //nolint:gosec // G304: the project's own state
	if err != nil {
		return fmt.Errorf("%w: %w", ErrRunStateUnreadable, err)
	}

	parsed, err := parseJSON(string(data))
	if err != nil {
		return fmt.Errorf("%w: %w", ErrRunStateUnreadable, err)
	}

	state, ok := parsed.(*JSObject)
	if !ok || (spec != "" && state.str("spec") != spec) {
		return ErrRunStateUnreadable
	}

	execution := NewJSObject()
	if current, ok := fieldObject(state, "execution"); ok {
		execution = current.clone()
	}

	if pid > 0 {
		execution.set("driver", RunDriver)
		execution.set("driverPid", float64(pid))
	} else {
		execution.remove("driver")
		execution.remove("driverPid")
	}

	state.set("execution", execution)

	mode := os.FileMode(stateFilePerm)
	if info, err := os.Stat(path); err == nil {
		mode = info.Mode().Perm()
	}

	if err := writeFileAtomic(path, []byte(jsonStringifyIndent(state)+"\n"), mode); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}

	return nil
}
