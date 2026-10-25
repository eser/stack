// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"errors"
	"slices"
	"strings"
)

// `noskills purge restore` (commands/purge-restore.ts, TASK-167): it lists
// the purge history and copies the chosen categories of an entry back. The
// entry stays in the history; a category whose content exists is left alone
// unless overwrite is set; the agent integration comes back through sync.

// RestoreRequest is what `purge restore` was asked to do. Entry is an entry
// id, "latest", or "" to list the entries; Categories nil means every
// category the entry kept.
type RestoreRequest struct {
	Entry      string
	Categories []PurgeCategory
	Overwrite  bool
}

// ErrRestoreArgs marks arguments `purge restore` does not accept.
var ErrRestoreArgs = errors.New("purge restore")

type restoreArgsError struct{ message string }

func (e *restoreArgsError) Error() string { return e.message }

func (e *restoreArgsError) Is(target error) bool { return target == ErrRestoreArgs }

// ParseRestoreArgs reads the arguments after `purge restore`, without the
// mode flags.
func ParseRestoreArgs(args []string) (RestoreRequest, error) {
	request := RestoreRequest{Entry: "", Categories: nil, Overwrite: false}

	var positional []string

	for _, arg := range args {
		switch {
		case arg == "--overwrite":
			request.Overwrite = true
		case strings.HasPrefix(arg, "-"):
			return request, &restoreArgsError{`purge restore: unknown flag "` + arg + `"; the only flag is --overwrite`}
		default:
			positional = append(positional, arg)
		}
	}

	if len(positional) == 0 {
		return request, nil
	}

	request.Entry = positional[0]
	names := positional[1:]

	var unknown []string

	for _, name := range names {
		if !IsPurgeCategory(name) {
			unknown = append(unknown, name)
		}
	}

	if len(unknown) > 0 {
		all := make([]string, 0, len(PurgeCategories()))
		for _, category := range PurgeCategories() {
			all = append(all, string(category))
		}

		return request, &restoreArgsError{`purge restore: unknown category "` + strings.Join(unknown, `", "`) +
			`"; the categories are ` + strings.Join(all, ", ")}
	}

	for _, name := range names {
		if !slices.Contains(request.Categories, PurgeCategory(name)) {
			request.Categories = append(request.Categories, PurgeCategory(name))
		}
	}

	return request, nil
}

// FindPurgeEntry is the entry id names: an id, or "latest" for the newest.
// entries are newest first.
func FindPurgeEntry(entries []HistoryEntry, id string) (HistoryEntry, bool) {
	if id == "latest" {
		if len(entries) == 0 {
			return HistoryEntry{}, false //nolint:exhaustruct // no entry
		}

		return entries[0], true
	}

	for _, entry := range entries {
		if entry.ID == id {
			return entry, true
		}
	}

	return HistoryEntry{}, false //nolint:exhaustruct // no entry
}

// CategoryRestore is what restoring one category did; Failed carries the
// message of a category that could not be restored.
type CategoryRestore struct {
	Category PurgeCategory
	Outcome  RestoreOutcome
	Failed   string
}

// RestorePurgeCategories restores the categories one after another, in
// PurgeCategories order. A refused or failed category does not stop the
// others.
func RestorePurgeCategories(root, entryID string, categories []PurgeCategory, overwrite bool) []CategoryRestore {
	var outcomes []CategoryRestore

	for _, category := range PurgeCategories() {
		if slices.Contains(categories, category) {
			outcomes = append(outcomes, restorePurgeCategory(root, entryID, category, overwrite))
		}
	}

	return outcomes
}

func restorePurgeCategory(root, entryID string, category PurgeCategory, overwrite bool) CategoryRestore {
	var (
		outcome RestoreOutcome
		err     error
	)

	switch category {
	case PurgeConcerns, PurgeSpecs, PurgeRules:
		outcome, err = RestorePaths(root, entryID, category, overwrite)
	case PurgeManifest:
		outcome, err = RestoreManifestSection(root, entryID, overwrite)
	case PurgeAgentIntegration:
		return restoreAgentIntegration(root, entryID, overwrite)
	}

	if err != nil {
		return CategoryRestore{Category: category, Outcome: RestoreOutcome{}, Failed: DescribeError(err)} //nolint:exhaustruct // a failure has no outcome
	}

	return CategoryRestore{Category: category, Outcome: outcome, Failed: ""}
}

// restoreAgentIntegration copies the agent files back, then runs sync for
// the tools the manifest lists, which puts back noskills' part of the files
// purge edited and brings the copied files up to date.
func restoreAgentIntegration(root, entryID string, overwrite bool) CategoryRestore {
	failed := func(message string) CategoryRestore {
		return CategoryRestore{Category: PurgeAgentIntegration, Outcome: RestoreOutcome{}, Failed: message} //nolint:exhaustruct // a failure has no outcome
	}

	section, ok := readManifestSection(root)

	var tools []any

	if ok {
		tools, ok = section.getOr("tools").([]any)
	}

	if !ok {
		return failed("sync sets the agent integration up from the noskills section of " + manifestFile +
			", and the project has none with a tools list; restore the manifest category too, or run noskills init")
	}

	outcome, err := RestorePaths(root, entryID, PurgeAgentIntegration, overwrite)
	if err != nil {
		return failed(DescribeError(err))
	}

	if outcome.Refused {
		return CategoryRestore{Category: PurgeAgentIntegration, Outcome: outcome, Failed: ""}
	}

	names := stringsOf(tools)

	synced, err := SyncAll(root, names, SyncConfigOf(section))
	if err != nil {
		return failed(DescribeError(err))
	}

	outcome.Synced = []string{}

	for _, id := range synced {
		if slices.Contains(names, id) {
			outcome.Synced = append(outcome.Synced, id)
		}
	}

	return CategoryRestore{Category: PurgeAgentIntegration, Outcome: outcome, Failed: ""}
}
