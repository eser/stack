// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

// The hook handlers between reading the tool's input and writing the
// answer: port of the I/O half of commands/invoke-hook.ts. cmd/noskills
// reads stdin and the environment, calls these, and writes stdout, stderr
// and the exit code; the file reads and writes happen here, against the
// project root they are given.

const (
	// PreToolUseDeniedExitCode is the exit code of a PreToolUse denial,
	// which Claude Code, Codex, Copilot CLI and Kiro all take as one.
	PreToolUseDeniedExitCode = 2
	// maxScriptBytes is the largest shell script the git guard reads; a
	// larger one is refused.
	maxScriptBytes = 256 * 1024
	// defaultMaxIterations is the restart threshold without a manifest.
	defaultMaxIterations = 15

	gitWriteDenial = "Git write operations are not allowed. Only read commands (log, diff, status, show, blame, " +
		"branch, tag) are permitted. The user controls git, the agent controls files."
	gitBypassDenial = "Git write operations detected in subshell or pipe. Only read commands are permitted. The " +
		"user controls git, the agent controls files."
	selfWrittenScriptDenial = "Running a shell script that this same command writes is not allowed while git is " +
		"read-only: its content cannot be checked for git writes."
)

// HookEnv is what a hook handler needs besides its input.
type HookEnv struct {
	// Root is the project root (HookRoot).
	Root string
	// SessionID is NOSKILLS_SESSION, or "" when it is not set.
	SessionID string
	Now       func() time.Time
	// Warn reports a state file that exists but cannot be read.
	Warn StateWarner
	// Notice shows the user a line on stderr; the agent does not see it.
	Notice func(text string)
}

// PreToolUseKind is what the PreToolUse hook answers for one tool call.
type PreToolUseKind int

const (
	// PreToolUseNone writes nothing, so the tool call goes ahead.
	PreToolUseNone PreToolUseKind = iota
	// PreToolUseDeny refuses the call with Reason.
	PreToolUseDeny
	// PreToolUseAllowWithContext lets the call go ahead and gives the agent
	// Context.
	PreToolUseAllowWithContext
)

// PreToolUseDecision is the PreToolUse hook's answer before it is written in
// a tool's dialect.
type PreToolUseDecision struct {
	Kind    PreToolUseKind
	Reason  string
	Context string
}

func noDecision() PreToolUseDecision {
	return PreToolUseDecision{Kind: PreToolUseNone, Reason: "", Context: ""}
}

func denyDecision(reason string) PreToolUseDecision {
	return PreToolUseDecision{Kind: PreToolUseDeny, Reason: reason, Context: ""}
}

// PreToolUseAnswer is what `invoke-hook pre-tool-use` writes and the code it
// exits with, in the form the tool that ran the hook reads. A denial exits
// with code 2 and the reason on stderr, which every supported tool takes as
// a denial; stdout carries it as JSON where the tool reads one. Context
// goes out only where the tool adds it to the agent's context; Copilot
// CLI's allow would also skip the user's permission prompt, so it gets none.
func PreToolUseAnswer(decision PreToolUseDecision, dialect HookDialect) (stdout, stderr string, code int) {
	switch decision.Kind {
	case PreToolUseDeny:
		reason := "noskills: " + decision.Reason

		switch dialect {
		case DialectClaude:
			stdout = jsonStringify(JSObjectOf("hookSpecificOutput", JSObjectOf(
				"hookEventName", "PreToolUse",
				"permissionDecision", "deny",
				"permissionDecisionReason", reason,
			)))
		case DialectCopilot:
			stdout = jsonStringify(JSObjectOf("permissionDecision", "deny", "permissionDecisionReason", reason))
		case DialectKiro:
		}

		return stdout, reason + "\n", PreToolUseDeniedExitCode
	case PreToolUseAllowWithContext:
		switch dialect {
		case DialectClaude:
			return jsonStringify(JSObjectOf("hookSpecificOutput", JSObjectOf(
				"hookEventName", "PreToolUse",
				"permissionDecision", "allow",
				"additionalContext", decision.Context,
			))), "", 0
		case DialectKiro:
			return decision.Context, "", 0
		case DialectCopilot:
		}
	case PreToolUseNone:
	}

	return "", "", 0
}

// DecidePreToolUse is the PreToolUse decision for one tool call. Changes to
// the protected files are refused first and shell commands go through the
// git guard, in every phase and session mode, so a free-mode session or a
// project with no state cannot turn the guards off. A file tool call then
// goes through the phase gate.
func DecidePreToolUse(input HookInput, env *HookEnv) PreToolUseDecision {
	toolName := ToolNameOf(input)
	toolInput := ToolInputOf(input)

	if denial := CheckProtectedFiles(toolName, toolInput, env.Root); denial != "" {
		return denyDecision(denial)
	}

	call := ToolCallOf(toolName, toolInput)

	switch call.Kind {
	case ToolCallShell:
		manifest := ReadHookManifest(env.Root)
		if denial := CheckGitGuard(jsTrim(call.Command), manifest.AllowGit, env.Root); denial != "" {
			return denyDecision(denial)
		}

		return noDecision()
	case ToolCallFile:
		paths := make([]string, len(call.Changes))
		for i, change := range call.Changes {
			paths[i] = change.Path
		}

		return decideFileEdit(paths, env)
	default:
		return noDecision()
	}
}

// CheckGitGuard returns the denial for a shell command that writes git, or
// "". It classifies the command text, including quoting, env prefixes,
// subshells, pipes and stdin-fed shells, and reads the shell scripts the
// command runs; what an interpreter computes at run time is left to the git
// wrapper.
func CheckGitGuard(command string, allowGit bool, root string) string {
	if allowGit {
		return ""
	}

	// Flag values are user text: "digital" or "git strategy" is no command.
	scan := StripFlagValues(command)

	for _, invocation := range ExtractGitInvocations(scan) {
		if !IsGitAllowed(invocation) {
			return gitWriteDenial
		}
	}

	if ContainsGitWriteBypass(scan) {
		return gitBypassDenial
	}

	return checkShellScripts(scan, root)
}

// checkShellScripts checks the shell scripts a command runs: one the same
// command writes is refused, an existing one is read and scanned, and a
// missing or unreadable one is left to the shell. Scripts are checked in
// order and the first denial returns.
func checkShellScripts(command, root string) string {
	for _, target := range ShellScriptTargets(command) {
		if WritesFile(command, target) {
			return selfWrittenScriptDenial
		}

		path := target
		if !strings.HasPrefix(target, "/") {
			path = root + "/" + target
		}

		info, err := os.Stat(path)
		if err != nil {
			continue
		}

		if info.Size() > maxScriptBytes {
			return "Shell script " + target + " is too large to check for git writes."
		}

		content, err := os.ReadFile(path) //nolint:gosec // G304: a script the agent's command runs; it is only scanned
		if err != nil {
			continue
		}

		if HasGitWrite(string(content)) {
			return gitWriteDenial + " (found in " + target + ")"
		}
	}

	return ""
}

// absolutePathForms are a path as written and with symlinks resolved, so a
// link to the manifest counts as the manifest. A file that does not exist
// yet is resolved through the directory it would be created in.
func absolutePathForms(root, filePath string) []string {
	absolute := filePath
	if !filepath.IsAbs(absolute) {
		absolute = filepath.Join(root, filePath)
	}

	if abs, err := filepath.Abs(absolute); err == nil {
		absolute = abs
	}

	if resolved, err := filepath.EvalSymlinks(absolute); err == nil {
		return []string{absolute, resolved}
	}

	if dir, err := filepath.EvalSymlinks(filepath.Dir(absolute)); err == nil {
		return []string{absolute, filepath.Join(dir, filepath.Base(absolute))}
	}

	return []string{absolute}
}

// protectedChangeDenial is the denial for one file change that touches a
// protected file, or "". A change whose result is unknown (a patch, an
// append, a delete) is refused on the manifest as a whole.
func protectedChangeDenial(change FileChange, root string) string {
	if change.Path == "" {
		return ""
	}

	forms := absolutePathForms(root, change.Path)

	file := ProtectedNone

	for _, form := range forms {
		if found := ProtectedFileAt(form); found != ProtectedNone {
			file = found

			break
		}
	}

	switch {
	case file == ProtectedNone:
		return ""
	case file == ProtectedGitWrapper:
		return ProtectedFileDenial(file, ViaEdit)
	case change.Edit == nil:
		return ProtectedFileDenial(file, ViaUnknownEdit)
	}

	// Missing, or unreadable and so not writable either: the edit is judged
	// as one that creates the file.
	data, err := os.ReadFile(forms[len(forms)-1])
	current, exists := string(data), err == nil

	after, ok := ContentAfterEdit(change.Edit.Tool, change.Edit.Input, current, exists)
	if !ok || ChangesNoskillsSection(current, exists, after) {
		return ProtectedFileDenial(file, ViaEdit)
	}

	return ""
}

// CheckProtectedFiles refuses an agent's change to a file that controls the
// git guards (ProtectedFile), in every phase and session mode and whatever
// allowGit says. It returns the denial, or "" when the call may go on to the
// other checks; edits to the manifest's other sections pass.
func CheckProtectedFiles(toolName string, toolInput HookInput, root string) string {
	call := ToolCallOf(toolName, toolInput)

	switch call.Kind {
	case ToolCallShell:
		if file := BashProtectedFile(call.Command); file != ProtectedNone {
			return ProtectedFileDenial(file, ViaCommand)
		}
	case ToolCallFile:
		for _, change := range call.Changes {
			if denial := protectedChangeDenial(change, root); denial != "" {
				return denial
			}
		}
	case ToolCallOther:
	}

	return ""
}

// loadGateState is the state the phase gate reads, or nil when file edits
// are not phase-gated: a free-mode session, a spec session with no spec
// yet, or a spec whose state cannot be read. A NOSKILLS_SESSION that names
// no readable session gates like no session at all.
func loadGateState(env *HookEnv) *JSObject {
	if env.SessionID != "" {
		if session := ReadHookSession(env.Root, env.SessionID); session != nil {
			return sessionGateState(env, session)
		}
	}

	// Without a session to go by, any of the active sessions may have made
	// this call, so the most restrictive phase among them applies.
	if sessions := ListHookSessions(env.Root); len(sessions) > 0 {
		phases := make([]string, len(sessions))
		for i, session := range sessions {
			phases[i] = StringField(session, "phase")
		}

		phase := MostRestrictivePhase(phases)
		env.Notice(fmt.Sprintf("noskills: %d session(s) are active but NOSKILLS_SESSION does not name one, so "+
			"file edits follow the most restrictive phase (%s). Set NOSKILLS_SESSION for per-instance "+
			"enforcement.\n", len(sessions), phase))

		return JSObjectOf("phase", phase)
	}

	state := ReadHookState(env.Root, env.Warn)

	// When the global store names a spec, the per-spec file is the
	// authoritative copy of its phase: spec-scoped commands write there and
	// the global copy goes stale.
	if name, ok := specOf(state); ok {
		if resolved, err := ResolveHookState(env.Root, name, env.Warn); err == nil {
			return resolved
		}
	}

	return state
}

func sessionGateState(env *HookEnv, session *JSObject) *JSObject {
	if StringField(session, "mode") == "free" {
		return nil
	}

	// A spec session caches its phase; one without it loads its spec's state.
	if phase, present := session.get("phase"); !present || phase != nil {
		gate := NewJSObject()
		if present {
			gate.set("phase", phase)
		}

		return gate
	}

	spec, present := session.get("spec")

	switch name := spec.(type) {
	case string:
		resolved, err := ResolveHookState(env.Root, name, env.Warn)
		if err != nil {
			return nil
		}

		return resolved
	case nil:
		if present {
			return nil
		}

		// No spec key: resolveState(root, undefined) reads the global state.
		return ReadHookState(env.Root, env.Warn)
	default:
		return nil
	}
}

// decideFileEdit is the phase gate for a file tool call that changes paths.
// Each path goes through the gate of the spec the session works on, and the
// first refusal refuses the call. A call that names no path is gated as an
// edit of an unnamed file.
func decideFileEdit(paths []string, env *HookEnv) PreToolUseDecision {
	if len(paths) == 0 {
		paths = []string{""}
	}

	// noskills' and the tool's own configuration is not phase-gated; the
	// protected files among it were refused before.
	var gated []string

	for _, path := range paths {
		if !IsToolConfigPath(path) {
			gated = append(gated, path)
		}
	}

	if len(gated) == 0 {
		return noDecision()
	}

	manifest := ReadHookManifest(env.Root)

	state := loadGateState(env)
	if state == nil {
		return noDecision()
	}

	gate := GateStateOf(state)

	var executing []string

	for _, path := range gated {
		verdict := FileEditVerdictFor(path, gate, manifest.CommandPrefix())

		switch verdict.Kind {
		case VerdictDeny:
			return denyDecision(verdict.Reason)
		case VerdictExecute:
			executing = append(executing, path)
		case VerdictAllow:
		}
	}

	if len(executing) == 0 {
		return noDecision()
	}

	// Both go out as additionalContext, which the agent reads; a message on
	// stderr with exit code 0 would reach the user only.
	reminder := TakeExecutorReminder(env.Root, env.Now())

	var rules []string

	for _, path := range executing {
		if path == "" {
			continue
		}

		for _, rule := range FileRules(env.Root, state, path, env.Warn) {
			if !slices.Contains(rules, rule) {
				rules = append(rules, rule)
			}
		}
	}

	if context := PreToolUseContext(reminder, rules); context != "" {
		return PreToolUseDecision{Kind: PreToolUseAllowWithContext, Reason: "", Context: context}
	}

	return noDecision()
}

// StopHookInput is what the Stop hook needs besides its input.
type StopHookInput struct {
	Root    string
	Run     GitRunner
	Git     string
	IsAlive func(pid int) bool
	Now     time.Time
}

// StopHook records an iteration when the global state is EXECUTING, unless
// the Stop hook itself caused this stop or `noskills run` drives the turn
// and records it. It returns the restart notice for the user, or "".
func StopHook(ctx context.Context, input HookInput, in *StopHookInput) string {
	data, err := os.ReadFile(filepath.Join(in.Root, stateFile)) //nolint:gosec // G304: the project's own state
	if err != nil {
		return ""
	}

	state := NewJSObject()
	if parsed, err := parseJSON(string(data)); err == nil {
		if o, ok := parsed.(*JSObject); ok {
			state = o
		}
	}

	if !StopRecordsIteration(input, StringField(state, "phase")) {
		return ""
	}

	// Two writers for one turn would race on state.json, so the hook stands
	// down while `noskills run` holds the turn.
	if execution, ok := fieldObject(state, "execution"); ok && IsDriverAuthoritative(execution, in.IsAlive) {
		return ""
	}

	record, err := RecordIteration(ctx, in.Root, in.Run, in.Git, in.Now)
	if err != nil {
		return ""
	}

	RemoveExecutorReminderFlag(in.Root)

	maxIterations := float64(defaultMaxIterations)
	if manifest := ReadHookManifest(in.Root); manifest.Present {
		// A manifest without the key gives JavaScript undefined, which no
		// iteration count reaches.
		maxIterations = math.NaN()
		if manifest.HasMaxIterations {
			maxIterations = manifest.MaxIterations
		}
	}

	return RestartNotice(record.Iteration, maxIterations)
}

// PostFileWriteHook logs the files a PostToolUse file call changed.
func PostFileWriteHook(input HookInput, root string, now time.Time) {
	call := HookToolCall(input)
	if call.Kind != ToolCallFile {
		return
	}

	AppendProgressLog(root, filesChangedLog, FileWriteEntries(call, ToolNameOf(input), now))
}

// PostBashHook logs a noskills CLI call made through the shell tool.
func PostBashHook(input HookInput, root string, now time.Time) {
	command := ""
	if call := HookToolCall(input); call.Kind == ToolCallShell {
		command = call.Command
	}

	if !IsNoskillsCommand(command) {
		return
	}

	AppendProgressLog(root, noskillsCallsLog, []*JSObject{NoskillsCallEntry(command, now)})
}

// SessionStart is the SessionStart hook's output: the compiled `noskills
// next` instruction for the global state, as the JSON text the hook prints.
// Like the TypeScript hook, it writes the git wrapper first (through
// installWrapper) when allowGit is false.
func SessionStart(root string, dialect HookDialect, now time.Time, warn StateWarner, installWrapper func(commandPrefix string)) string {
	manifest, _ := readManifestSection(root)
	prefix := CommandPrefixOf(manifest)
	state := ReadHookState(root, warn)

	if !ReadHookManifest(root).AllowGit {
		installWrapper(prefix)
	}

	compiled := CompileNext(&NextInput{
		State:          state,
		ActiveConcerns: activeConcernsOf(root, manifest, warn),
		Rules:          ruleTexts(LoadScopedRules(root)),
		Manifest:       manifest,
		Hints:          ResolveInteractionHints(stringsOf(manifest.arr("tools"))),
		CommandPrefix:  prefix,
		Now:            now,
	})

	return jsonStringify(SessionStartOutput(jsonStringify(compiled), dialect))
}

// SessionStartDialect is the output shape the SessionStart hook's arguments
// ask for: `--tool=copilot-cli` gives Copilot CLI's.
func SessionStartDialect(args []string) HookDialect {
	if slices.Contains(args, "--tool=copilot-cli") {
		return DialectCopilot
	}

	return DialectClaude
}

// GitWrapperNotInstalled is the user's notice when the SessionStart hook
// could not write the git wrapper; the session goes on, guarded by the
// PreToolUse hook.
func GitWrapperNotInstalled(root string, err error) string {
	return "noskills: the git wrapper was not installed in " + WrapperBinDir(root) + ": " + err.Error() +
		". Git writes are still refused by the PreToolUse hook, but not when a program builds the git command " +
		"itself.\n"
}
