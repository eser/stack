// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"fmt"
	"io"
	"slices"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// `noskills init` (commands/init.ts): scaffold .eser/, detect the project,
// the coding tools and the AI providers, pick the tools and concerns, write
// the concerns, the manifest and the state, sync the tool files (CLAUDE.md,
// hooks, agents) through the noskillsfx sync adapters, and print what it
// did.

// tui writes @eserstack/shell/tui's lines: styled on stdout for a person,
// plain on stderr for an agent, so stdout keeps the JSON.
type tui struct {
	w     io.Writer
	plain bool
}

func (t *tui) style(f func(string) string, text string) string {
	if t.plain {
		return text
	}

	return f(text)
}

func (t *tui) line(parts ...string) {
	if t.plain {
		_, _ = io.WriteString(t.w, strings.Join(parts, "")+"\n")

		return
	}

	writeln(t.w, parts...)
}

func (t *tui) raw(parts ...string) {
	if t.plain {
		_, _ = io.WriteString(t.w, strings.Join(parts, ""))

		return
	}

	write(t.w, parts...)
}

func (t *tui) intro(title string) {
	t.line(t.style(gray, "┌"), "  ", t.style(bold, title))
	t.line(t.style(gray, "│"))
}

func (t *tui) gap() { t.line(t.style(gray, "│")) }

func (t *tui) step(message string) {
	t.line(t.style(dim, "◇"), "  ", t.style(dim, message))
}

// alert is span.alert: a colored icon in a terminal, a [TAG] in plain text.
func (t *tui) alert(tag, icon string, color func(string) string, message string) {
	if t.plain {
		t.line("[" + tag + "] " + message)

		return
	}

	t.line(color(icon) + " " + message)
}

// spinner returns the spinner's succeed: the line cleared, then a done line.
func (t *tui) spinner(initial string) func(message string) {
	return func(message string) {
		t.raw("\r" + strings.Repeat(" ", len([]rune(initial))+4) + "\r")
		t.line(t.style(green, "◇"), "  "+message)
	}
}

func (t *tui) outro(message string) {
	t.line(t.style(gray, "│"))
	t.line(t.style(gray, "└"), "  ", message)
}

func (t *tui) detached(message string) {
	t.line("   ", t.style(dim, message))
}

type choice struct {
	value, label, hint string
	disabled           bool
}

// multiselect is tui.multiselect: the arrow keys (or j and k) move, Space
// toggles, a toggles all, Enter accepts; Escape cancels, and so does the end
// of the input. cancelled is set when nothing was accepted.
func (l *lifecycleRun) multiselect(t *tui, message string, options []choice, initial []string, required bool) ([]string, bool) { //nolint:cyclop,funlen,gocognit // the key handling of multiselect.ts
	selected := map[int]bool{}

	for i, opt := range options {
		if slices.Contains(initial, opt.value) {
			selected[i] = true
		}
	}

	cursor := 0
	move := func(from, direction int) int {
		next := from
		for range options {
			next = (next + direction + len(options)) % len(options)
			if !options[next].disabled {
				return next
			}
		}

		return from
	}

	if options[cursor].disabled {
		cursor = move(cursor, 1)
	}

	frame := func(errorText string) int {
		header := t.style(cyan, "◆")
		if errorText != "" {
			header = t.style(yellow, "▲")
		}

		t.line(header, "  "+message)

		for i, opt := range options {
			box := t.style(dim, "◻")
			if selected[i] {
				box = t.style(green, "◼")
			}

			label := t.style(dim, " "+opt.label)
			if !opt.disabled && i == cursor {
				label = " " + opt.label
			}

			hint := ""
			if opt.hint != "" {
				hint = t.style(dim, "  ("+opt.hint+")")
			}

			t.line(t.style(dim, "│"), "  ", box, label, hint)
		}

		if errorText != "" {
			t.line(t.style(dim, "└"), "  ", t.style(yellow, errorText))
		} else {
			t.line(t.style(dim, "└"))
		}

		return len(options) + 2
	}

	clear := func(lines int) { t.raw(fmt.Sprintf("\x1b[%dA\x1b[J", lines)) }

	t.raw("\x1b[?25l")
	defer t.raw("\x1b[?25h")

	restore := func() {}
	if l.e.rawInput != nil {
		restore = l.e.rawInput()
	}

	defer restore()

	lines := frame("")
	buf := make([]byte, 64)

	for {
		n, err := l.e.stdin.Read(buf)
		if n == 0 && err != nil {
			return nil, true
		}

		if n == 0 {
			continue
		}

		key := string(buf[:n])

		switch key {
		case "\x03":
			t.raw("\x1b[?25h")
			restore()
			l.exit(130)

			return nil, true
		case "\x1b":
			clear(lines)
			t.line(t.style(red, "■"), "  "+message)

			return nil, true
		case "\r", "\n":
			var values, labels []string

			for i, opt := range options {
				if selected[i] {
					values = append(values, opt.value)
					labels = append(labels, opt.label)
				}
			}

			if required && len(values) == 0 {
				clear(lines)
				lines = frame("Please select at least one option.")

				continue
			}

			clear(lines)
			t.line(t.style(green, "◇"), "  "+message, t.style(dim, " · "+strings.Join(labels, ", ")))

			return values, false
		}

		changed := true

		switch key {
		case "\x1b[A", "k":
			cursor = move(cursor, -1)
		case "\x1b[B", "j":
			cursor = move(cursor, 1)
		case " ":
			if !options[cursor].disabled {
				selected[cursor] = !selected[cursor]
			}
		case "a":
			all := true

			for i, opt := range options {
				if !opt.disabled && !selected[i] {
					all = false
				}
			}

			for i, opt := range options {
				if !opt.disabled {
					selected[i] = !all
				}
			}
		default:
			changed = false
		}

		if changed {
			clear(lines)
			lines = frame("")
		}
	}
}

// listFlag is parseListFlag: the comma-separated values of --flag=, or nil
// (and false) when the flag is absent.
func listFlag(args []string, flag string) ([]string, bool) {
	for _, arg := range args {
		if value, found := strings.CutPrefix(arg, flag+"="); found {
			var items []string

			for _, item := range strings.Split(value, ",") {
				if item = strings.TrimSpace(item); item != "" {
					items = append(items, item)
				}
			}

			return items, true
		}
	}

	return nil, false
}

func uniqueStrings(items []string) []string {
	var out []string

	for _, item := range items {
		if !slices.Contains(out, item) {
			out = append(out, item)
		}
	}

	return out
}

// commandPrefix is extractPrefix: NOSKILLS_CLI_PREFIX, else the command
// that runs this binary, else the default.
func (l *lifecycleRun) commandPrefix() string {
	if value, ok := l.e.lookupEnv(envCLIPrefix); ok {
		if prefix := strings.TrimSpace(value); prefix != "" && !strings.ContainsAny(prefix, "\r\n") {
			return prefix
		}
	}

	if self := selfCommand(l.e); self != "" {
		return self
	}

	return noskillsfx.DefaultCommandPrefix
}

func (l *lifecycleRun) initCommand(ctx context.Context, args []string) (int, error) { //nolint:cyclop,funlen,gocognit,maintidx // the steps of commands/init.ts, in order
	root := l.e.cwd
	agent := false

	for _, arg := range args {
		if arg == "--agent" || arg == "--human" {
			agent = arg == "--agent"

			break
		}
	}

	if !containsArg(args, "--agent") && !containsArg(args, "--human") {
		agent = l.lifecycleEnv(root).AgentToolOf() != ""
	}

	// --non-interactive is read before the mode flags are stripped, so it
	// skips the questions in the human mode too.
	nonInteractive := containsArg(args, "--non-interactive") || agent

	t := &tui{w: l.e.stdout, plain: false}
	if nonInteractive {
		t = &tui{w: l.e.stderr, plain: true}
	}

	var clean []string

	for _, arg := range args {
		if arg != "--agent" && arg != "--human" && arg != "--non-interactive" {
			clean = append(clean, arg)
		}
	}

	parsedConcerns, hasConcerns := listFlag(clean, "--concerns")
	parsedTools, hasTools := listFlag(clean, "--tools")
	alreadyInitialized := noskillsfx.IsHookInitialized(root)
	lifecycle := l.lifecycleEnv(root)

	t.intro("noskills init")

	done := t.spinner("Checking directories...")
	if err := noskillsfx.ScaffoldEserDirNotifying(root, func(text string) { _, _ = io.WriteString(l.e.stderr, text+"\n") }); err != nil {
		return 0, err //nolint:wrapcheck // the message names the directory
	}

	done("Config: .eser/")

	done = t.spinner("Scanning project...")
	project := noskillsfx.DetectProject(root)
	done("Project scanned")

	for _, key := range []string{"languages", "frameworks"} {
		value, _ := project.Get(key)
		items, _ := value.([]any)

		for _, item := range items {
			t.step("  " + noskillsfx.DisplayValue(item))
		}
	}

	t.gap()

	done = t.spinner("Detecting coding tools...")
	detected := noskillsfx.DetectCodingTools(root)
	current := lifecycle.AgentToolOf()

	var guaranteed []string
	if current != "" && !slices.Contains(detected, current) {
		guaranteed = []string{current}
	}

	allDetected := uniqueStrings(append(append([]string{}, guaranteed...), detected...))
	done(itoa(len(allDetected)) + " coding tool(s) detected")

	existing := noskillsfx.ReadHookManifest(root)

	var tools []string

	switch {
	case hasTools:
		var valid []string

		for _, tool := range parsedTools {
			if slices.Contains(noskillsfx.CodingToolIDs(), tool) {
				valid = append(valid, tool)
			}
		}

		tools = uniqueStrings(append(append([]string{}, guaranteed...), valid...))
	case alreadyInitialized:
		tools = existing.Tools
		if !existing.Present {
			tools = allDetected
		}
	case nonInteractive:
		tools = allDetected
	default:
		t.gap()
		tools = l.pickCodingTools(t, allDetected, current)
	}

	t.gap()

	done = t.spinner("Detecting AI providers...")
	providers := noskillsfx.DetectProviders(noskillsfx.ProviderProbe{
		HasBinary:       func(name string) bool { _, err := l.e.lookPath(name); return err == nil },
		OllamaReachable: func() bool { return l.e.ollamaReachable != nil && l.e.ollamaReachable(ctx) },
		LookupEnv:       l.e.lookupEnv,
	})
	done(itoa(len(providers)) + " provider(s) detected")

	t.gap()

	defaults, err := noskillsfx.DefaultConcernObjects()
	if err != nil {
		return 0, err //nolint:wrapcheck // the message names the concern
	}

	var canonical []string
	for _, concern := range defaults {
		canonical = append(canonical, concern.Definition.ID)
	}

	var concerns []string

	switch {
	case hasConcerns:
		for _, id := range canonical {
			if slices.Contains(parsedConcerns, id) {
				concerns = append(concerns, id)
			}
		}
	case alreadyInitialized:
		concerns = existing.Concerns
	case nonInteractive:
	default:
		options := make([]choice, len(defaults))
		for i, concern := range defaults {
			options[i] = choice{value: concern.Definition.ID, label: concern.Definition.Name,
				hint: sliceUnits(concern.Definition.Description, 60)}
		}

		concerns, _ = l.multiselect(t, "What kind of project is this? (space to toggle, enter to confirm)", options, nil, true)
	}

	if len(concerns) > 0 {
		t.alert("OK", "✓", green, " Concerns: "+strings.Join(concerns, ", "))
	}

	t.gap()

	plan := &noskillsfx.InitPlan{
		Concerns: concerns, Tools: tools, Providers: providers, Project: project, Command: l.commandPrefix(),
	}
	if err := noskillsfx.WriteInit(root, plan, alreadyInitialized); err != nil {
		return 0, err //nolint:wrapcheck // the message names the file
	}

	if len(tools) > 0 {
		done = t.spinner("Syncing tool files...")

		synced, err := noskillsfx.SyncAll(root, tools, noskillsfx.SyncConfig{CommandPrefix: plan.Command, AllowGit: false})
		if err != nil {
			return 0, err //nolint:wrapcheck // the message names the tool and the file
		}

		done("Synced " + itoa(len(synced)) + " tool(s)")

		for _, id := range synced {
			t.step("  " + id)
		}
	}

	if len(noskillsfx.ToolsWithHooks(tools)) > 0 {
		if warning := noskillsfx.NetworkCommandWarning(plan.Command); warning != "" {
			t.alert("WARN", "▲", yellow, warning)
		}
	}

	t.outro("Done. " + itoa(len(tools)) + " tool(s), " + itoa(len(providers)) + " provider(s), " + itoa(len(concerns)) + " concern(s).")

	if agent {
		out, err := noskillsfx.InitIdleOutput(root, plan, l.e.now)
		if err != nil {
			return 0, err //nolint:wrapcheck // the message says what failed
		}

		l.printJSON(out)

		return clifx.ExitOK, nil
	}

	if hasActiveSpec(root, l.warn) {
		t.line("")
		t.detached("Start a spec with: " + plan.Command + ` spec new "..."`)

		return clifx.ExitOK, nil
	}

	count := itoa(len(concerns))
	if len(count) < 2 {
		count = " " + count
	}

	t.line("")
	t.detached("✔ noskills is ready")
	t.line("")
	t.detached("  Your project has:")
	t.detached("    • " + count + " active concerns shaping every spec")
	t.detached("    • Hooks enforcing quality gates")

	if len(tools) > 0 {
		t.detached("    • Rules synced to your coding tools")
	}

	t.line("")
	t.detached("  To start your first spec:")
	t.detached("    1. Switch to PLAN MODE in your coding tool")
	t.detached("       (Claude Code: Shift+Tab twice)")
	t.detached("    2. Describe what you want to build")
	t.detached("    3. noskills will guide you through discovery")
	t.line("")
	t.detached("  Or just type: " + plan.Command + ` spec new "your feature description"`)

	return clifx.ExitOK, nil
}

func sliceUnits(s string, n int) string {
	units := []rune(s)
	if len(units) <= n {
		return s
	}

	return string(units[:n])
}

func (l *lifecycleRun) pickCodingTools(t *tui, detected []string, current string) []string {
	labels := map[string]string{
		noskillsfx.CodingToolClaudeCode: "Claude Code", noskillsfx.CodingToolCursor: "Cursor", noskillsfx.CodingToolKiro: "Kiro",
		noskillsfx.CodingToolCopilot: "GitHub Copilot", noskillsfx.CodingToolWindsurf: "Windsurf",
		noskillsfx.CodingToolOpencode: "OpenCode", noskillsfx.CodingToolCodex: "Codex CLI", noskillsfx.CodingToolCopilotCLI: "Copilot CLI",
	}

	message := "Any additional tools? (space to toggle, enter to skip)"
	if len(detected) == 0 {
		message = "No coding tools detected. Which tools do you use? (space to toggle)"
	}

	options := make([]choice, 0, len(noskillsfx.CodingToolIDs()))

	for _, id := range noskillsfx.CodingToolIDs() {
		hint := ""

		switch {
		case id == current:
			hint = "you're running inside it"
		case slices.Contains(detected, id):
			hint = "detected"
		}

		options = append(options, choice{value: id, label: labels[id], hint: hint, disabled: id == current})
	}

	selected, cancelled := l.multiselect(t, message, options, detected, false)
	if cancelled {
		return append([]string{}, detected...)
	}

	if current != "" && !slices.Contains(selected, current) {
		selected = append([]string{current}, selected...)
	}

	return selected
}

// hasActiveSpec reports whether a spec state is in a phase of an active
// spec, which turns the onboarding banner into a one-line hint.
func hasActiveSpec(root string, warn noskillsfx.StateWarner) bool {
	active := []string{
		noskillsfx.PhaseDiscovery, noskillsfx.PhaseDiscoveryRefinement, noskillsfx.PhaseSpecProposal,
		noskillsfx.PhaseSpecApproved, noskillsfx.PhaseExecuting, noskillsfx.PhaseBlocked,
	}

	for _, entry := range noskillsfx.ListSpecStateObjects(root, warn) {
		phase, _ := entry.State.Get("phase")
		if name, ok := phase.(string); ok && slices.Contains(active, name) {
			return true
		}
	}

	return false
}
