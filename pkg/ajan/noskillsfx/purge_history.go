// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

// The purge history (state/purge-history.ts, TASK-167): `noskills purge`
// moves what it removes into .eser/.state/purge-history/<entry id>/, one
// folder per category that keeps each path where it was in the project, and
// `noskills purge restore` copies it back. The manifest category keeps the
// noskills section as manifest/noskills.yml. An agent-integration folder
// with no files still records that purge took noskills' part out of the
// files it shares with the user; restore puts that back by running sync.

// PurgeCategory is a kind of noskills content purge removes.
type PurgeCategory string

// The categories, in the order restore puts them back: sync, which restores
// the agent integration, reads the rules and the manifest restored first.
const (
	PurgeConcerns         PurgeCategory = "concerns"
	PurgeSpecs            PurgeCategory = "specs"
	PurgeRules            PurgeCategory = "rules"
	PurgeManifest         PurgeCategory = "manifest"
	PurgeAgentIntegration PurgeCategory = "agent-integration"
)

// PurgeCategories lists every category in restore order.
func PurgeCategories() []PurgeCategory {
	return []PurgeCategory{PurgeConcerns, PurgeSpecs, PurgeRules, PurgeManifest, PurgeAgentIntegration}
}

// IsPurgeCategory reports whether name is a category.
func IsPurgeCategory(name string) bool {
	return slices.Contains(PurgeCategories(), PurgeCategory(name))
}

// PurgeHistoryLimit is how many entries the history keeps; purge drops the
// oldest beyond it.
const PurgeHistoryLimit = 5

// PurgeHistoryDir is the history folder, relative to the project.
const PurgeHistoryDir = stateDir + "/purge-history"

const manifestSectionFile = "manifest/noskills.yml"

// AgentIntegrationFiles are the files sync writes that only noskills uses,
// which purge removes whole. The files it shares with the user keep the
// user's content; purge takes only noskills' part out of them.
func AgentIntegrationFiles() []string {
	return []string{
		".claude/agents/noskills-executor.md",
		".claude/agents/noskills-verifier.md",
		".codex/agents/noskills-executor.toml",
		".codex/agents/noskills-verifier.toml",
		".cursorrules",
		".windsurfrules",
		".github/copilot-instructions.md",
		".github/agents/noskills-executor.agent.md",
		".github/agents/noskills-verifier.agent.md",
		".github/hooks/noskills.json",
		".kiro/agents/noskills-executor.json",
		".kiro/agents/noskills-verifier.json",
		".kiro/hooks/noskills.json",
		".kiro/steering/conventions.md",
		".kiro/steering/noskills-coaching.md",
		".kiro/steering/noskills-protocol.md",
		".kiro/steering/noskills-rules.md",
		".opencode/agents/noskills-executor.md",
		".opencode/agents/noskills-verifier.md",
		".opencode/plugins/noskills.ts",
	}
}

// SpecMirrorFiles are the copies of one spec that sync writes for Kiro and
// OpenCode.
func SpecMirrorFiles(specName string) []string {
	return []string{
		".kiro/specs/" + specName + "/requirements.md",
		".kiro/specs/" + specName + "/design.md",
		".kiro/specs/" + specName + "/tasks.md",
		".opencode/skills/" + specName + ".md",
	}
}

// CategoryPaths are the project paths purge moves for a category; the
// manifest has none (purge edits the manifest), and the agent integration
// also takes the spec copies.
func CategoryPaths(category PurgeCategory) []string {
	switch category {
	case PurgeConcerns:
		return []string{concernsDir}
	case PurgeSpecs:
		return []string{specsDir, progressesDir}
	case PurgeRules:
		return []string{rulesDir}
	case PurgeAgentIntegration:
		return AgentIntegrationFiles()
	case PurgeManifest:
		return nil
	default:
		return nil
	}
}

// PurgeHistoryError is a history entry that could not be written, read or
// restored.
type PurgeHistoryError struct {
	EntryID string
	Message string
	Cause   error
}

func (e *PurgeHistoryError) Error() string {
	return e.Message
}

func (e *PurgeHistoryError) Unwrap() error {
	return e.Cause
}

// DescribeError is describeError: the message and the messages of its
// causes, joined by ": ", at most five deep.
func DescribeError(err error) string {
	var messages []string

	for current := err; current != nil && len(messages) < 5; {
		// Only a PurgeHistoryError's own cause is followed, as describeError
		// follows `cause`; the file system errors carry their whole text.
		if history, ok := current.(*PurgeHistoryError); ok { //nolint:errorlint // the outer error itself, not one it wraps
			messages = append(messages, history.Message)
			current = history.Cause

			continue
		}

		messages = append(messages, current.Error())

		break
	}

	return strings.Join(messages, ": ")
}

var entryIDPattern = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(?:-([2-9]|[1-9]\d+))?$`) //nolint:gochecknoglobals // compiled once

// IsEntryID reports whether name has the form of an entry id.
func IsEntryID(name string) bool {
	return entryIDPattern.MatchString(name)
}

// EntryIDFor is entryIdFor: the UTC time with ":" and "." as "-" (Windows
// refuses ":" in names), with the first free suffix from "-2" on when an id
// in taken has that time.
func EntryIDFor(now time.Time, taken map[string]bool) string {
	base := strings.Replace(now.UTC().Format("2006-01-02T15-04-05.000Z"), ".", "-", 1)
	id := base

	for suffix := 2; taken[id]; suffix++ {
		id = base + "-" + strconv.Itoa(suffix)
	}

	return id
}

func entryIDParts(id string) (string, int) {
	match := entryIDPattern.FindStringSubmatch(id)
	if match == nil {
		return id, 0
	}

	if match[2] == "" {
		return match[1], 1
	}

	n, _ := strconv.Atoi(match[2])

	return match[1], n
}

// CompareEntryIDs orders entry ids from the oldest purge to the newest.
func CompareEntryIDs(a, b string) int {
	timeA, suffixA := entryIDParts(a)
	timeB, suffixB := entryIDParts(b)

	if timeA != timeB {
		return strings.Compare(timeA, timeB)
	}

	return suffixA - suffixB
}

// EntriesBeyondLimit are the ids to drop, oldest first, so that the newest
// limit remain.
func EntriesBeyondLimit(ids []string, limit int) []string {
	oldestFirst := slices.Clone(ids)
	slices.SortStableFunc(oldestFirst, CompareEntryIDs)

	return oldestFirst[:max(0, len(oldestFirst)-limit)]
}

// EntryPath is an entry's folder, relative to the project.
func EntryPath(entryID string) string {
	return PurgeHistoryDir + "/" + entryID
}

// projectPath joins a "/" project path to the root.
func projectPath(root, rel string) string {
	return filepath.Join(root, filepath.FromSlash(rel))
}

// PathExists reports whether something is at path; a symbolic link counts
// even when its target is gone.
func PathExists(p string) (bool, error) {
	_, err := os.Lstat(p)
	if err == nil {
		return true, nil
	}

	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}

	return false, err //nolint:wrapcheck // the caller names the path
}

func listEntryIDs(root string) ([]string, error) {
	entries, err := os.ReadDir(projectPath(root, PurgeHistoryDir))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}

	if err != nil {
		return nil, fmt.Errorf("list %s: %w", PurgeHistoryDir, err)
	}

	var ids []string

	for _, entry := range entries {
		if entry.IsDir() && IsEntryID(entry.Name()) {
			ids = append(ids, entry.Name())
		}
	}

	return ids, nil
}

// HistoryEntry is one purge and the categories it kept.
type HistoryEntry struct {
	ID         string
	Categories []PurgeCategory
}

func keptCategories(root, entryID string) ([]PurgeCategory, error) {
	dir := projectPath(root, EntryPath(entryID))

	var kept []PurgeCategory

	for _, category := range PurgeCategories() {
		target := filepath.Join(dir, string(category))
		if category == PurgeManifest {
			target = filepath.Join(dir, filepath.FromSlash(manifestSectionFile))
		}

		exists, err := PathExists(target)
		if err != nil {
			return nil, err
		}

		if exists {
			kept = append(kept, category)
		}
	}

	return kept, nil
}

// ListPurgeEntries returns the entries, newest first.
func ListPurgeEntries(root string) ([]HistoryEntry, error) {
	ids, err := listEntryIDs(root)
	if err != nil {
		return nil, err
	}

	entries := make([]HistoryEntry, 0, len(ids))

	for _, id := range ids {
		categories, err := keptCategories(root, id)
		if err != nil {
			return nil, err
		}

		entries = append(entries, HistoryEntry{ID: id, Categories: categories})
	}

	slices.SortStableFunc(entries, func(a, b HistoryEntry) int { return CompareEntryIDs(b.ID, a.ID) })

	return entries, nil
}

// NewPurgeEntryID is a free id for a purge at now; nothing is created
// until purge keeps a path.
func NewPurgeEntryID(root string, now time.Time) (string, error) {
	ids, err := listEntryIDs(root)
	if err != nil {
		return "", err
	}

	taken := map[string]bool{}
	for _, id := range ids {
		taken[id] = true
	}

	return EntryIDFor(now, taken), nil
}

// PrunePurgeHistory removes the oldest entries so that limit remain, and
// returns their ids.
func PrunePurgeHistory(root string, limit int) ([]string, error) {
	ids, err := listEntryIDs(root)
	if err != nil {
		return nil, err
	}

	dropped := EntriesBeyondLimit(ids, limit)

	for _, id := range dropped {
		if err := os.RemoveAll(projectPath(root, EntryPath(id))); err != nil {
			return nil, fmt.Errorf("remove %s: %w", EntryPath(id), err)
		}
	}

	return dropped, nil
}

// DropPurgeEntry removes one entry and what it holds.
func DropPurgeEntry(root, entryID string) error {
	if err := os.RemoveAll(projectPath(root, EntryPath(entryID))); err != nil {
		return fmt.Errorf("remove %s: %w", EntryPath(entryID), err)
	}

	return nil
}

// keepPath moves a project path into the entry, under category. The entry
// is inside the project's .eser/, so the rename stays on one file system.
func keepPath(root, entryID string, category PurgeCategory, rel string) error {
	destination := filepath.Join(projectPath(root, EntryPath(entryID)), string(category), filepath.FromSlash(rel))

	fail := func(err error) error {
		return &PurgeHistoryError{EntryID: entryID, Message: "keep " + rel + " in purge history entry " + entryID, Cause: err}
	}

	if err := os.MkdirAll(filepath.Dir(destination), 0o750); err != nil {
		return fail(err)
	}

	if err := os.Rename(projectPath(root, rel), destination); err != nil {
		return fail(err)
	}

	return nil
}

// markCategory creates the category's folder, so the entry lists it even
// when purge edited files instead of moving them.
func markCategory(root, entryID string, category PurgeCategory) error {
	if err := os.MkdirAll(filepath.Join(projectPath(root, EntryPath(entryID)), string(category)), 0o750); err != nil {
		return &PurgeHistoryError{
			EntryID: entryID, Message: "record " + string(category) + " in purge history entry " + entryID, Cause: err,
		}
	}

	return nil
}

// keepManifestSection writes the noskills section's text into the entry.
func keepManifestSection(root, entryID, sectionText string) error {
	file := filepath.Join(projectPath(root, EntryPath(entryID)), filepath.FromSlash(manifestSectionFile))

	fail := func(err error) error {
		return &PurgeHistoryError{
			EntryID: entryID,
			Message: "keep the noskills section of " + manifestFile + " in purge history entry " + entryID,
			Cause:   err,
		}
	}

	if err := os.MkdirAll(filepath.Dir(file), 0o750); err != nil {
		return fail(err)
	}

	if err := os.WriteFile(file, []byte(sectionText), 0o644); err != nil { //nolint:gosec // G306: the copy of a project file
		return fail(err)
	}

	return nil
}

// RestoreOutcome is what restoring one category did: the project paths it
// wrote and the symbolic links it did not copy, or, when Refused, the paths
// that exist and would be replaced.
type RestoreOutcome struct {
	Refused   bool
	Paths     []string
	Skipped   []string
	Conflicts []string
	// Synced are the tools sync set up, for the agent integration; nil when
	// the category ran no sync.
	Synced []string
}

type storedFiles struct {
	files, dirs, links []string
}

// listStoredFiles walks a category folder: the project paths of its files
// and folders, and of the symbolic links, which restore does not copy.
func listStoredFiles(categoryDir string) (storedFiles, error) {
	var stored storedFiles

	exists, err := PathExists(categoryDir)
	if err != nil || !exists {
		return stored, err
	}

	err = filepath.WalkDir(categoryDir, func(p string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		if p == categoryDir {
			return nil
		}

		rel, err := filepath.Rel(categoryDir, p)
		if err != nil {
			return err //nolint:wrapcheck // WalkDir returns it as it is
		}

		rel = filepath.ToSlash(rel)

		switch {
		case entry.Type()&fs.ModeSymlink != 0:
			stored.links = append(stored.links, rel)
		case entry.IsDir():
			stored.dirs = append(stored.dirs, rel)
		case entry.Type().IsRegular():
			stored.files = append(stored.files, rel)
		}

		return nil
	})

	slices.Sort(stored.files)
	slices.Sort(stored.dirs)
	slices.Sort(stored.links)

	return stored, err //nolint:wrapcheck // the caller wraps it in a PurgeHistoryError
}

func copyFileKeepingMode(from, to string) error {
	info, err := os.Stat(from)
	if err != nil {
		return err //nolint:wrapcheck // the caller wraps it in a PurgeHistoryError
	}

	data, err := os.ReadFile(from) //nolint:gosec // G304: a file of the project's purge history
	if err != nil {
		return err //nolint:wrapcheck // the caller wraps it in a PurgeHistoryError
	}

	return os.WriteFile(to, data, info.Mode().Perm()) //nolint:wrapcheck,gosec // G703: a project path from the entry's own walk; the caller wraps the error
}

// RestorePaths copies the files an entry keeps for a moved category back
// into the project. When any of them exists and overwrite is false, nothing
// is written and the outcome lists those paths. The entry stays.
func RestorePaths(root, entryID string, category PurgeCategory, overwrite bool) (RestoreOutcome, error) {
	categoryDir := filepath.Join(projectPath(root, EntryPath(entryID)), string(category))

	outcome, err := restorePaths(root, categoryDir, overwrite)
	if err != nil {
		return outcome, &PurgeHistoryError{
			EntryID: entryID,
			Message: "restore " + string(category) + " from purge history entry " + entryID,
			Cause:   err,
		}
	}

	return outcome, nil
}

func restorePaths(root, categoryDir string, overwrite bool) (RestoreOutcome, error) {
	stored, err := listStoredFiles(categoryDir)
	if err != nil {
		return RestoreOutcome{}, err //nolint:exhaustruct // a failure has no outcome
	}

	if !overwrite {
		var conflicts []string

		for _, rel := range stored.files {
			exists, err := PathExists(projectPath(root, rel))
			if err != nil {
				return RestoreOutcome{}, err //nolint:exhaustruct // a failure has no outcome
			}

			if exists {
				conflicts = append(conflicts, rel)
			}
		}

		if len(conflicts) > 0 {
			return RestoreOutcome{Refused: true, Conflicts: conflicts}, nil //nolint:exhaustruct // a refusal writes nothing
		}
	}

	for _, rel := range stored.files {
		target := projectPath(root, rel)

		if err := os.MkdirAll(filepath.Dir(target), 0o750); err != nil {
			return RestoreOutcome{}, err //nolint:exhaustruct,wrapcheck // the caller wraps it
		}

		if err := copyFileKeepingMode(filepath.Join(categoryDir, filepath.FromSlash(rel)), target); err != nil {
			return RestoreOutcome{}, err //nolint:exhaustruct // a failure has no outcome
		}
	}

	// Folders that held no files, such as the concerns folder init creates;
	// parents sort before their children.
	for _, rel := range stored.dirs {
		if err := os.MkdirAll(projectPath(root, rel), 0o750); err != nil {
			return RestoreOutcome{}, err //nolint:exhaustruct,wrapcheck // the caller wraps it
		}
	}

	return RestoreOutcome{Paths: nonNil(stored.files), Skipped: stored.links}, nil //nolint:exhaustruct // a restore has no conflicts
}

func nonNil(items []string) []string {
	if items == nil {
		return []string{}
	}

	return items
}

// RestoreManifestSection puts the kept noskills section back into
// .eser/manifest.yml, creating the file when the project has none. A
// manifest that already has a section is left alone unless overwrite.
func RestoreManifestSection(root, entryID string, overwrite bool) (RestoreOutcome, error) {
	failure := func(message string, cause error) error {
		return &PurgeHistoryError{
			EntryID: entryID,
			Message: "restore manifest from purge history entry " + entryID + ": " + message,
			Cause:   cause,
		}
	}

	storedText, err := os.ReadFile(filepath.Join(projectPath(root, EntryPath(entryID)), filepath.FromSlash(manifestSectionFile))) //nolint:gosec // G304: the project's purge history
	if err != nil {
		return RestoreOutcome{}, failure("read "+manifestSectionFile, err) //nolint:exhaustruct // a failure has no outcome
	}

	stored, err := parseYAMLCore(string(storedText))
	storedMap, isMap := stored.(*JSObject)

	var section *JSObject
	if err == nil && isMap {
		section, _ = storedMap.getOr(manifestSectionKey).(*JSObject)
	}

	block, blockOK := manifestBlock(string(storedText))
	if section == nil || !blockOK {
		return RestoreOutcome{}, failure(manifestSectionFile+" holds no noskills mapping; run noskills init to write a new section", nil) //nolint:exhaustruct // a failure has no outcome
	}

	manifestPath := projectPath(root, manifestFile)

	current, err := os.ReadFile(manifestPath) //nolint:gosec // G304: the project's own manifest
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return RestoreOutcome{}, failure("read "+manifestFile, err) //nolint:exhaustruct // a failure has no outcome
	}

	text := string(current)

	document, parseErr := parseYAMLCore(text)
	if parseErr != nil {
		return RestoreOutcome{}, failure(manifestFile+" is not a YAML mapping; fix it, then run restore again", nil) //nolint:exhaustruct // a failure has no outcome
	}

	documentMap, isDocumentMap := document.(*JSObject)
	if document != nil && !isDocumentMap {
		return RestoreOutcome{}, failure(manifestFile+" is not a YAML mapping; fix it, then run restore again", nil) //nolint:exhaustruct // a failure has no outcome
	}

	if documentMap.hasKey(manifestSectionKey) {
		if !overwrite {
			return RestoreOutcome{Refused: true, Conflicts: []string{manifestFile + " (noskills section)"}}, nil //nolint:exhaustruct // a refusal writes nothing
		}

		text = spliceManifestSection(text, block)
	} else {
		text = insertManifestSection(text, block)
	}

	if err := os.MkdirAll(projectPath(root, eserDir), 0o750); err != nil {
		return RestoreOutcome{}, failure("write "+manifestFile, err) //nolint:exhaustruct // a failure has no outcome
	}

	if err := writeFileAtomic(manifestPath, []byte(text), 0o644); err != nil {
		return RestoreOutcome{}, failure("write "+manifestFile, err) //nolint:exhaustruct // a failure has no outcome
	}

	return RestoreOutcome{Paths: []string{manifestFile}, Skipped: []string{}}, nil //nolint:exhaustruct // a restore has no conflicts
}

// manifestSectionRange finds the top-level noskills key in the manifest's
// lines: the first line of the section and the line after its last one.
func manifestSectionRange(lines []string) (start, end int, ok bool) {
	start = -1

	for i, line := range lines {
		if line == manifestSectionKey+":" || strings.HasPrefix(line, manifestSectionKey+": ") ||
			strings.HasPrefix(line, manifestSectionKey+":\t") {
			start = i

			break
		}
	}

	if start == -1 {
		return 0, 0, false
	}

	end = start + 1
	for end < len(lines) && (lines[end] == "" || lines[end][0] == ' ' || lines[end][0] == '\t') {
		end++
	}

	// Blank lines before the next key stay with it.
	for end > start+1 && strings.TrimSpace(lines[end-1]) == "" {
		end--
	}

	return start, end, true
}

// manifestBlock is the noskills section's text in a YAML file.
func manifestBlock(text string) (string, bool) {
	lines := strings.Split(strings.TrimRight(text, "\n"), "\n")

	start, end, ok := manifestSectionRange(lines)
	if !ok {
		return "", false
	}

	return strings.Join(lines[start:end], "\n"), true
}

// isYAMLContentLine reports whether a line holds YAML data, not only a
// comment or whitespace.
func isYAMLContentLine(line string) bool {
	trimmed := strings.TrimSpace(line)

	return trimmed != "" && !strings.HasPrefix(trimmed, "#")
}

// withoutManifestSection is the manifest without its noskills section, as
// purge writes it: the other lines as they are, or `{}` when no data is left
// (the library writes an empty mapping that way).
func withoutManifestSection(text string) (string, bool) {
	lines := strings.Split(strings.TrimRight(text, "\n"), "\n")

	start, end, ok := manifestSectionRange(lines)
	if !ok {
		return "", false
	}

	rest := append(append([]string{}, lines[:start]...), lines[end:]...)

	if !slices.ContainsFunc(rest, isYAMLContentLine) {
		prefix := strings.Join(rest, "\n")
		if strings.TrimSpace(prefix) == "" {
			return "{}\n", true
		}

		return prefix + "\n{}\n", true
	}

	return strings.Join(rest, "\n") + "\n", true
}

// insertManifestSection adds the section to a manifest that has none: in
// place of an empty `{}`, after the last line of data, or as the file.
func insertManifestSection(text, block string) string {
	lines := strings.Split(strings.TrimRight(text, "\n"), "\n")

	last := -1

	for i, line := range lines {
		if isYAMLContentLine(line) {
			last = i
		}
	}

	switch {
	case last == -1:
		return block + "\n"
	case strings.TrimSpace(lines[last]) == "{}":
		lines[last] = block
	default:
		lines = slices.Insert(lines, last+1, block)
	}

	return strings.Join(lines, "\n") + "\n"
}
