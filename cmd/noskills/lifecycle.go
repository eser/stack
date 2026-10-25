// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os/exec"
	"strings"
	"sync"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// The spec lifecycle commands (TASK-258): init, spec new, spec list,
// spec <name> [next | approve | done | followup], next, status, approve and
// done. noskillsfx runs them; this file parses the arguments as the
// TypeScript commands do and prints their output (-o json, markdown or
// text). The spec state commands of TASK-258.1 are in spec_states.go.

// lifecycleCommands are the first words this file and spec_states.go
// answer.
func lifecycleCommands() []string {
	return append([]string{"init", "spec", "next", "status", "approve", "done"}, specStateTopLevel()...)
}

type lifecycleRun struct {
	e    *env
	args []string

	mu     sync.Mutex
	warned map[string]bool
}

func (l *lifecycleRun) warn(path string, err error) {
	l.mu.Lock()
	seen := l.warned[path]
	l.warned[path] = true
	l.mu.Unlock()

	if !seen {
		_, _ = io.WriteString(l.e.stderr, noskillsfx.CorruptStateWarning(path, err)+"\n")
	}
}

// projectRoot is resolveProjectRoot: NOSKILLS_PROJECT_ROOT when it holds
// .eser/, the nearest directory above the working one that does, the
// variable's value, or the working directory.
func (l *lifecycleRun) projectRoot() string {
	envRoot, set := l.e.lookupEnv("NOSKILLS_PROJECT_ROOT")
	if set && noskillsfx.FindProjectRoot(envRoot) == envRoot && envRoot != "" {
		return envRoot
	}

	if found := noskillsfx.FindProjectRoot(l.e.cwd); found != "" {
		return found
	}

	if set {
		return envRoot
	}

	return l.e.cwd
}

func (l *lifecycleRun) lifecycleEnv(root string) *noskillsfx.LifecycleEnv {
	return &noskillsfx.LifecycleEnv{
		Root:      root,
		Cwd:       l.e.cwd,
		LookupEnv: l.e.lookupEnv,
		Now:       l.e.now,
		RunGit:    l.e.runGit,
		RunShell:  l.e.runShell,
		Warn:      l.warn,
		Notice:    func(text string) { _, _ = io.WriteString(l.e.stderr, text+"\n") },
	}
}

// runLifecycle answers a lifecycle command and returns the exit code.
func runLifecycle(ctx context.Context, e *env, args []string) int {
	l := &lifecycleRun{e: e, args: args, mu: sync.Mutex{}, warned: map[string]bool{}}

	if err := l.migrateLegacyLayout(); err != nil {
		_, _ = io.WriteString(e.stderr, "noskills: "+err.Error()+"\n")

		return clifx.ExitFailure
	}

	code, err := l.dispatch(ctx)

	switch {
	case errors.Is(err, errForward), errors.Is(err, noskillsfx.ErrNeedsTypeScript):
		return forward(ctx, e, args)
	case err != nil:
		// The TypeScript CLI ends with an uncaught error here: the message
		// goes to stderr and the exit code is 1.
		_, _ = io.WriteString(e.stderr, "noskills: "+err.Error()+"\n")

		return clifx.ExitFailure
	}

	return code
}

var errForward = errors.New("the TypeScript CLI runs this form of the command")

// migrateLegacyLayout moves a legacy .eser/ layout into .eser/.state/
// before the command reads a state file, as readState does, and says so on
// stderr. The commands that read no state file (free, validate, spec list,
// spec help) leave it alone, and init moves it while it scaffolds .eser/.
func (l *lifecycleRun) migrateLegacyLayout() error {
	if containsArg([]string{"init", "free", "validate"}, l.args[0]) {
		return nil
	}

	if l.args[0] == "spec" && (len(l.args) == 1 || containsArg([]string{"list", "help", "--help", "-h"}, l.args[1])) {
		return nil
	}

	_, err := noskillsfx.MigrateLegacyLayout(l.projectRoot(), func(text string) { _, _ = io.WriteString(l.e.stderr, text+"\n") })

	return err //nolint:wrapcheck // the message is the TypeScript one
}

func (l *lifecycleRun) dispatch(ctx context.Context) (int, error) {
	rest := l.args[1:]

	if code, handled, err := l.topLevelState(ctx); handled {
		return code, err
	}

	switch l.args[0] {
	case "init":
		return l.initCommand(ctx, rest)
	case "next":
		return l.next(ctx, rest)
	case "status":
		return l.status(rest)
	case "approve":
		return l.approve(ctx, rest)
	case "done":
		return l.done(ctx, rest)
	default:
		return l.spec(ctx, rest)
	}
}

// outputFormat is parseOutputFormat: -o/--output, json when absent.
func outputFormat(args []string) string {
	for i, arg := range args {
		if arg != "-o" && !strings.HasPrefix(arg, "--output") {
			continue
		}

		if _, value, found := strings.Cut(arg, "="); found {
			return normalizeFormat(value)
		}

		if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
			return normalizeFormat(args[i+1])
		}
	}

	return "json"
}

func normalizeFormat(raw string) string {
	switch strings.ToLower(raw) {
	case "md", "markdown":
		return "markdown"
	case "text", "txt", "plain":
		return "text"
	default:
		return "json"
	}
}

// stripOutputFlag drops -o and its value.
func stripOutputFlag(args []string) []string {
	var out []string

	for i := 0; i < len(args); i++ {
		switch arg := args[i]; {
		case strings.HasPrefix(arg, "--output="):
		case arg == "-o" || arg == "--output":
			i++
		default:
			out = append(out, arg)
		}
	}

	return out
}

// specFlag is parseSpecFlag: the first --spec= value, or "" when none.
func specFlag(args []string) (string, bool) {
	for _, arg := range args {
		if value, found := strings.CutPrefix(arg, "--spec="); found {
			return value, true
		}
	}

	return "", false
}

func lastPrefixed(args []string, prefix string) *string {
	var value *string

	for _, arg := range args {
		if v, found := strings.CutPrefix(arg, prefix); found {
			value = &v
		}
	}

	return value
}

// printJSON is writeFormatted(value, "json").
func (l *lifecycleRun) printJSON(value any) {
	text := ""

	switch v := value.(type) {
	case *noskillsfx.JSObject:
		text = noskillsfx.JSONIndent(v)
	case []any:
		text = noskillsfx.JSONIndent(v)
	}

	_, _ = io.WriteString(l.e.stdout, text+"\n")
}

func (l *lifecycleRun) next(ctx context.Context, args []string) (int, error) {
	format := outputFormat(args)
	clean := stripOutputFlag(args)
	root := l.projectRoot()

	audience := ""

	for _, arg := range clean {
		switch arg {
		case "--agent":
			audience = "agent"
		case "--human":
			audience = "human"
		}

		if audience != "" {
			break
		}
	}

	spec, _ := specFlag(clean)

	result, err := noskillsfx.Next(ctx, l.lifecycleEnv(root), noskillsfx.NextOptions{
		Spec:     spec,
		Answer:   lastPrefixed(clean, "--answer="),
		Audience: audience,
		// The second agent of --validate (TASK-164), on aifx.
		Validate:   containsArg(clean, "--validate"),
		Validators: validatorResolver(l.e),
	})
	if err != nil {
		return 0, err //nolint:wrapcheck // the message is the TypeScript one
	}

	if err := l.printFormatted(result.Output, format); err != nil {
		return 0, err
	}

	return result.ExitCode, nil
}

func containsArg(args []string, arg string) bool {
	for _, a := range args {
		if a == arg {
			return true
		}
	}

	return false
}

func (l *lifecycleRun) status(args []string) (int, error) {
	if outputFormat(args) != "json" {
		return l.statusHuman(args)
	}

	root := l.projectRoot()
	spec, _ := specFlag(args)

	out, err := noskillsfx.Status(l.lifecycleEnv(root), spec)
	if err != nil {
		if refusal, ok := noskillsfx.IsRefusal(err); ok {
			l.printJSON(noskillsfx.JSObjectOf("error", refusal.Message))

			return clifx.ExitFailure, nil
		}

		return 0, err //nolint:wrapcheck // the message is the TypeScript one
	}

	l.printJSON(out)

	return clifx.ExitOK, nil
}

// requireSpec is requireSpecFlag: the --spec value, or the error line.
func (l *lifecycleRun) requireSpec(args []string, prefix string) (string, bool) {
	spec, ok := specFlag(args)
	if !ok || spec == "" {
		writeln(l.e.stdout, red("Error: spec name is required. Use `"+prefix+" spec <name> <command>` format."))

		return "", false
	}

	return spec, true
}

func (l *lifecycleRun) exit(code int) {
	if l.e.exit != nil {
		l.e.exit(code)
	}
}

func (l *lifecycleRun) prefixOf(root string) string {
	manifest := noskillsfx.ReadHookManifest(root)

	return manifest.CommandPrefix()
}

// refusalOrError prints a refusal's first line in red and returns 1, or
// passes any other error on.
func (l *lifecycleRun) refusalOrError(err error) (int, error) {
	var notFound *noskillsfx.SpecNotFoundError
	if errors.As(err, &notFound) {
		writeln(l.e.stdout, red(err.Error()))

		return clifx.ExitFailure, nil
	}

	if refusal, ok := noskillsfx.IsRefusal(err); ok {
		writeln(l.e.stdout, red(refusal.Message))

		for _, detail := range refusal.Details {
			writeln(l.e.stdout, dim(detail))
		}

		return clifx.ExitFailure, nil
	}

	return 0, err
}

func (l *lifecycleRun) approve(ctx context.Context, args []string) (int, error) {
	root := l.projectRoot()
	prefix := l.prefixOf(root)

	spec, ok := l.requireSpec(args, prefix)
	if !ok {
		return clifx.ExitFailure, nil
	}

	result, err := noskillsfx.Approve(ctx, l.lifecycleEnv(root), spec)
	if err != nil {
		if refusal, isRefusal := noskillsfx.IsRefusal(err); isRefusal && refusal.Kind == "pending-delegations" {
			writeln(l.e.stdout, red(refusal.Message))
			writeln(l.e.stdout, "")

			for _, detail := range refusal.Details {
				parts := strings.Split(detail, "\x00")
				writeln(l.e.stdout, "  "+parts[0]+": delegated to ", bold(parts[1]), dim(" (pending since "+parts[2]+")"))
			}

			writeln(l.e.stdout, "")
			writeln(l.e.stdout, dim("All delegations must be answered before approval."))

			return clifx.ExitFailure, nil
		}

		return l.refusalOrError(err)
	}

	switch {
	case result.To == noskillsfx.PhaseSpecApproved:
		writeln(l.e.stdout, green("✔"), " Spec approved. Phase: ", cyan(noskillsfx.PhaseSpecApproved))
		writeln(l.e.stdout, "When ready, run ", bold(prefix+" spec "+spec+` next --answer="start"`), " to begin execution.")
	case result.To == noskillsfx.PhaseSpecProposal:
		writeln(l.e.stdout, green("✔"), " Discovery answers approved. Phase: ", cyan(noskillsfx.PhaseSpecProposal))
		writeln(l.e.stdout, "Review the spec and run ", bold(prefix+" approve"), " again to approve.")
	case result.Message == "discovery-complete":
		writeln(l.e.stdout, dim("Discovery complete. Spec draft already generated."))
		writeln(l.e.stdout, "Review the spec and run ", bold(prefix+" approve"), " again when in SPEC_PROPOSAL phase.")
	default:
		writeln(l.e.stdout, red(result.Message))
	}

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) done(ctx context.Context, args []string) (int, error) {
	root := l.projectRoot()
	prefix := l.prefixOf(root)

	spec, ok := l.requireSpec(args, prefix)
	if !ok {
		return clifx.ExitFailure, nil
	}

	result, err := noskillsfx.Done(ctx, l.lifecycleEnv(root), spec, "")

	if len(result.OpenDebt) > 0 {
		writeln(l.e.stdout, yellow("Warning: "+itoa(len(result.OpenDebt))+" unresolved debt item(s)."))

		for _, item := range result.OpenDebt {
			writeln(l.e.stdout, dim("  - "+item))
		}

		writeln(l.e.stdout, "")
	}

	if err != nil {
		return l.refusalOrError(err)
	}

	writeln(l.e.stdout, green("✔"), " Spec completed!")
	writeln(l.e.stdout, "")
	writeln(l.e.stdout, "  Spec:       ", bold(result.Spec))
	writeln(l.e.stdout, "  Iterations: "+noskillsfx.DisplayValue(result.Iterations))
	writeln(l.e.stdout, "  Decisions:  "+itoa(result.Decisions))

	if result.Decisions > 0 && result.Promoted > 0 {
		writeln(l.e.stdout, dim("  Promoted to rules: "+itoa(result.Promoted)))
	}

	writeln(l.e.stdout, "")
	writeln(l.e.stdout, "Start a new spec with: ", bold(prefix+` spec new "..."`))

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) spec(ctx context.Context, args []string) (int, error) {
	root := l.projectRoot()
	prefix := l.prefixOf(root)

	if len(args) == 0 || args[0] == "help" || args[0] == "--help" || args[0] == "-h" {
		l.specHelp(prefix)

		return clifx.ExitOK, nil
	}

	switch args[0] {
	case "new":
		return l.specNew(ctx, root, prefix, args[1:])
	case "list":
		if outputFormat(args[1:]) != "json" {
			l.specListHuman(root)

			return clifx.ExitOK, nil
		}

		l.printJSON(noskillsfx.SpecList(l.lifecycleEnv(root)))

		return clifx.ExitOK, nil
	}

	code, err := l.specOf(ctx, prefix, args)

	// `spec <name> ...` on a spec that does not exist: commands/spec.ts
	// prints the message and exits 1 for every subcommand.
	if _, ok := errors.AsType[*noskillsfx.SpecNotFoundError](err); ok {
		return l.refusalOrError(err)
	}

	return code, err
}

// specOf is `spec <name> <subcommand> ...`.
func (l *lifecycleRun) specOf(ctx context.Context, prefix string, args []string) (int, error) { //nolint:cyclop,funlen // the subcommands of commands/spec.ts
	name := args[0]
	scoped := append([]string{"--spec=" + name}, args[min(2, len(args)):]...)

	if len(args) == 1 {
		return l.status([]string{"--spec=" + name})
	}

	switch sub := args[1]; {
	case sub == "next":
		return l.next(ctx, scoped)
	case sub == "approve":
		return l.approve(ctx, scoped)
	case sub == "done":
		return l.done(ctx, scoped)
	case sub == "followup":
		return l.followUp(ctx, prefix, scoped)
	case sub == "learn":
		return l.learn(scoped)
	case sub == "ledger":
		return l.ledger(scoped)
	case sub == "ac" || sub == "task" || sub == "note":
		return l.specScoped(ctx, sub, name, args[2:])
	case sub == "section":
		return l.specSection(ctx, prefix, name, args[2:])
	case containsArg(specStateSubcommands(), sub):
		return l.specState(ctx, sub, scoped)
	default:
		writeln(l.e.stdout, red("Unknown command: spec "+name+" "+sub))
		writeln(l.e.stdout, dim("  Valid: next, approve, done, block, reset, cancel, wontfix, reopen, revisit, split, ac, task, note, section, ledger"))

		return clifx.ExitFailure, nil
	}
}

func (l *lifecycleRun) specHelp(prefix string) {
	out := l.e.stdout
	writeln(out, "Usage: "+prefix+` spec <new "description" | list | <name> <command>>`)
	writeln(out, "")
	writeln(out, dim("  Commands for a spec:"))
	writeln(out, dim("    next, approve, done, block, reset, cancel, wontfix, reopen, revisit, split, ac, task, note, section, ledger"))
	writeln(out, "")
	writeln(out, dim("  Examples:"))
	writeln(out, dim("    "+prefix+` spec new "Add photo upload support"            # name auto-generated`))
	writeln(out, dim("    "+prefix+` spec new my-feature "Add upload support"       # explicit name`))
	writeln(out, dim("    "+prefix+" spec my-feature next"))
	writeln(out, dim("    "+prefix+` spec my-feature next --answer="approve"`))
}

// specNewOptions parses `spec new` as specNew does: --name=, then the first
// positional is the name unless it reads like a description.
func specNewOptions(args []string) noskillsfx.SpecNewOptions {
	var opts noskillsfx.SpecNewOptions

	nameGiven := false

	var positionals []string

	for _, arg := range args {
		switch {
		case strings.HasPrefix(arg, "--name="):
			opts.Name = strings.TrimPrefix(arg, "--name=")
			nameGiven = true
		case !strings.HasPrefix(arg, "-"):
			positionals = append(positionals, arg)
		}

		if value, found := strings.CutPrefix(arg, "--from-plan="); found {
			opts.PlanPath = value
		}
	}

	switch {
	case nameGiven:
		opts.Description = strings.Join(positionals, " ")
	case len(positionals) > 0 && noskillsfx.LooksLikeDescription(positionals[0]):
		opts.Description = strings.Join(positionals, " ")
	case len(positionals) > 0:
		opts.Name = positionals[0]
		opts.Description = strings.Join(positionals[1:], " ")
	}

	return opts
}

func (l *lifecycleRun) specNew(ctx context.Context, root, prefix string, args []string) (int, error) {
	result, err := noskillsfx.SpecNew(ctx, l.lifecycleEnv(root), specNewOptions(args))
	if err != nil {
		refusal, ok := noskillsfx.IsRefusal(err)
		if !ok {
			return 0, err //nolint:wrapcheck // the message is the TypeScript one
		}

		out := l.e.stdout

		switch refusal.Kind {
		case "not-initialized":
			writeln(out, red(refusal.Message), " Run: ", bold(prefix+" init"))
		case "reserved":
			writeln(out, red(refusal.Message), dim(" Choose a different spec name."))
		case "invalid-name":
			writeln(out, red(refusal.Message), bold(refusal.Details[0]))
			writeln(out, dim("Must be lowercase, hyphens, numbers only. Max "+itoa(noskillsfx.SpecNameMaxLength)+
				" chars. Regex: "+noskillsfx.SpecNamePatternText))
		case "no-description":
			writeln(out, red(refusal.Message), bold(refusal.Details[0]))
		case "exists":
			writeln(out, red(refusal.Message), dim(refusal.Details[0]))
		default:
			writeln(out, red(refusal.Message))
		}

		return clifx.ExitFailure, nil
	}

	if result.Interactive != nil {
		l.printJSON(result.Interactive)

		return clifx.ExitOK, nil
	}

	out := l.e.stdout
	writeln(out, green("✔"), " Spec started: ", bold(result.Name))
	writeln(out, "  Directory: ", dim(result.Directory))
	writeln(out, "  Branch:    ", dim(result.Branch))
	writeln(out, "  Phase:     ", yellow(noskillsfx.PhaseDiscovery))

	if result.PlanPath != "" {
		writeln(out, "  Plan:      ", dim(result.PlanPath))
	}

	writeln(out, "")
	writeln(out, "Run ", bold(prefix+" spec "+result.Name+" next"), " to begin discovery questions.")

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) followUp(ctx context.Context, prefix string, args []string) (int, error) {
	spec, ok := l.requireSpec(args, prefix)
	if !ok {
		return clifx.ExitFailure, nil
	}

	var positionals []string

	opts := noskillsfx.FollowUpOptions{}

	for _, arg := range args {
		if !strings.HasPrefix(arg, "--") {
			positionals = append(positionals, arg)
		}

		if value, found := strings.CutPrefix(arg, "--answer="); found {
			opts.Answer = &value
		}

		if arg == "--skip" {
			opts.Skip = true
		}
	}

	out := l.e.stdout

	if len(positionals) == 0 || positionals[0] == "" {
		writeln(out, red("Usage: "+prefix+" spec "+spec+` followup <questionId> "question text"`))
		writeln(out, dim("  Or: "+prefix+" spec "+spec+` followup <followUpId> --answer="text"`))
		writeln(out, dim("  Or: "+prefix+" spec "+spec+" followup <followUpId> --skip"))

		return clifx.ExitFailure, nil
	}

	opts.ID = positionals[0]
	opts.Question = strings.Join(positionals[1:], " ")

	root := l.projectRoot()

	result, err := noskillsfx.FollowUpCommand(ctx, l.lifecycleEnv(root), spec, opts)
	if err != nil {
		return l.refusalOrError(err)
	}

	switch {
	case result.Added != "":
		writeln(out, green("✔"), " Follow-up added: "+result.Added)
	default:
		verb := "Answered"
		if opts.Answer == nil {
			verb = "Skipped"
		}

		writeln(out, green("✔"), " "+verb+" follow-up: "+result.Settled)

		if result.DiscoveryComplete {
			writeln(out, "Discovery complete. Run `"+prefix+" spec "+spec+" next` for the review.")
		}
	}

	return clifx.ExitOK, nil
}

func itoa(n int) string {
	return noskillsfx.DisplayValue(float64(n))
}

// runShell runs a command line through sh (cmd.exe on Windows) with no
// stdin, as runVerification does.
func runShell(ctx context.Context, e *env, command, dir string) (stdout, stderr string, ok bool, err error) {
	name, args := "sh", []string{"-c", command}
	if e.goos == "windows" {
		name, args = "cmd.exe", []string{"/d", "/s", "/c", command}
	}

	cmd := exec.CommandContext(ctx, name, args...) //nolint:gosec // G204: the verifyCommand the project's manifest sets
	cmd.Dir = dir

	var out, errOut bytes.Buffer

	cmd.Stdout = &out
	cmd.Stderr = &errOut

	runErr := cmd.Run()

	var exitErr *exec.ExitError
	if runErr != nil && !errors.As(runErr, &exitErr) {
		return out.String(), errOut.String(), false, runErr //nolint:wrapcheck // the caller reports it as the TypeScript CLI does
	}

	return out.String(), errOut.String(), runErr == nil, nil
}
