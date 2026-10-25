// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/aifx"
	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// `noskills run` (commands/run.ts): the autonomous loop. Each iteration
// reads state.json, stops on COMPLETED, BLOCKED or another phase, and
// otherwise runs one agent turn in a fresh agent process through the aifx
// claude-code provider (the claude CLI over ACP, acpfx and its shim), with
// the prompt compiled from the state. The loop records the iteration
// itself when the turn returns, and claims the turn in state.json first so
// the in-agent Stop hook does not record it a second time.
//
// The agent's text and tool calls stream to stdout as they arrive. Ctrl-C
// cancels the context: the agent process is killed, the turn in flight is
// not recorded, the claim is released, PATH is put back and the command
// exits 130.

const (
	runDefaultMaxTurns      = 10
	runDefaultMaxIterations = 50
	// exitInterrupted is the shell's code for a command ended by Ctrl-C.
	exitInterrupted = 130
	// exitMaxIterations is the code when the safety valve stops the loop.
	exitMaxIterations = 2
	// gitTimeout bounds `git status` and `git add` on a working tree.
	gitTimeout = 60 * time.Second
	// gitCommitTimeout bounds a commit, which runs the project's hooks.
	gitCommitTimeout = 10 * time.Minute
	// agentOutputIndent starts each line the agent streams.
	agentOutputIndent = "    "
)

// runPorts are what the loop reaches besides env: the provider every turn
// runs, this process's id for the driver claim, the process environment
// the agent inherits, and the git commands of an auto-commit.
type runPorts struct {
	// agent creates the model of a turn; the binary uses aifx's claude-code
	// provider.
	agent aifx.ProviderFactory
	// pid is recorded with the driver claim.
	pid int
	// setEnv sets a variable of this process, which the agent process
	// inherits; nil unsets it.
	setEnv func(key string, value *string)
	// runCommand runs a program with no stdin and returns its stdout and
	// stderr; err is set when it cannot start or exits non-zero.
	runCommand func(ctx context.Context, name string, args []string, dir string, environ []string) (stdout, stderr string, err error)
}

// systemRunPorts are the ports of the real process.
func systemRunPorts() *runPorts {
	return &runPorts{
		agent: aifx.NewClaudeCodeModelFactory(),
		pid:   os.Getpid(),
		setEnv: func(key string, value *string) {
			if value == nil {
				_ = os.Unsetenv(key)

				return
			}

			_ = os.Setenv(key, *value)
		},
		runCommand: runCommandBinary,
	}
}

// errCommandFailed is a program that exited non-zero.
var errCommandFailed = errors.New("exited with an error")

func runCommandBinary(ctx context.Context, name string, args []string, dir string, environ []string) (string, string, error) {
	cmd := exec.CommandContext(ctx, name, args...) //nolint:gosec // G204: the real git binary with the loop's own arguments
	cmd.Dir = dir
	cmd.Env = environ

	var stdout, stderr bytes.Buffer

	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return stdout.String(), stderr.String(), fmt.Errorf("%s %s %w (code %d)", name, args[0], errCommandFailed, exitErr.ExitCode())
	}

	if err != nil {
		return stdout.String(), stderr.String(), fmt.Errorf("run %s: %w", name, err)
	}

	return stdout.String(), stderr.String(), nil
}

// turnOutcome is what the loop does after an iteration.
type turnOutcome struct {
	stop bool
	code int
}

func nextTurn() turnOutcome         { return turnOutcome{stop: false, code: clifx.ExitOK} }
func stopWith(code int) turnOutcome { return turnOutcome{stop: true, code: code} }

// agentLoop is one `noskills run`.
type agentLoop struct {
	l     *lifecycleRun
	e     *env
	ports *runPorts
	life  *noskillsfx.LifecycleEnv

	root string
	// spec is the spec the loop started on, "" when the state names none.
	spec     string
	settings noskillsfx.RunSettings

	unattended    bool
	maxTurns      int
	maxIterations int

	// wrapper is the git wrapper on the agent's PATH, nil while allowGit is
	// true or when it could not be installed.
	wrapper  *noskillsfx.InstalledGitWrapper
	prompter *clifx.Prompter
}

func runUsage(w io.Writer, prefix string) {
	writeln(w, "Usage: "+prefix+" run [--spec=<name>] [--unattended] [--max-iterations=N] [--max-turns=N]")
	writeln(w, "")
	writeln(w, dim("  Runs the agent turn after turn while the spec is EXECUTING (a SPEC_APPROVED spec starts first)."))
	writeln(w, dim("  --unattended      log a BLOCKED spec to blocked.log and stop instead of asking for a resolution"))
	writeln(w, dim("  --max-iterations  stop after N iterations (default 50, exit code 2)"))
	writeln(w, dim("  --max-turns       turns the agent may take in one iteration (default 10)"))
}

// runAgentLoop answers `noskills run <args>` and returns the exit code.
func runAgentLoop(ctx context.Context, e *env, args []string) int { //nolint:cyclop,funlen // the checks of run.ts main, in order
	l := &lifecycleRun{e: e, args: append([]string{"run"}, args...), warned: map[string]bool{}} //nolint:exhaustruct
	root := l.projectRoot()
	prefix := l.prefixOf(root)
	out := e.stdout

	if containsArg(args, "--help") || containsArg(args, "-h") {
		runUsage(out, prefix)

		return clifx.ExitOK
	}

	ports := e.agent
	if ports == nil {
		ports = systemRunPorts()
	}

	loop := &agentLoop{
		l: l, e: e, ports: ports, life: l.lifecycleEnv(root), root: root,
		settings:      noskillsfx.RunSettings{CommandPrefix: prefix, AllowGit: false, AutoCommit: false},
		unattended:    containsArg(args, "--unattended"),
		maxTurns:      positiveFlag(args, "--max-turns", runDefaultMaxTurns),
		maxIterations: positiveFlag(args, "--max-iterations", runDefaultMaxIterations),
		wrapper:       nil,
		prompter:      &clifx.Prompter{In: e.stdin, Out: out, Env: e.environ(), Clock: nil, Accessible: true}, //nolint:exhaustruct
	}

	if !noskillsfx.IsHookInitialized(root) {
		writeln(out, red("noskills not initialized. Run: "+prefix+" init"))

		return clifx.ExitFailure
	}

	spec, _ := specFlag(args)

	state, err := noskillsfx.ResolveState(root, spec, prefix, l.warn)
	if err != nil {
		// The TypeScript CLI ends with an uncaught error here.
		_, _ = io.WriteString(e.stderr, "noskills: "+err.Error()+"\n")

		return clifx.ExitFailure
	}

	if err := noskillsfx.CheckRunPhase(state); err != nil {
		writeln(out, red("Cannot run from phase: "+noskillsfx.StringField(state, "phase")))
		writeln(out, dim("Must be in SPEC_APPROVED or EXECUTING to start."))

		return clifx.ExitFailure
	}

	if noskillsfx.StringField(state, "phase") == noskillsfx.PhaseSpecApproved {
		writeln(out, dim("Starting execution from approved spec..."))

		if _, err := noskillsfx.StartRunExecution(loop.life, state); err != nil {
			_, _ = io.WriteString(e.stderr, "noskills: "+err.Error()+"\n")

			return clifx.ExitFailure
		}
	}

	settings, ok := noskillsfx.ReadRunSettings(root)
	if !ok {
		writeln(out, red("Config not found."))

		return clifx.ExitFailure
	}

	loop.settings = settings
	loop.spec = noskillsfx.StringField(state, "spec")

	mode := "interactive"
	if loop.unattended {
		mode = "unattended"
	}

	writeln(out, bold(settings.CommandPrefix+" run"))
	writeln(out, dim("Mode: "+mode+", max-turns: "+strconv.Itoa(loop.maxTurns)+", max-iterations: "+strconv.Itoa(loop.maxIterations)))
	writeln(out, "")

	return loop.run(ctx)
}

// run claims the turn, runs the iterations and releases everything it
// took, also when the context is cancelled.
func (r *agentLoop) run(ctx context.Context) int {
	restorePath := r.guardAgentGit(ctx)

	if err := noskillsfx.ClaimRunDriver(r.root, r.spec, r.ports.pid); err != nil && !errors.Is(err, noskillsfx.ErrRunStateUnreadable) {
		_, _ = io.WriteString(r.e.stderr, "noskills: could not claim the turn in state.json: "+err.Error()+"\n")
	}

	defer func() {
		restorePath()

		// A claim left behind would silence the Stop hook for every later
		// session for as long as this pid lives, so it goes on every way out.
		if err := noskillsfx.ReleaseRunDriver(r.root, r.spec); err != nil && !errors.Is(err, noskillsfx.ErrRunStateUnreadable) {
			_, _ = io.WriteString(r.e.stderr, "noskills: could not release the turn in state.json: "+err.Error()+"\n")
		}
	}()

	for iteration := 1; iteration <= r.maxIterations; iteration++ {
		if ctx.Err() != nil {
			return r.interrupted()
		}

		outcome := r.turn(ctx, iteration)
		if outcome.stop {
			return outcome.code
		}
	}

	writeln(r.e.stdout, "")
	writeln(r.e.stdout, yellow("⚠"), " Max iterations ("+strconv.Itoa(r.maxIterations)+") reached. Stopping.")

	return exitMaxIterations
}

func (r *agentLoop) interrupted() int {
	writeln(r.e.stdout, "")
	writeln(r.e.stdout, yellow("⚠"), " Interrupted. The turn in flight was cancelled and not recorded.")

	return exitInterrupted
}

// turn runs one iteration: it reads the state, handles the exits, runs one
// agent turn and records it.
func (r *agentLoop) turn(ctx context.Context, iteration int) turnOutcome { //nolint:cyclop,funlen // the steps of runTurn, in order
	out := r.e.stdout
	state := r.turnState()
	summary := noskillsfx.SummarizeRunTurn(state)

	switch summary.Phase {
	case noskillsfx.PhaseCompleted:
		writeln(out, "")
		writeln(out, green("✔"), " Spec completed!")
		writeln(out, "  Iterations: "+summary.Iteration)
		writeln(out, "  Decisions:  "+strconv.Itoa(summary.Decisions))

		return stopWith(clifx.ExitOK)
	case noskillsfx.PhaseBlocked:
		return r.blocked(ctx, state, iteration)
	case noskillsfx.PhaseExecuting:
	default:
		writeln(out, red("Unexpected phase: "+summary.Phase+". Stopping."))

		return stopWith(clifx.ExitFailure)
	}

	prompt := noskillsfx.BuildRunPrompt(noskillsfx.CompileRunTurn(r.life, state), r.settings.CommandPrefix)

	writeln(out, cyan("── Iteration "+strconv.Itoa(iteration)),
		dim(" (execution: "+summary.Iteration+", debt: "+strconv.Itoa(summary.DebtItems)+")"))

	if summary.HasLastProgress {
		writeln(out, dim("  Last: "+summary.LastProgress))
	}

	if summary.VerificationFailed {
		writeln(out, red("  Verification failed — agent will fix"))
	}

	if summary.HasDebt {
		writeln(out, yellow("  Debt: "+strconv.Itoa(summary.DebtItems)+" items"))
	}

	writeln(out, dim("  Spawning agent..."))

	stopReason, err := r.agentTurn(ctx, prompt)

	switch {
	case ctx.Err() != nil:
		return stopWith(r.interrupted())
	case errors.Is(err, errAgentStart):
		writeln(out, red("  Failed to run the agent: "+err.Error()), dim(" Is the claude CLI installed?"))

		return stopWith(clifx.ExitFailure)
	case err != nil:
		writeln(out, red("  Agent turn failed: "+err.Error()))

		return stopWith(clifx.ExitFailure)
	}

	// Recorded here, from the turn just watched to its end, rather than by
	// the in-agent Stop hook: the claim told the hook to stand down, since
	// two writers of state.json for one turn lose updates.
	git := "git"
	if r.wrapper != nil {
		git = r.wrapper.RealGit
	}

	record, recorded, err := noskillsfx.RecordRunIteration(ctx, r.life, r.spec, r.e.runGit, git)

	switch {
	case record == nil && err != nil:
		writeln(out, red("  Could not record the iteration (state unreadable)."))

		return stopWith(clifx.ExitFailure)
	case err != nil:
		_, _ = io.WriteString(r.e.stderr, "noskills: "+err.Error()+"\n")
	}

	if recorded {
		stat := record.GitStat
		if stat == "" {
			stat = "no file changes"
		}

		writeln(out, dim("  Agent finished ("+string(stopReason)+"). Iteration "+noskillsfx.DisplayValue(record.Iteration)+": "+stat))
	} else {
		writeln(out, dim("  Agent finished ("+string(stopReason)+"). The spec left EXECUTING, so the turn is not recorded as an iteration."))
	}

	// A turn that did not finish normally is worth showing: the loop would
	// otherwise prompt into the same wall again.
	if stopReason != aifx.StopReasonEndTurn {
		writeln(out, yellow("  Turn ended early: "+string(stopReason)))
	}

	if r.settings.AutoCommit {
		r.commitTurn(ctx)
	}

	return nextTurn()
}

// turnState is the global state.json the turn starts from. `spec <name>
// done` leaves the global state IDLE and the spec's own state COMPLETED, so
// an IDLE global state reads the spec's state when that one is COMPLETED.
func (r *agentLoop) turnState() *noskillsfx.JSObject {
	state := noskillsfx.ReadHookState(r.root, r.l.warn)

	if r.spec == "" || noskillsfx.StringField(state, "phase") != noskillsfx.PhaseIdle {
		return state
	}

	if own := noskillsfx.ReadSpecStateObject(r.root, r.spec, r.l.warn); noskillsfx.StringField(own, "phase") == noskillsfx.PhaseCompleted {
		return own
	}

	return state
}

// blocked handles a BLOCKED state: unattended it logs and stops, otherwise
// it asks for a resolution and resumes execution with it.
func (r *agentLoop) blocked(ctx context.Context, state *noskillsfx.JSObject, iteration int) turnOutcome {
	out := r.e.stdout
	reason := noskillsfx.BlockedReason(state)

	writeln(out, "")
	writeln(out, yellow("⚠"), " Execution blocked: ", dim(reason))

	if r.unattended {
		// Best effort, as in the TypeScript CLI: the user resolves it later.
		_ = noskillsfx.LogBlockedRun(r.root, reason, iteration, r.e.now())

		writeln(out, dim("Logged to .eser/.state/progresses/blocked.log. Resolve and re-run."))

		return stopWith(clifx.ExitFailure)
	}

	resolution, err := r.prompter.Text(ctx, &clifx.TextOptions{ //nolint:exhaustruct
		Title: "Enter resolution (or leave empty to stop):",
	})
	if ctx.Err() != nil {
		return stopWith(r.interrupted())
	}

	if err != nil || resolution == "" {
		writeln(out, dim("Stopped by user."))

		return stopWith(clifx.ExitOK)
	}

	if _, err := noskillsfx.ResumeBlockedRun(r.life, state, resolution); err != nil {
		_, _ = io.WriteString(r.e.stderr, "noskills: "+err.Error()+"\n")

		return stopWith(clifx.ExitFailure)
	}

	return nextTurn()
}

// errAgentStart is a turn whose model could not be created.
var errAgentStart = errors.New("the agent could not be started")

// errNoResult is a stream that closed without a stop reason.
var errNoResult = errors.New("the agent stream ended without a result")

// agentTurn runs one turn on a fresh model and streams what the agent says
// to stdout. The prompt goes as a message, never as argv: it carries the
// whole verification output of a failed iteration.
func (r *agentLoop) agentTurn(ctx context.Context, prompt string) (aifx.StopReason, error) {
	model, err := r.ports.agent.CreateModel(ctx, &aifx.ConfigTarget{ //nolint:exhaustruct
		Provider: noskillsfx.DefaultAgentProvider,
		Model:    noskillsfx.DefaultAgentModel,
		// cwd keeps the agent rooted at the project, wherever the loop was
		// started from.
		Properties: map[string]any{"maxTurns": r.maxTurns, "cwd": r.root},
	})
	if err != nil {
		return "", fmt.Errorf("%w: %w", errAgentStart, err)
	}

	// Closed with a context of its own: the turn's may be cancelled.
	defer func() { _ = model.Close(context.WithoutCancel(ctx)) }()

	iter, err := model.StreamText(ctx, &aifx.StreamTextOptions{ //nolint:exhaustruct
		Messages: []aifx.Message{aifx.NewTextMessage(aifx.RoleUser, prompt)},
	})
	if err != nil {
		return "", fmt.Errorf("stream the turn: %w", err)
	}

	defer func() { _ = iter.Close() }()

	printer := &agentPrinter{w: r.e.stdout, lineStart: true}

	var stopReason aifx.StopReason

	for iter.Next() {
		event := iter.Current()

		switch event.Type { //nolint:exhaustive // thinking and usage are not shown
		case aifx.StreamEventContentDelta:
			printer.text(event.TextDelta)
		case aifx.StreamEventToolCallDelta:
			if event.ToolCall != nil {
				printer.tool(event.ToolCall.Name)
			}
		case aifx.StreamEventMessageDone:
			stopReason = event.StopReason
		}
	}

	printer.finish()

	if ctx.Err() != nil {
		return "", fmt.Errorf("the turn was cancelled: %w", context.Cause(ctx))
	}

	if err := iter.Err(); err != nil {
		return "", err //nolint:wrapcheck // the provider's message is what the user reads
	}

	if stopReason == "" {
		return "", errNoResult
	}

	return stopReason, nil
}

// commitTurn is the loop's commit after a turn, when autoCommit is set: the
// CLI commits, never the agent. A failure is shown and the loop goes on.
func (r *agentLoop) commitTurn(ctx context.Context) {
	message := noskillsfx.AutoCommitMessage(noskillsfx.ReadHookState(r.root, r.l.warn))

	committed, err := r.autoCommit(ctx, message)
	if err != nil {
		writeln(r.e.stdout, yellow("  Auto-commit failed, the loop continues: "+err.Error()))

		return
	}

	if committed {
		writeln(r.e.stdout, dim("  Auto-committed."))
	}
}

// autoCommit commits every change of the project. With the wrapper on PATH
// it runs the real git with the wrapper directory taken off PATH, so
// neither the commit nor the hooks it runs are refused by the agent's
// guard. It returns false when there was nothing to commit.
func (r *agentLoop) autoCommit(ctx context.Context, message string) (bool, error) {
	git := "git"
	environ := r.e.environ()

	if r.wrapper != nil {
		git = r.wrapper.RealGit
		environ = withoutPathDir(environ, r.wrapper.BinDir)
	}

	runGit := func(timeout time.Duration, args ...string) (string, error) {
		gitCtx, cancel := context.WithTimeout(ctx, timeout)
		defer cancel()

		stdout, stderr, err := r.ports.runCommand(gitCtx, git, args, r.root, environ)
		if err != nil {
			if detail := strings.TrimSpace(stderr); detail != "" {
				return "", fmt.Errorf("%w: %s", err, detail)
			}

			return "", err
		}

		return stdout, nil
	}

	// --porcelain lists untracked files too, so a turn that only adds files
	// is committed.
	status, err := runGit(gitTimeout, "status", "--porcelain")
	if err != nil {
		return false, err
	}

	if strings.TrimSpace(status) == "" {
		return false, nil
	}

	if _, err := runGit(gitTimeout, "add", "-A"); err != nil {
		return false, err
	}

	if _, err := runGit(gitCommitTimeout, "commit", "-m", message); err != nil {
		return false, err
	}

	return true, nil
}

// withoutPathDir is environ with dir taken off PATH.
func withoutPathDir(environ []string, dir string) []string {
	out := make([]string, 0, len(environ))

	for _, entry := range environ {
		if value, found := strings.CutPrefix(entry, "PATH="); found {
			entry = "PATH=" + noskillsfx.RemoveFromPath(value, dir)
		}

		out = append(out, entry)
	}

	return out
}

// guardAgentGit puts the git wrapper first on this process's PATH while
// allowGit is false, so every agent process the turns start inherits it,
// and returns what puts PATH back. A wrapper that cannot be installed is
// reported and the loop runs without it: the PreToolUse hook still refuses
// the git writes it sees in a command.
func (r *agentLoop) guardAgentGit(ctx context.Context) func() {
	none := func() {}

	if r.settings.AllowGit {
		return none
	}

	previous, hadPath := r.e.lookupEnv("PATH")

	wrapper, err := noskillsfx.InstallGitWrapper(ctx, &noskillsfx.InstallGitWrapperOptions{
		Root:                r.root,
		CommandPrefix:       r.settings.CommandPrefix,
		PathValue:           previous,
		GOOS:                r.e.goos,
		Run:                 r.e.runGit,
		CheckTimeoutSeconds: 0,
	})
	if err != nil {
		writeln(r.e.stdout, yellow("Git wrapper not installed in "+noskillsfx.WrapperBinDir(r.root)+": "+err.Error()))

		return none
	}

	if wrapper == nil {
		return none
	}

	r.wrapper = wrapper
	guarded := noskillsfx.PrependToPath(previous, wrapper.BinDir)
	r.ports.setEnv("PATH", &guarded)

	return func() {
		if hadPath {
			r.ports.setEnv("PATH", &previous)
		} else {
			r.ports.setEnv("PATH", nil)
		}
	}
}

// positiveFlag is parseFlag: the first --flag=N whose value parseInt reads
// as a number above zero, or the default.
func positiveFlag(args []string, flag string, fallback int) int {
	for _, arg := range args {
		value, found := strings.CutPrefix(arg, flag+"=")
		if !found {
			continue
		}

		if n, ok := parseLeadingInt(value); ok && n > 0 {
			return n
		}
	}

	return fallback
}

// maxFlagDigits keeps a parsed flag inside an int.
const maxFlagDigits = 15

// parseLeadingInt is parseInt(value, 10): leading whitespace, a sign and
// the digits up to the first other character.
func parseLeadingInt(value string) (int, bool) {
	text := strings.TrimLeft(value, " \t\n\r\v\f")
	sign := 1

	switch {
	case strings.HasPrefix(text, "-"):
		sign, text = -1, text[1:]
	case strings.HasPrefix(text, "+"):
		text = text[1:]
	}

	end := 0
	for end < len(text) && end < maxFlagDigits && text[end] >= '0' && text[end] <= '9' {
		end++
	}

	if end == 0 {
		return 0, false
	}

	n, err := strconv.Atoi(text[:end])
	if err != nil {
		return 0, false
	}

	return sign * n, true
}

// agentPrinter writes the agent's stream indented under the iteration. The
// model's text is untrusted, so control characters other than newline and
// tab are dropped before they reach the terminal.
type agentPrinter struct {
	w         io.Writer
	lineStart bool
}

func (p *agentPrinter) text(delta string) {
	var b strings.Builder

	for _, r := range delta {
		if isUnsafeTerminalRune(r) {
			continue
		}

		if p.lineStart && r != '\n' {
			b.WriteString(agentOutputIndent)

			p.lineStart = false
		}

		b.WriteRune(r)

		if r == '\n' {
			p.lineStart = true
		}
	}

	_, _ = io.WriteString(p.w, b.String())
}

func (p *agentPrinter) tool(name string) {
	if !p.lineStart {
		_, _ = io.WriteString(p.w, "\n")
	}

	var clean strings.Builder

	for _, r := range name {
		if !isUnsafeTerminalRune(r) && r != '\n' && r != '\t' {
			clean.WriteRune(r)
		}
	}

	writeln(p.w, dim(agentOutputIndent+"▸ "+clean.String()))

	p.lineStart = true
}

// finish ends the agent's last line.
func (p *agentPrinter) finish() {
	if !p.lineStart {
		_, _ = io.WriteString(p.w, "\n")

		p.lineStart = true
	}
}

// isUnsafeTerminalRune reports the C0 and C1 control characters (escape
// sequences among them) except newline and tab.
func isUnsafeTerminalRune(r rune) bool {
	if r == '\n' || r == '\t' {
		return false
	}

	return r < 0x20 || (r >= 0x7f && r <= 0x9f)
}
