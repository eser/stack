// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"slices"
	"strconv"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// `noskills purge` and `noskills purge restore` (commands/purge.ts,
// commands/purge-restore.ts; TASK-167): noskillsfx finds, moves and
// restores the content, and this file asks, reports and sets the exit code
// as the TypeScript commands do.

// modeFlags are the flags stripModeFlag removes.
func stripModeFlags(args []string) []string {
	var out []string

	for _, arg := range args {
		if arg != "--agent" && arg != "--human" && arg != "--non-interactive" {
			out = append(out, arg)
		}
	}

	return out
}

// isAgentMode is detectMode: the first --agent or --human, else whether an
// agent tool runs the command.
func (l *lifecycleRun) isAgentMode(args []string) bool {
	for _, arg := range args {
		switch arg {
		case "--agent":
			return true
		case "--human":
			return false
		}
	}

	return l.lifecycleEnv(l.e.cwd).AgentToolOf() != ""
}

func purgeCategoryLabel(category noskillsfx.PurgeCategory) string {
	switch category {
	case noskillsfx.PurgeManifest:
		return "the noskills section of `manifest.yml`"
	case noskillsfx.PurgeAgentIntegration:
		return "agent integration"
	case noskillsfx.PurgeConcerns, noskillsfx.PurgeSpecs, noskillsfx.PurgeRules:
		return string(category)
	default:
		return string(category)
	}
}

func (l *lifecycleRun) purge(args []string) (int, error) { //nolint:cyclop,funlen,gocognit // the steps of commands/purge.ts, in order
	root := l.e.cwd
	clean := stripModeFlags(args)

	var positional []string

	for _, arg := range clean {
		if !strings.HasPrefix(arg, "-") {
			positional = append(positional, arg)
		}
	}

	// Checked before any flag, so `purge --force restore` never purges.
	if len(positional) > 0 && positional[0] == "restore" {
		at := slices.Index(args, "restore")

		return l.purgeRestore(slices.Delete(slices.Clone(args), at, at+1), root)
	}

	agent := l.isAgentMode(args)

	t := &tui{w: l.e.stdout, plain: false}
	if agent {
		t = &tui{w: l.e.stderr, plain: true}
	}

	var unknown []string

	for _, arg := range clean {
		if !strings.HasPrefix(arg, "-") || (arg != "--force" && arg != "--no-history") {
			unknown = append(unknown, arg)
		}
	}

	if len(unknown) > 0 {
		t.alert("ERROR", "✗", red, `purge: unknown argument "`+strings.Join(unknown, `", "`)+
			`"; purge takes --force and --no-history, or the restore subcommand`)

		return clifx.ExitFailure, nil
	}

	force := containsArg(clean, "--force")
	keepHistory := !containsArg(clean, "--no-history")

	if !force && agent {
		t.alert("ERROR", "✗", red, "Purge requires `--force` flag in agent mode.")

		return clifx.ExitFailure, nil
	}

	// Read before purge takes the noskills section out of the manifest.
	prefix := l.prefixOf(root)

	specNames := noskillsfx.ListSpecNames(root)
	detections := noskillsfx.DetectPurgeCategories(root, specNames, l.warn)

	var asked []noskillsfx.PurgeDetection

	for _, d := range detections {
		if d.Exists && d.Message != "" {
			asked = append(asked, d)
		}
	}

	var selected, kept []noskillsfx.PurgeCategory

	if force {
		for _, d := range detections {
			if d.Exists {
				selected = append(selected, d.Category)
			}
		}

		if len(selected) == 0 {
			t.alert("INFO", "ℹ", cyan, "Nothing to remove.")

			return clifx.ExitOK, nil
		}
	} else {
		if len(asked) == 0 {
			t.alert("INFO", "ℹ", cyan, "Nothing to remove.")

			return clifx.ExitOK, nil
		}

		for _, d := range asked {
			answer, cancelled := l.confirm(t, d.Message)
			if cancelled {
				t.alert("INFO", "ℹ", cyan, "Aborted.")

				return clifx.ExitOK, nil
			}

			if answer {
				selected = append(selected, d.Category)
			} else {
				kept = append(kept, d.Category)
			}
		}

		if len(selected) == 0 {
			t.alert("INFO", "ℹ", cyan, "Nothing selected for removal.")

			return clifx.ExitOK, nil
		}

		// The manifest section goes with any category the user confirmed.
		if detections[3].Exists {
			selected = append(selected, noskillsfx.PurgeManifest)
		}
	}

	entryID := ""

	if keepHistory {
		id, err := noskillsfx.NewPurgeEntryID(root, l.e.now())
		if err != nil {
			return 0, err //nolint:wrapcheck // the message names the folder
		}

		entryID = id
	}

	if force {
		t.step("Purging noskills content...")
	}

	outcomes := make([]noskillsfx.PurgeOutcome, len(selected))
	for i, category := range selected {
		outcomes[i] = noskillsfx.PurgeCategoryContent(root, category, entryID, specNames)
	}

	failed := false
	removedAny := false

	for _, outcome := range outcomes {
		label := purgeCategoryLabel(outcome.Category)

		if outcome.Removed {
			t.step("  Removed " + label)
		}

		for _, message := range outcome.Errors {
			t.alert("ERROR", "✗", red, "Could not remove "+label+": "+message)
		}

		failed = failed || len(outcome.Errors) > 0
		removedAny = removedAny || outcome.Removed
	}

	for _, category := range kept {
		t.step("  Kept " + purgeCategoryLabel(category))
	}

	summary := "Purge complete."
	if !force {
		summary = "Purge complete (" + strconv.Itoa(countRemoved(outcomes, asked)) + " of " + strconv.Itoa(len(asked)) +
			" categories removed)."
	}

	if failed {
		t.alert("WARN", "▲", yellow, summary+" Some content could not be removed.")
	} else {
		t.alert("OK", "✓", green, summary)
	}

	switch {
	case entryID != "":
		l.finishHistoryEntry(t, root, prefix, entryID, removedAny)
	case removedAny:
		l.reportNoHistory(t, root)
	}

	if failed {
		return clifx.ExitFailure, nil
	}

	return clifx.ExitOK, nil
}

// countRemoved is how many of the categories purge asked about were removed
// in full.
func countRemoved(outcomes []noskillsfx.PurgeOutcome, asked []noskillsfx.PurgeDetection) int {
	count := 0

	for _, outcome := range outcomes {
		isAsked := slices.ContainsFunc(asked, func(d noskillsfx.PurgeDetection) bool { return d.Category == outcome.Category })
		if isAsked && outcome.Removed && len(outcome.Errors) == 0 {
			count++
		}
	}

	return count
}

func (l *lifecycleRun) finishHistoryEntry(t *tui, root, prefix, entryID string, removedAny bool) {
	if !removedAny {
		// Nothing was moved into the entry; at most an empty folder is left.
		_ = noskillsfx.DropPurgeEntry(root, entryID)

		return
	}

	t.alert("INFO", "ℹ", cyan, "A copy is in "+noskillsfx.EntryPath(entryID)+"/. Restore it with: "+prefix+" purge restore "+entryID)

	dropped, err := noskillsfx.PrunePurgeHistory(root, noskillsfx.PurgeHistoryLimit)
	if err != nil {
		t.alert("WARN", "▲", yellow, "Could not drop the oldest purge history entries: "+noskillsfx.DescribeError(err)+
			". Remove the oldest folders in "+noskillsfx.PurgeHistoryDir+"/ yourself.")

		return
	}

	for _, id := range dropped {
		t.step("  Dropped the oldest purge history entry " + id + " (the history keeps " +
			strconv.Itoa(noskillsfx.PurgeHistoryLimit) + ")")
	}
}

func (l *lifecycleRun) reportNoHistory(t *tui, root string) {
	t.alert("INFO", "ℹ", cyan, "No copy kept (--no-history).")

	earlier, err := noskillsfx.ListPurgeEntries(root)
	if err != nil || len(earlier) == 0 {
		return
	}

	word := "entries"
	if len(earlier) == 1 {
		word = "entry"
	}

	t.alert("INFO", "ℹ", cyan, noskillsfx.PurgeHistoryDir+"/ still holds "+strconv.Itoa(len(earlier))+" earlier "+word+
		"; delete that folder to remove those copies too.")
}

const restoreUsage = "purge restore [entry_id|latest] [category ...] [--overwrite]"

func categoryNames(categories []noskillsfx.PurgeCategory) []string {
	names := make([]string, len(categories))
	for i, category := range categories {
		names[i] = string(category)
	}

	return names
}

func (l *lifecycleRun) purgeRestore(args []string, root string) (int, error) { //nolint:cyclop // the steps of purge-restore.ts main
	interactive := !l.isAgentMode(args) && !containsArg(args, "--non-interactive") && stdinIsTerminal(l.e)

	t := &tui{w: l.e.stderr, plain: true}
	if interactive {
		t = &tui{w: l.e.stdout, plain: false}
	}

	request, err := noskillsfx.ParseRestoreArgs(stripModeFlags(args))
	if err != nil {
		t.alert("ERROR", "✗", red, err.Error())

		return clifx.ExitFailure, nil
	}

	prefix := l.prefixOf(root)

	entries, err := noskillsfx.ListPurgeEntries(root)
	if err != nil {
		return 0, err //nolint:wrapcheck // the message names the folder
	}

	if request.Entry == "" {
		return l.listOrPickEntry(t, root, prefix, entries, request.Overwrite, interactive)
	}

	entry, found := noskillsfx.FindPurgeEntry(entries, request.Entry)
	if !found {
		if len(entries) == 0 {
			t.alert("ERROR", "✗", red, `purge restore: no purge history entry "`+request.Entry+`"; `+
				noskillsfx.PurgeHistoryDir+"/ holds no entries")
		} else {
			ids := make([]string, len(entries))
			for i, e := range entries {
				ids[i] = e.ID
			}

			t.alert("ERROR", "✗", red, `purge restore: no purge history entry "`+request.Entry+`"; the entries are `+
				strings.Join(ids, ", ")+`, or use "latest"`)
		}

		return clifx.ExitFailure, nil
	}

	var missing []noskillsfx.PurgeCategory

	for _, category := range request.Categories {
		if !slices.Contains(entry.Categories, category) {
			missing = append(missing, category)
		}
	}

	if len(missing) > 0 {
		t.alert("ERROR", "✗", red, "purge restore: entry "+entry.ID+" holds no "+strings.Join(categoryNames(missing), ", ")+
			"; it holds "+strings.Join(categoryNames(entry.Categories), ", "))

		return clifx.ExitFailure, nil
	}

	categories := request.Categories
	if categories == nil {
		categories = entry.Categories
	}

	return l.restoreAndReport(t, root, prefix, entry.ID, categories, request.Overwrite), nil
}

func (l *lifecycleRun) listOrPickEntry(t *tui, root, prefix string, entries []noskillsfx.HistoryEntry, overwrite, interactive bool) (int, error) {
	if len(entries) == 0 {
		t.alert("INFO", "ℹ", cyan, "No purge history: "+noskillsfx.PurgeHistoryDir+"/ holds no entries.")

		return clifx.ExitOK, nil
	}

	t.alert("INFO", "ℹ", cyan, "Purge history, newest first:")

	for _, entry := range entries {
		kept := "nothing kept"
		if len(entry.Categories) > 0 {
			kept = strings.Join(categoryNames(entry.Categories), ", ")
		}

		t.step("  " + entry.ID + "  " + kept)
	}

	if !interactive {
		t.alert("INFO", "ℹ", cyan, "Restore with: "+prefix+" "+restoreUsage)

		return clifx.ExitOK, nil
	}

	options := make([]choice, len(entries))
	for i, entry := range entries {
		hint := ""
		if i == 0 {
			hint = "latest"
		}

		options[i] = choice{value: entry.ID, label: entry.ID, hint: hint, disabled: false}
	}

	picked, cancelled := l.selectOne(t, "Which purge do you want to restore?", options)
	if cancelled {
		t.alert("INFO", "ℹ", cyan, "Aborted.")

		return clifx.ExitOK, nil
	}

	entry := entries[picked]

	categoryOptions := make([]choice, len(entry.Categories))
	for i, category := range entry.Categories {
		categoryOptions[i] = choice{value: string(category), label: string(category), hint: "", disabled: false}
	}

	chosen, cancelled := l.multiselect(t, "Which categories? (space to toggle, enter to confirm)", categoryOptions,
		categoryNames(entry.Categories), true)
	if cancelled {
		t.alert("INFO", "ℹ", cyan, "Aborted.")

		return clifx.ExitOK, nil
	}

	categories := make([]noskillsfx.PurgeCategory, len(chosen))
	for i, name := range chosen {
		categories[i] = noskillsfx.PurgeCategory(name)
	}

	return l.restoreAndReport(t, root, prefix, entry.ID, categories, overwrite), nil
}

// shownConflicts is how many conflicting paths a refusal names.
const shownConflicts = 5

func listPaths(paths []string) string {
	shown := strings.Join(paths[:min(len(paths), shownConflicts)], ", ")
	if rest := len(paths) - shownConflicts; rest > 0 {
		return shown + " and " + strconv.Itoa(rest) + " more"
	}

	return shown
}

func describeRestored(r *noskillsfx.CategoryRestore) string {
	files := strconv.Itoa(len(r.Outcome.Paths)) + " files"
	if len(r.Outcome.Paths) == 1 {
		files = "1 file"
	}

	synced := ""

	switch {
	case r.Outcome.Synced == nil:
	case len(r.Outcome.Synced) == 0:
		synced = ", no tools to sync"
	default:
		synced = ", synced " + strings.Join(r.Outcome.Synced, ", ")
	}

	return string(r.Category) + " (" + files + synced + ")"
}

func (l *lifecycleRun) restoreAndReport(t *tui, root, prefix, entryID string, categories []noskillsfx.PurgeCategory, overwrite bool) int {
	outcomes := noskillsfx.RestorePurgeCategories(root, entryID, categories, overwrite)
	incomplete := false

	for i := range outcomes {
		outcome := &outcomes[i]

		switch {
		case outcome.Failed != "":
			incomplete = true

			t.alert("ERROR", "✗", red, "Could not restore "+string(outcome.Category)+": "+outcome.Failed)
		case outcome.Outcome.Refused:
			incomplete = true
			conflicts := outcome.Outcome.Conflicts
			verb, pronoun := "exist", "them"

			if len(conflicts) == 1 {
				verb, pronoun = "exists", "it"
			}

			t.alert("WARN", "▲", yellow, "Did not restore "+string(outcome.Category)+": "+listPaths(conflicts)+" already "+verb+
				". Run "+prefix+" purge restore "+entryID+" "+string(outcome.Category)+" --overwrite to replace "+pronoun+".")
		default:
			t.step("  Restored " + describeRestored(outcome))

			if len(outcome.Outcome.Skipped) > 0 {
				t.alert("WARN", "▲", yellow, "Did not copy symbolic links from the entry: "+listPaths(outcome.Outcome.Skipped))
			}
		}
	}

	if incomplete {
		t.alert("WARN", "▲", yellow, "Restore from "+entryID+" is incomplete.")

		return clifx.ExitFailure
	}

	t.alert("OK", "✓", green, "Restored from "+entryID+". The entry stays in the purge history.")

	return clifx.ExitOK
}
