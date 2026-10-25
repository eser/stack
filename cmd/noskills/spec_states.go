// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"errors"
	"io"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// The spec state commands (TASK-258.1): block, reset, cancel, wontfix,
// reopen, free and validate at the top level, and under `spec <name>` also
// review, delegate, plan-export, split, revisit, ac, task and note. They
// print what commands/*.ts and the subcommands of commands/spec.ts print;
// noskillsfx changes the state files.

// specStateTopLevel are the first words of the state commands.
func specStateTopLevel() []string {
	return []string{"block", "reset", "cancel", "wontfix", "reopen", "free", "validate"}
}

// specStateSubcommands are the `spec <name>` subcommands of this file.
func specStateSubcommands() []string {
	return []string{
		"block", "reset", "cancel", "wontfix", "reopen", "review", "delegate", "plan-export",
		"split", "revisit", "ac", "task", "note",
	}
}

// topLevelState answers a top-level state command; handled is false for
// any other word.
func (l *lifecycleRun) topLevelState(ctx context.Context) (code int, handled bool, err error) {
	name, rest := l.args[0], l.args[1:]

	switch name {
	case "free":
		l.free()

		return clifx.ExitOK, true, nil
	case "validate":
		return l.validate(rest), true, nil
	}

	if !containsArg(specStateTopLevel(), name) {
		return 0, false, nil
	}

	code, err = l.specState(ctx, name, rest)

	return code, true, err
}

// specState runs a state command on args that carry --spec=<name> first
// when it came from `spec <name> <command>`; rest are the arguments after
// the command word there.
func (l *lifecycleRun) specState(ctx context.Context, name string, args []string) (int, error) {
	switch name {
	case "block":
		return l.block(ctx, args)
	case "reset":
		return l.reset(args)
	case "cancel":
		return l.terminate(ctx, args, noskillsfx.CompletionCancelled)
	case "wontfix":
		return l.terminate(ctx, args, noskillsfx.CompletionWontfix)
	case "reopen":
		return l.reopen(ctx, args)
	case "review":
		return l.review(ctx, args)
	case "delegate":
		return l.delegate(ctx, args)
	case "plan-export":
		return l.planExport(args)
	case "split":
		return l.split(args)
	default:
		return l.revisit(args)
	}
}

// specScoped answers ac, task and note, which take the spec name and the
// arguments after the subcommand.
func (l *lifecycleRun) specScoped(ctx context.Context, sub, spec string, args []string) (int, error) {
	switch sub {
	case "ac":
		return l.specItems(ctx, spec, args, "ac", "AC")
	case "task":
		return l.specItems(ctx, spec, args, "task", "task")
	default:
		return l.specItems(ctx, spec, args, "note", "note")
	}
}

// withoutSpecFlag drops every --spec= argument.
func withoutSpecFlag(args []string) []string {
	var out []string

	for _, arg := range args {
		if !strings.HasPrefix(arg, "--spec=") {
			out = append(out, arg)
		}
	}

	return out
}

func (l *lifecycleRun) free() {
	prefix := l.prefixOf(l.projectRoot())

	writeln(l.e.stdout, dim("noskills starts in idle mode with no enforcement. To work on a spec, run:"))
	writeln(l.e.stdout, bold("  "+prefix+` spec new "description"`))
}

func (l *lifecycleRun) block(ctx context.Context, args []string) (int, error) {
	root := l.projectRoot()
	prefix := l.prefixOf(root)

	spec, ok := l.requireSpec(args, prefix)
	if !ok {
		return clifx.ExitFailure, nil
	}

	reason := strings.Join(withoutSpecFlag(args), " ")
	if reason == "" {
		reason = "No reason given"
	}

	if err := noskillsfx.Block(ctx, l.lifecycleEnv(root), spec, reason); err != nil {
		return l.refusalOrError(err)
	}

	writeln(l.e.stdout, yellow("⚠"), " Spec blocked: ", dim(reason))
	writeln(l.e.stdout, "Resolve with: ", bold(prefix+" spec "+spec+` next --answer="resolution"`))

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) reset(args []string) (int, error) {
	root := l.projectRoot()
	prefix := l.prefixOf(root)

	spec, ok := l.requireSpec(args, prefix)
	if !ok {
		return clifx.ExitFailure, nil
	}

	result, err := noskillsfx.Reset(l.lifecycleEnv(root), spec)

	if result.MissingDirectory {
		writeln(l.e.stdout, red("Active spec '"+result.ActiveSpec+"' directory not found."))
		writeln(l.e.stdout, dim("Resetting to idle anyway."))
	}

	if err != nil {
		return l.refusalOrError(err)
	}

	if result.AlreadyIdle {
		writeln(l.e.stdout, dim("Already idle. Nothing to reset."))

		return clifx.ExitOK, nil
	}

	writeln(l.e.stdout, green("✔"), " Reset to idle.")

	if result.Spec != "" {
		writeln(l.e.stdout, dim(`Spec "`+result.Spec+`" state cleared. Files in .eser/specs/`+result.Spec+"/ preserved."))
	}

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) terminate(ctx context.Context, args []string, reason string) (int, error) {
	root := l.projectRoot()
	prefix := l.prefixOf(root)

	spec, ok := l.requireSpec(args, prefix)
	if !ok {
		return clifx.ExitFailure, nil
	}

	note := ""

	if reason == noskillsfx.CompletionWontfix {
		note = strings.Join(withoutSpecFlag(args), " ")
		if note == "" {
			writeln(l.e.stdout, red("A reason is required: "+prefix+" spec "+spec+` wontfix "reason text"`))

			return clifx.ExitFailure, nil
		}
	}

	if err := noskillsfx.Terminate(ctx, l.lifecycleEnv(root), spec, reason, note); err != nil {
		return l.refusalOrError(err)
	}

	if reason == noskillsfx.CompletionWontfix {
		writeln(l.e.stdout, green("✔"), " Spec marked as won't fix: "+note)
	} else {
		writeln(l.e.stdout, green("✔"), " Spec cancelled.")
	}

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) reopen(ctx context.Context, args []string) (int, error) {
	root := l.projectRoot()
	prefix := l.prefixOf(root)

	spec, ok := l.requireSpec(args, prefix)
	if !ok {
		return clifx.ExitFailure, nil
	}

	if err := noskillsfx.Reopen(ctx, l.lifecycleEnv(root), spec); err != nil {
		return l.refusalOrError(err)
	}

	writeln(l.e.stdout, green("✔"), " Spec reopened. Discovery answers preserved. Run `"+prefix+" spec "+spec+" next` to revise them.")

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) review(ctx context.Context, args []string) (int, error) {
	root := l.projectRoot()
	prefix := l.prefixOf(root)

	spec, ok := l.requireSpec(args, prefix)
	if !ok {
		return clifx.ExitFailure, nil
	}

	opts := noskillsfx.ReviewOptions{
		Answer:   lastPrefixed(args, "--answer="),
		Question: lastPrefixed(args, "--question="),
	}

	result, err := noskillsfx.Review(ctx, l.lifecycleEnv(root), spec, opts)
	if err != nil {
		return l.refusalOrError(err)
	}

	out := l.e.stdout

	if len(result.Pending) == 0 && len(result.Answered) == 0 {
		writeln(out, dim("No delegations for you on this spec."))

		return clifx.ExitOK, nil
	}

	writeln(out, bold("Spec: "+spec))
	writeln(out, "")

	if len(result.Pending) > 0 {
		writeln(out, yellow("You have "+itoa(len(result.Pending))+" pending delegation(s):"))
		writeln(out, "")

		for i, d := range result.Pending {
			writeln(out, "  "+itoa(i+1)+". ", red("[PENDING]"), " "+d.Question)
			writeln(out, dim("     Delegated by: "+d.DelegatedBy+" ("+d.DelegatedAt+")"))
		}
	}

	if len(result.Answered) > 0 {
		writeln(out, "")
		writeln(out, green(itoa(len(result.Answered))+" answered delegation(s):"))

		for _, d := range result.Answered {
			writeln(out, "  ", green("✔"), " "+d.Question)
			writeln(out, dim("    Answer: "+d.Answer))
		}
	}

	if result.Settled != "" {
		writeln(out, "")
		writeln(out, green("✔"), " Answered: "+result.Settled)
	}

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) delegate(ctx context.Context, args []string) (int, error) {
	root := l.projectRoot()
	prefix := l.prefixOf(root)

	spec, ok := l.requireSpec(args, prefix)
	if !ok {
		return clifx.ExitFailure, nil
	}

	var positionals []string

	for _, arg := range args {
		if !strings.HasPrefix(arg, "--") {
			positionals = append(positionals, arg)
		}
	}

	questionID, userName := "", ""
	if len(positionals) > 0 {
		questionID = positionals[0]
		userName = strings.Join(positionals[1:], " ")
	}

	if questionID == "" || userName == "" {
		writeln(l.e.stdout, red("Usage: "+prefix+" spec "+spec+" delegate <questionId> <userName>"))

		return clifx.ExitFailure, nil
	}

	if err := noskillsfx.Delegate(ctx, l.lifecycleEnv(root), spec, questionID, userName); err != nil {
		return l.refusalOrError(err)
	}

	writeln(l.e.stdout, green("✔"), ` Delegated "`+questionID+`" to `+userName)

	return clifx.ExitOK, nil
}

// planExport reports its failures on stderr, as the TypeScript command's
// failed result does.
func (l *lifecycleRun) planExport(args []string) (int, error) {
	root := l.projectRoot()
	prefix := l.prefixOf(root)

	spec, ok := specFlag(args)
	if !ok || spec == "" {
		_, _ = io.WriteString(l.e.stderr, "Error: spec name is required. Use `"+prefix+" spec <name> <command>` format.\n")

		return clifx.ExitFailure, nil
	}

	path, err := noskillsfx.PlanExport(l.lifecycleEnv(root), spec)
	if err != nil {
		if refusal, isRefusal := noskillsfx.IsRefusal(err); isRefusal {
			_, _ = io.WriteString(l.e.stderr, refusal.Message+"\n")

			return clifx.ExitFailure, nil
		}

		return 0, err //nolint:wrapcheck // the message names the file
	}

	writeln(l.e.stdout, "Written: "+path)

	return clifx.ExitOK, nil
}

// splitInto is parseIntoFlags: --into <name>, with the next argument as
// its description unless that is a flag.
func splitInto(args []string) []noskillsfx.SplitInto {
	var entries []noskillsfx.SplitInto

	for i := 0; i < len(args); {
		if args[i] != "--into" || i+1 >= len(args) {
			i++

			continue
		}

		entry := noskillsfx.SplitInto{Name: args[i+1], Description: args[i+1]}

		if i+2 < len(args) && !strings.HasPrefix(args[i+2], "-") {
			entry.Description = args[i+2]
			i += 3
		} else {
			i += 2
		}

		entries = append(entries, entry)
	}

	return entries
}

func (l *lifecycleRun) notInitialized(prefix string) bool {
	if noskillsfx.IsHookInitialized(l.projectRoot()) {
		return false
	}

	writeln(l.e.stdout, red("noskills is not initialized."), " Run: ", bold(prefix+" init"))

	return true
}

func (l *lifecycleRun) split(args []string) (int, error) {
	root := l.projectRoot()
	prefix := l.prefixOf(root)

	if l.notInitialized(prefix) {
		return clifx.ExitFailure, nil
	}

	spec, _ := specFlag(args)

	names, err := noskillsfx.SplitCommand(l.lifecycleEnv(root), spec, splitInto(args))
	if err != nil {
		var refused *noskillsfx.SplitRefusedError

		switch refusal, isRefusal := noskillsfx.IsRefusal(err); {
		case isRefusal && refusal.Kind == "invalid-name":
			writeln(l.e.stdout, red(refusal.Message), bold(refusal.Details[0]))
			writeln(l.e.stdout, dim("Use lowercase letters, numbers and hyphens, at most "+itoa(noskillsfx.SpecNameMaxLength)+
				" chars, and not a subcommand name."))

			return clifx.ExitFailure, nil
		case isRefusal:
			writeln(l.e.stdout, red(refusal.Message))

			return clifx.ExitFailure, nil
		case errors.As(err, &refused):
			writeln(l.e.stdout, red("Error: "+refused.Message))

			return clifx.ExitFailure, nil
		}

		return 0, err //nolint:wrapcheck // the message is the TypeScript one
	}

	writeln(l.e.stdout, green("Split complete."), " Created "+itoa(len(names))+" sub-specs:")

	for _, name := range names {
		writeln(l.e.stdout, "  ", dim("○"), " ", bold(name))
	}

	writeln(l.e.stdout, "", dim(`Parent spec "`+spec+`" cancelled.`))

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) revisit(args []string) (int, error) {
	root := l.projectRoot()
	prefix := l.prefixOf(root)

	if l.notInitialized(prefix) {
		return clifx.ExitFailure, nil
	}

	spec, _ := specFlag(args)
	reason, found := "", false

	for _, arg := range args {
		if !strings.HasPrefix(arg, "--") && arg != spec {
			reason, found = arg, true

			break
		}
	}

	if !found || jsTrimmed(reason) == "" {
		writeln(l.e.stdout, red("Error: Reason is required: "+prefix+" spec "+spec+` revisit "reason"`))

		return clifx.ExitFailure, nil
	}

	reason = jsTrimmed(reason)

	result, err := noskillsfx.Revisit(l.lifecycleEnv(root), spec, reason)
	if err != nil {
		return l.refusalOrError(err)
	}

	writeln(l.e.stdout, green("Revisit complete."))
	writeln(l.e.stdout, "  Phase: ", bold(noskillsfx.PhaseDiscovery), dim(" (revisited from "+result.From+")"))

	if result.CompletedTasks > 0 {
		writeln(l.e.stdout, "  Previous progress: ", bold(itoa(result.CompletedTasks)+" tasks completed"))
	}

	writeln(l.e.stdout, "  Reason: ", dim(`"`+reason+`"`))
	writeln(l.e.stdout, "  Discovery answers preserved — revise or re-approve.")

	return clifx.ExitOK, nil
}

// specItems is `spec <name> ac | task | note <add "text" | list>`. A
// missing spec ends the TypeScript command with an uncaught error, which
// runLifecycle reports on stderr.
func (l *lifecycleRun) specItems(ctx context.Context, spec string, args []string, word, noun string) (int, error) {
	root := l.projectRoot()
	prefix := l.prefixOf(root)
	out := l.e.stdout
	usage := "Usage: " + prefix + " spec <name> " + word + ` <add "text" | list>`

	action := ""
	if len(args) > 0 {
		action = args[0]
	}

	switch action {
	case "add":
		var words []string

		for _, arg := range args[1:] {
			if !strings.HasPrefix(arg, "-") {
				words = append(words, arg)
			}
		}

		text := strings.Join(words, " ")
		if text == "" {
			writeln(out, red("Please provide "+noun+" text."))

			return clifx.ExitFailure, nil
		}

		return l.specItemAdd(ctx, root, spec, word, text)
	case "list":
		return l.specItemList(root, spec, word)
	default:
		writeln(out, usage)

		return clifx.ExitOK, nil
	}
}

func (l *lifecycleRun) specItemAdd(ctx context.Context, root, spec, word, text string) (int, error) {
	out := l.e.stdout
	env := l.lifecycleEnv(root)

	var (
		phase string
		user  noskillsfx.User
		err   error
	)

	label := ""

	switch word {
	case "ac":
		label = "AC added: "
		phase, user, err = noskillsfx.AddCustomAC(ctx, env, spec, text)
	case "task":
		label = "Task added: "
		phase, user, err = noskillsfx.AddSpecNote(ctx, env, spec, "[TASK] "+text,
			[]string{noskillsfx.PhaseExecuting, noskillsfx.PhaseBlocked})
	default:
		label = "Note added: "
		phase, user, err = noskillsfx.AddSpecNote(ctx, env, spec, text, nil)
	}

	if refusal, isRefusal := noskillsfx.IsRefusal(err); isRefusal {
		writeln(out, red(refusal.Message))

		return clifx.ExitFailure, nil
	}

	if word == "ac" && phase == noskillsfx.PhaseExecuting {
		writeln(out, yellow("Warning: Adding ACs during execution is scope creep."))
	}

	if err != nil {
		return 0, err //nolint:wrapcheck // the message is the TypeScript one
	}

	writeln(out, green(label), `"`+text+`"`, dim(" (by "+user.Name+")"))

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) specItemList(root, spec, word string) (int, error) {
	out := l.e.stdout
	env := l.lifecycleEnv(root)

	var (
		entries noskillsfx.SpecEntries
		err     error
	)

	title, empty := "", ""

	switch word {
	case "ac":
		title, empty = "Custom ACs for ", "  No custom ACs."
		entries, err = noskillsfx.CustomACs(env, spec)
	case "task":
		title, empty = "Custom tasks for ", "  No custom tasks."
		entries, err = noskillsfx.SpecNotes(env, spec, true)
	default:
		title, empty = "Notes for ", "  No notes."
		entries, err = noskillsfx.SpecNotes(env, spec, false)
	}

	if err != nil {
		return 0, err //nolint:wrapcheck // the message is the TypeScript one
	}

	writeln(out, bold(title+spec))
	writeln(out, "")

	if len(entries.Entries) == 0 {
		writeln(out, dim(empty))
	}

	for _, entry := range entries.Entries {
		writeln(out, "  - "+entry.Text, dim(" -- "+entry.User+", "+entry.Phase))
	}

	return clifx.ExitOK, nil
}

// validate is commands/validate.ts: the completeness report of a spec,
// exit 1 while sections or decisions are open.
func (l *lifecycleRun) validate(args []string) int {
	root := l.projectRoot()
	prefix := l.prefixOf(root)
	out := l.e.stdout

	if len(args) == 0 {
		writeln(out, red("Error: spec name is required."))
		writeln(out, dim("Usage: "+prefix+" validate <spec-name>"))

		return clifx.ExitFailure
	}

	spec := args[0]
	report := noskillsfx.ValidateSpec(l.lifecycleEnv(root), spec)

	if report.CanAdvance {
		writeln(out, green("✓"), " ", bold(spec), ": all "+itoa(report.VisibleSections)+" sections resolved")

		return clifx.ExitOK
	}

	writeln(out, red("✗"), " ", bold(spec), ": "+itoa(len(report.Unresolved))+" unresolved, "+
		itoa(len(report.PendingDecisions))+" pending decisions")

	if len(report.Unresolved) > 0 {
		writeln(out, "")
		writeln(out, yellow("Unresolved sections:"))

		for _, title := range report.Unresolved {
			writeln(out, "  - ", title)
		}
	}

	if len(report.PendingDecisions) > 0 {
		writeln(out, "")
		writeln(out, yellow("Pending decisions:"))

		for _, d := range report.PendingDecisions {
			writeln(out, "  - ", d.Section+": "+d.Question, dim(" (waiting for "+strings.Join(d.WaitingFor, ", ")+")"))
		}
	}

	writeln(out, "")
	writeln(out, dim("Run `"+prefix+" spec "+spec+" next` to fill remaining sections."))

	return clifx.ExitFailure
}

// statusHuman is `status -o markdown|text`: the status lines.
func (l *lifecycleRun) statusHuman(args []string) (int, error) {
	root := l.projectRoot()
	prefix := l.prefixOf(root)
	spec, _ := specFlag(args)
	out := l.e.stdout

	view, err := noskillsfx.StatusHuman(l.lifecycleEnv(root), spec)
	if err != nil {
		if refusal, isRefusal := noskillsfx.IsRefusal(err); isRefusal && refusal.Kind == "not-initialized" {
			writeln(out, red(refusal.Message), " Run: ", bold(prefix+" init"))

			return clifx.ExitFailure, nil
		}

		return 0, err //nolint:wrapcheck // the message is the TypeScript one
	}

	writeln(out, bold(prefix+" status"))
	writeln(out, "")
	writeln(out, "  Phase:    ", phaseColor(view.Phase))

	if view.HasSpec {
		writeln(out, "  Spec:     ", bold(view.Spec))
	}

	if view.HasBranch {
		writeln(out, "  Branch:   ", view.Branch)
	}

	if view.Phase == noskillsfx.PhaseDiscovery || view.Phase == noskillsfx.PhaseDiscoveryRefinement {
		writeln(out, "  Discovery: "+itoa(view.Answered)+"/"+itoa(view.Questions)+" questions answered")
	}

	if view.Phase == noskillsfx.PhaseExecuting {
		writeln(out, "  Iteration: "+view.Iteration)

		if view.LastProgress != nil {
			writeln(out, "  Progress:  ", dim(*view.LastProgress))
		}

		if view.DebtItems != nil {
			writeln(out, yellow("  Debt:      "+itoa(*view.DebtItems)+" items"))
		}
	}

	if view.HasConfig {
		writeln(out, "")

		if len(view.Concerns) > 0 {
			writeln(out, "  Concerns: ", dim(strings.Join(view.Concerns, ", ")))
		}

		if len(view.Tools) > 0 {
			writeln(out, "  Tools:    ", dim(strings.Join(view.Tools, ", ")))
		}
	}

	if view.Decisions > 0 {
		writeln(out, "")
		writeln(out, "  Decisions: "+itoa(view.Decisions))
	}

	return clifx.ExitOK, nil
}

// phaseColor colors a phase as status and spec list do.
func phaseColor(phase string) string {
	switch phase {
	case noskillsfx.PhaseCompleted:
		return green(phase)
	case noskillsfx.PhaseBlocked:
		return red(phase)
	case noskillsfx.PhaseExecuting:
		return cyan(phase)
	default:
		return yellow(phase)
	}
}

// specListHuman is `spec list -o markdown|text`: one line per spec.
func (l *lifecycleRun) specListHuman(root string) {
	out := l.e.stdout

	writeln(out, bold("Specs"))
	writeln(out, "")

	specs := noskillsfx.SpecList(l.lifecycleEnv(root))
	if len(specs) == 0 {
		writeln(out, dim("  No specs yet."))
	}

	for _, spec := range specs {
		name, _ := noskillsfx.FieldOf(spec, "name")
		phaseValue, phasePresent := noskillsfx.FieldOf(spec, "phase")
		iteration, iterationPresent := noskillsfx.FieldOf(spec, "iteration")
		phase := noskillsfx.JSString(phaseValue, phasePresent)

		iterationText := ""
		if phase == noskillsfx.PhaseExecuting {
			iterationText = dim(" iteration " + noskillsfx.JSString(iteration, iterationPresent))
		}

		writeln(out, "  ", dim("○"), " ", noskillsfx.JSString(name, true), "  ", phaseColor(phase), iterationText)
	}
}

// printFormatted is writeFormatted(value, format): JSON, markdown or text.
// A renderer that reads a field of null fails as the TypeScript one throws.
func (l *lifecycleRun) printFormatted(value any, format string) error {
	if format == noskillsfx.OutputJSON {
		l.printJSON(value)

		return nil
	}

	text, err := noskillsfx.FormatOutput(value, format)
	if err != nil {
		return err //nolint:wrapcheck // the TypeError the TypeScript renderer throws
	}

	_, _ = io.WriteString(l.e.stdout, text+"\n")

	return nil
}

// jsTrimmed is String.prototype.trim.
func jsTrimmed(s string) string {
	return noskillsfx.JSTrim(s)
}
