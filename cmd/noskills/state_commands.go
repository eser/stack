// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"errors"
	"io"
	"strconv"
	"strings"
	"sync"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// The state commands (TASK-259): purge and purge restore, ledger, learn,
// rule, concern, pack and sync, on noskillsfx. They print what the
// TypeScript commands print (commands/*.ts), except where the README's
// list of differences says otherwise.

// stateCommands are the first words this file answers.
func stateCommands() []string {
	return []string{"purge", "ledger", "learn", "rule", "concern", "pack", "sync"}
}

// runStateCommand answers a state command and returns the exit code.
func runStateCommand(ctx context.Context, e *env, args []string) int {
	l := &lifecycleRun{e: e, args: args, mu: sync.Mutex{}, warned: map[string]bool{}}

	code, err := l.dispatchState(ctx)

	switch {
	case errors.Is(err, errForward):
		return forward(ctx, e, args)
	case err != nil:
		_, _ = io.WriteString(e.stderr, "noskills: "+err.Error()+"\n")

		return clifx.ExitFailure
	}

	return code
}

func (l *lifecycleRun) dispatchState(ctx context.Context) (int, error) {
	rest := l.args[1:]

	switch l.args[0] {
	case "purge":
		return l.purge(rest)
	case "ledger":
		return l.ledger(rest)
	case "learn":
		return l.learn(rest)
	case "rule":
		return l.rule(rest)
	case "concern":
		return l.concern(rest)
	case "pack":
		return l.pack(ctx, rest)
	default:
		return l.syncCommand(ctx, rest)
	}
}

// syncCommand is commands/sync.ts: sync was merged into init.
func (l *lifecycleRun) syncCommand(ctx context.Context, args []string) (int, error) {
	writeln(l.e.stdout, dim("`sync` has been merged into `init`. Running `noskills init`..."))
	writeln(l.e.stdout, "")

	return l.initCommand(ctx, args)
}

// configuredPrefix is the command the project's manifest names, which the
// messages of rule, concern, pack and ledger use. The TypeScript commands
// print the default command there, since they never read the manifest's.
func (l *lifecycleRun) configuredPrefix() (string, string) {
	root := l.projectRoot()

	return root, l.prefixOf(root)
}

// syncTools runs the sync for the manifest's tools, as the commands that
// change rules do; it reports whether it synced anything.
func syncTools(root string) (bool, error) {
	section, ok := noskillsfx.ReadManifestSection(root)
	if !ok {
		return false, nil
	}

	tools, isList := section.Get("tools")
	items, _ := tools.([]any)

	if !isList || len(items) == 0 {
		return false, nil
	}

	names := make([]string, 0, len(items))

	for _, item := range items {
		if name, isString := item.(string); isString {
			names = append(names, name)
		}
	}

	if _, err := noskillsfx.SyncAll(root, names, noskillsfx.SyncConfigOf(section)); err != nil {
		return false, err //nolint:wrapcheck // the message names the tool and the file
	}

	return true, nil
}

// ledger is commands/ledger.ts: the decision ledger and summary of a spec.
func (l *lifecycleRun) ledger(args []string) (int, error) {
	format := outputFormat(args)
	root, prefix := l.configuredPrefix()

	spec, hasFlag := specFlag(args)
	if !hasFlag {
		for _, arg := range args {
			if !strings.HasPrefix(arg, "-") {
				spec = arg

				break
			}
		}
	}

	if spec == "" {
		writeln(l.e.stdout, red("Error: spec name is required."))
		writeln(l.e.stdout, dim("Usage: "+prefix+" spec <name> ledger   (or: "+prefix+" ledger <name>)"))

		return clifx.ExitFailure, nil
	}

	records := noskillsfx.ReadLedgerValues(root, spec)

	if ledgerShape(args) == "measurement-draft" {
		draft := noskillsfx.MeasurementDraft(spec, records)
		if format == noskillsfx.OutputJSON {
			l.printJSON(draft)

			return clifx.ExitOK, nil
		}

		text, err := noskillsfx.FormatMeasurementDraft(draft, format)
		if err != nil {
			return 0, err //nolint:wrapcheck // the renderer's message
		}

		_, _ = io.WriteString(l.e.stdout, text+"\n")

		return clifx.ExitOK, nil
	}

	output := noskillsfx.JSObjectOf("spec", spec, "records", records, "summary", noskillsfx.ReadLedgerSummaryValue(root, spec))
	if format == noskillsfx.OutputJSON {
		l.printJSON(output)

		return clifx.ExitOK, nil
	}

	text, err := noskillsfx.FormatLedger(output, format)
	if err != nil {
		return 0, err //nolint:wrapcheck // the renderer's message
	}

	_, _ = io.WriteString(l.e.stdout, text+"\n")

	return clifx.ExitOK, nil
}

func ledgerShape(args []string) string {
	for _, arg := range args {
		if value, found := strings.CutPrefix(arg, "--format="); found {
			switch strings.ToLower(value) {
			case "measurement-draft", "measurement", "draft":
				return "measurement-draft"
			}
		}
	}

	return "ledger"
}

func (l *lifecycleRun) learn(args []string) (int, error) { //nolint:cyclop,funlen,gocognit // the subcommands of commands/learn.ts
	out := l.e.stdout
	root := l.projectRoot()
	prefix := l.prefixOf(root)

	sub := ""
	if len(args) > 0 {
		sub = args[0]
	}

	switch sub {
	case "list", "":
		all := noskillsfx.ReadLearnings(root)
		if len(all) == 0 {
			writeln(out, dim("No learnings recorded yet."))

			return clifx.ExitOK, nil
		}

		writeln(out, bold(strconv.Itoa(len(all))+" learning(s):"))
		writeln(out, "")

		for i, learning := range all {
			kind := noskillsfx.JSString(noskillsfx.FieldOf(learning, "type"))
			severity := noskillsfx.JSString(noskillsfx.FieldOf(learning, "severity"))
			text := noskillsfx.JSString(noskillsfx.FieldOf(learning, "text"))
			spec := noskillsfx.JSString(noskillsfx.FieldOf(learning, "spec"))
			ts := noskillsfx.JSString(noskillsfx.FieldOf(learning, "ts"))

			icon := green("✓")
			if kind == "mistake" {
				icon = red("⚠")
			}

			severityText := dim(severity)
			if severity == "high" {
				severityText = red("HIGH")
			}

			writeln(out, "  "+strconv.Itoa(i+1)+". "+icon+" "+dim("["+kind+"]")+" "+text)
			writeln(out, dim("     spec: "+spec+" | severity: "), severityText, dim(" | "+noskillsfx.JSSlice(ts, 0, 10)))
		}

		return clifx.ExitOK, nil
	case "remove", "promote":
		n, ok := 0, false
		if len(args) > 1 {
			n, ok = noskillsfx.JSParseInt(args[1])
		}

		index := n - 1
		if !ok || index < 0 {
			writeln(out, red("Usage: "+prefix+" learn "+sub+" <number>"))

			return clifx.ExitFailure, nil
		}

		if sub == "remove" {
			removed, err := noskillsfx.RemoveLearning(root, index)
			if err != nil {
				return 0, err //nolint:wrapcheck // the message names the file
			}

			if removed {
				writeln(out, green("✔"), " Removed learning #"+strconv.Itoa(index+1))
			} else {
				writeln(out, red("Learning #"+strconv.Itoa(index+1)+" not found"))
			}

			return clifx.ExitOK, nil
		}

		all := noskillsfx.ReadLearnings(root)
		if index >= len(all) {
			writeln(out, red("Learning #"+strconv.Itoa(index+1)+" not found"))

			return clifx.ExitFailure, nil
		}

		text := noskillsfx.JSString(noskillsfx.FieldOf(all[index], "text"))
		spec := noskillsfx.JSString(noskillsfx.FieldOf(all[index], "spec"))

		path, err := noskillsfx.WriteRuleFile(root, noskillsfx.RuleSlug(text), noskillsfx.LearnedRuleContent(text, spec, l.e.now()))
		if err != nil {
			return 0, err //nolint:wrapcheck // the message names the file
		}

		if _, err := noskillsfx.RemoveLearning(root, index); err != nil {
			return 0, err //nolint:wrapcheck // the message names the file
		}

		if _, err := syncTools(root); err != nil {
			return 0, err
		}

		writeln(out, green("✔"), " Promoted to rule: "+path)
		writeln(out, dim("  Removed from learnings."))

		return clifx.ExitOK, nil
	}

	return l.learnAdd(root, prefix, args)
}

// learnAdd is `noskills spec <name> learn "text" [--rule]`.
func (l *lifecycleRun) learnAdd(root, prefix string, args []string) (int, error) { //nolint:cyclop // the type and severity rules of learn.ts
	out := l.e.stdout
	spec, hasSpec := specFlag(args)

	var positionals []string

	for _, arg := range args {
		if !strings.HasPrefix(arg, "--") {
			positionals = append(positionals, arg)
		}
	}

	text := strings.Join(positionals, " ")
	if text == "" {
		writeln(out, red("Usage: "+prefix+` spec <name> learn "learning text"`))
		writeln(out, dim("  Add --rule to create a permanent project rule instead."))

		return clifx.ExitFailure, nil
	}

	if !hasSpec {
		spec = "unknown"
	}

	if containsArg(args, "--rule") {
		path, err := noskillsfx.WriteRuleFile(root, noskillsfx.RuleSlug(text), noskillsfx.LearnedRuleContent(text, spec, l.e.now()))
		if err != nil {
			return 0, err //nolint:wrapcheck // the message names the file
		}

		if _, err := syncTools(root); err != nil {
			return 0, err
		}

		writeln(out, green("✔"), " Rule created: "+path)

		return clifx.ExitOK, nil
	}

	kind, severity := "convention", "medium"

	for _, arg := range args {
		if value, found := strings.CutPrefix(arg, "--type="); found {
			switch value {
			case "mistake", "convention", "success", "dependency":
				kind = value
			}
		}

		if value, found := strings.CutPrefix(arg, "--severity="); found {
			switch value {
			case "high", "medium", "low":
				severity = value
			}
		}
	}

	lower := strings.ToLower(text)

	switch {
	case strings.Contains(lower, "mistake") || strings.Contains(lower, "wrong") || strings.Contains(lower, "assumed"):
		kind, severity = "mistake", "high"
	case strings.Contains(lower, "convention") || strings.Contains(lower, "pattern") || strings.Contains(lower, "always use"):
		kind = "convention"
	case strings.Contains(lower, "worked well") || strings.Contains(lower, "success"):
		kind = "success"
	}

	learning := noskillsfx.JSObjectOf("ts", l.e.now().UTC().Format("2006-01-02T15:04:05.000Z"), "spec", spec, "type", kind,
		"text", text, "severity", severity)
	if err := noskillsfx.AddLearning(root, learning); err != nil {
		return 0, err //nolint:wrapcheck // the message names the file
	}

	shown := noskillsfx.JSSlice(text, 0, 60)
	if noskillsfx.JSLength(text) > 60 {
		shown += "..."
	}

	writeln(out, green("✔"), " Learning recorded: ["+kind+"] "+shown)

	if looksLikeRule(lower) {
		writeln(out, dim("\n  Tip: This sounds like a permanent rule. Add --rule to enforce it in every spec."))
	}

	return clifx.ExitOK, nil
}

func looksLikeRule(lower string) bool {
	for _, word := range []string{"always ", "never ", "every time", "must ", "do not ", "convention:", "rule:"} {
		if strings.Contains(lower, word) {
			return true
		}
	}

	return strings.HasPrefix(lower, "use ")
}

func (l *lifecycleRun) rule(args []string) (int, error) {
	root, prefix := l.configuredPrefix()

	sub := ""
	if len(args) > 0 {
		sub = args[0]
	}

	switch sub {
	case "add":
		return l.ruleAdd(root, prefix, args[1:])
	case "list":
		l.ruleList(prefix, root)

		return clifx.ExitOK, nil
	case "promote":
		if strings.Join(args[1:], " ") == "" {
			writeln(l.e.stdout, red("Please provide the decision text to promote."))

			return clifx.ExitFailure, nil
		}

		return l.ruleAdd(root, prefix, args[1:])
	}

	writeln(l.e.stdout, "Usage: "+prefix+` rule <add "rule text" | list | promote "decision">`)

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) ruleAdd(root, prefix string, args []string) (int, error) {
	out := l.e.stdout

	var phases, appliesTo, textParts []string

	for _, arg := range args {
		switch {
		case strings.HasPrefix(arg, "--phases="):
			phases = nil
			for _, phase := range strings.Split(strings.TrimPrefix(arg, "--phases="), ",") {
				phases = append(phases, strings.TrimSpace(phase))
			}
		case strings.HasPrefix(arg, "--applies-to="):
			appliesTo = nil
			for _, pattern := range strings.Split(strings.TrimPrefix(arg, "--applies-to="), ",") {
				appliesTo = append(appliesTo, noskillsfx.StripRuleQuotes(strings.TrimSpace(pattern)))
			}
		case !strings.HasPrefix(arg, "-"):
			textParts = append(textParts, arg)
		}
	}

	text := strings.Join(textParts, " ")
	if text == "" {
		writeln(out, red("Please provide a rule: "), bold(prefix+` rule add "Use Deno Tests for all tests"`))

		return clifx.ExitFailure, nil
	}

	content := ""

	if len(phases) > 0 || len(appliesTo) > 0 {
		content += "---\n"
		if len(phases) > 0 {
			content += "phases: [" + strings.Join(phases, ", ") + "]\n"
		}

		if len(appliesTo) > 0 {
			quoted := make([]string, len(appliesTo))
			for i, pattern := range appliesTo {
				quoted[i] = `"` + pattern + `"`
			}

			content += "applies_to: [" + strings.Join(quoted, ", ") + "]\n"
		}

		content += "---\n"
	}

	if _, err := noskillsfx.WriteRuleFile(root, noskillsfx.RuleSlug(text), content+text+"\n"); err != nil {
		return 0, err //nolint:wrapcheck // the message names the file
	}

	var scope []string
	if len(phases) > 0 {
		scope = append(scope, strings.Join(phases, ", "))
	}

	if len(appliesTo) > 0 {
		scope = append(scope, strings.Join(appliesTo, ", "))
	}

	label := ""
	if len(scope) > 0 {
		label = " [" + strings.Join(scope, "; ") + "]"
	}

	writeln(out, green("✔"), " Rule added: ", dim(text), dim(label))

	synced, err := syncTools(root)
	if err != nil {
		return 0, err
	}

	if synced {
		writeln(out, dim("  Tool files synced."))
	}

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) ruleList(prefix, root string) {
	out := l.e.stdout
	rules := noskillsfx.LoadScopedRules(root)

	writeln(out, bold("Rules"))
	writeln(out, "")

	if len(rules) == 0 {
		writeln(out, dim("  No rules yet. Add one with: "+prefix+` rule add "..."`))

		return
	}

	for i, rule := range rules {
		scope := []string{"all phases", "all files"}
		if len(rule.Phases) > 0 {
			scope[0] = strings.Join(rule.Phases, ", ")
		}

		if len(rule.AppliesTo) > 0 {
			scope[1] = strings.Join(rule.AppliesTo, ", ")
		}

		writeln(out, "  "+strconv.Itoa(i+1)+". "+rule.Text+" ", dim("["+strings.Join(scope, ", ")+"]"))
	}
}

func (l *lifecycleRun) concern(args []string) (int, error) {
	root, prefix := l.configuredPrefix()

	sub := ""
	if len(args) > 0 {
		sub = args[0]
	}

	switch sub {
	case "add":
		return l.concernAdd(root, prefix, args[1:])
	case "remove":
		return l.concernRemove(root, prefix, args[1:])
	case "list":
		return l.concernList(root, args[1:])
	}

	writeln(l.e.stdout, "Usage: "+prefix+" concern <add <id> | remove <id> | list>")

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) concernAdd(root, prefix string, args []string) (int, error) {
	out := l.e.stdout

	var ids []string

	for _, arg := range args {
		if !strings.HasPrefix(arg, "-") {
			ids = append(ids, arg)
		}
	}

	section, initialized := noskillsfx.ReadManifestSection(root)

	if len(ids) == 0 {
		writeln(out, red("Please provide concern ID(s): "), bold(prefix+" concern add open-source beautiful-product"))

		return clifx.ExitFailure, nil
	}

	if !initialized {
		writeln(out, red("noskills not initialized."))

		return clifx.ExitFailure, nil
	}

	result, err := noskillsfx.ActivateConcerns(root, section, ids)
	if err != nil {
		return 0, err //nolint:wrapcheck // the message names the file
	}

	for _, message := range result.Messages {
		switch {
		case message.Unknown != "":
			writeln(out, red("Unknown concern: "+message.Unknown))
			writeln(out, dim("  Available: "+strings.Join(result.Available, ", ")))
		default:
			writeln(out, dim(`Concern "`+message.Active+`" is already active.`))
		}
	}

	if len(result.Added) > 0 {
		writeln(out, green("✔"), " Activated concerns: "+strings.Join(result.Added, ", "))
	}

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) concernRemove(root, prefix string, args []string) (int, error) {
	out := l.e.stdout
	section, initialized := noskillsfx.ReadManifestSection(root)

	if len(args) == 0 || args[0] == "" {
		writeln(out, red("Please provide a concern ID: "), bold(prefix+" concern remove move-fast"))

		return clifx.ExitFailure, nil
	}

	if !initialized {
		writeln(out, red("noskills not initialized."))

		return clifx.ExitFailure, nil
	}

	id := args[0]

	removed, err := noskillsfx.DeactivateConcern(root, section, id)
	if err != nil {
		return 0, err //nolint:wrapcheck // the message names the file
	}

	if !removed {
		writeln(out, dim(`Concern "`+id+`" is not active.`))

		return clifx.ExitOK, nil
	}

	writeln(out, green("✔"), " Deactivated concern: ", bold(id))

	return clifx.ExitOK, nil
}

func capitalize(s string) string {
	if s == "" {
		return s
	}

	first := noskillsfx.JSSlice(s, 0, 1)

	return strings.ToUpper(first) + s[len(first):]
}

func (l *lifecycleRun) concernList(root string, args []string) (int, error) {
	out := l.e.stdout

	list, err := noskillsfx.ListConcernsForCommand(root)
	if err != nil {
		return 0, err //nolint:wrapcheck // the message names the concern
	}

	if containsArg(args, "--json") {
		l.printJSON(list.JSON())

		return clifx.ExitOK, nil
	}

	writeln(out, bold("Concerns"), dim(" ("+strconv.Itoa(len(list.All))+" available, "+strconv.Itoa(len(list.Active))+" active)"))
	writeln(out, "")

	if len(list.All) == 0 {
		writeln(out, dim("  No concerns defined."))
	}

	for _, group := range list.Groups() {
		writeln(out, bold(capitalize(group.Category)+":"))

		for _, concern := range group.Concerns {
			id := noskillsfx.JSPadEnd(concern.ID, 24)
			if list.IsActive(concern.ID) {
				writeln(out, "  ", green("●"), " ", bold(id), dim(concern.Description))
			} else {
				writeln(out, "  ", dim("○"), " ", dim(id), dim(concern.Description))
			}
		}

		writeln(out, "")
	}

	if tensions := noskillsfx.DetectTensions(list.ActiveDefinitions()); len(tensions) > 0 {
		writeln(out, yellow("⚠ Tensions detected:"))

		for _, tension := range tensions {
			writeln(out, dim("  "+tension.Between[0]+" ↔ "+tension.Between[1]+": "+tension.Issue))
		}

		writeln(out, "")
	}

	return clifx.ExitOK, nil
}
