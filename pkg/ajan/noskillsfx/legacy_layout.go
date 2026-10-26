// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// The one-shot move from the layout before the .eser/.state umbrella
// (migrateLegacyLayout in state/persistence.ts): .eser/.state/state.json
// and its siblings go to .eser/.state/progresses/, .eser/.sessions/ to
// .eser/.state/sessions/ and .eser/.events/ to .eser/.state/events/.

const (
	legacySessionsDir = eserDir + "/.sessions"
	legacyEventsDir   = eserDir + "/.events"
	// LegacyMigrationNotice is the line the migration writes to stderr.
	LegacyMigrationNotice = "noskills: migrated .eser/ runtime layout to .eser/.state/{progresses,sessions,events}/"
)

// PartialMigrationError means a legacy entry and the new folder it moves to
// both hold state: the legacy state.json beside a progresses directory, or a
// legacy sessions or events folder beside a new one that holds files. The
// user resolves it by hand. The TypeScript message starts with
// "noskills: ", which the CLI adds.
type PartialMigrationError struct {
	Legacy string
	// LegacyKind is "file" for state.json and "dir" for a folder.
	LegacyKind string
	Current    string
}

func (e *PartialMigrationError) Error() string {
	return "partial migration detected — both " + e.Legacy + " (" + e.LegacyKind + ") and " + e.Current +
		" (dir) exist. Resolve manually before continuing."
}

// isMissingOrEmptyDir is true when path is absent or an empty directory.
func isMissingOrEmptyDir(path string) bool {
	if !isDirectory(path) {
		return !isRegularFile(path)
	}

	entries, err := os.ReadDir(path)

	return err == nil && len(entries) == 0
}

func isRegularFile(path string) bool {
	info, err := os.Stat(path)

	return err == nil && info.Mode().IsRegular()
}

func isDirectory(path string) bool {
	info, err := os.Stat(path)

	return err == nil && info.IsDir()
}

// MigrateLegacyLayout moves a legacy layout into .eser/.state/ and reports
// whether it moved anything. The progresses move goes through a sibling
// temp directory, so an interrupted move leaves a state that can be
// recovered. notice gets the one-line notice (nil drops it). It fails with
// a *PartialMigrationError when both layouts hold the state.
func MigrateLegacyLayout(root string, notice func(text string)) (bool, error) {
	legacyState := root + "/" + stateDir + "/state.json"
	legacySessions := filepath.Join(root, legacySessionsDir)
	legacyEvents := filepath.Join(root, legacyEventsDir)

	hasState := isRegularFile(filepath.FromSlash(legacyState))
	hasSessions := isDirectory(legacySessions)
	hasEvents := isDirectory(legacyEvents)

	if !hasState && !hasSessions && !hasEvents {
		return false, nil
	}

	progresses := filepath.Join(root, progressesDir)

	if hasState && isDirectory(progresses) {
		return false, &PartialMigrationError{Legacy: legacyState, LegacyKind: "file", Current: root + "/" + progressesDir}
	}

	moves := []struct {
		present            bool
		from, to           string
		fromShown, toShown string
	}{
		{hasSessions, legacySessions, filepath.Join(root, sessionsDir), root + "/" + legacySessionsDir, root + "/" + sessionsDir},
		{hasEvents, legacyEvents, filepath.Join(root, eventsDir), root + "/" + legacyEventsDir, root + "/" + eventsDir},
	}

	// A new folder that already holds files would fail the rename halfway
	// through the migration, so it is refused before anything moves; an
	// empty one is replaced.
	for _, move := range moves {
		if move.present && !isMissingOrEmptyDir(move.to) {
			return false, &PartialMigrationError{Legacy: move.fromShown, LegacyKind: "dir", Current: move.toShown}
		}
	}

	stateRoot := filepath.Join(root, stateDir)

	if hasState {
		if err := moveLegacyState(stateRoot, progresses); err != nil {
			return false, err
		}
	}

	for _, move := range moves {
		if !move.present {
			continue
		}

		if err := os.MkdirAll(stateRoot, 0o750); err != nil {
			return false, fmt.Errorf("create %s: %w", stateRoot, err)
		}

		if isDirectory(move.to) {
			if err := os.Remove(move.to); err != nil {
				return false, fmt.Errorf("replace the empty %s: %w", move.to, err)
			}
		}

		if err := os.Rename(move.from, move.to); err != nil {
			return false, fmt.Errorf("move %s to %s: %w", move.from, move.to, err)
		}
	}

	gitignore := filepath.Join(root, eserGitignore)
	if current, err := os.ReadFile(gitignore); err == nil { //nolint:gosec // G304: the project's .eser/.gitignore
		if strings.Contains(string(current), ".sessions/") || strings.Contains(string(current), ".events/") {
			if err := writeFileAtomic(gitignore, []byte(eserGitignoreContent), stateFilePerm); err != nil {
				return false, fmt.Errorf("write %s: %w", gitignore, err)
			}
		}
	}

	if notice != nil {
		notice(LegacyMigrationNotice)
	}

	return true, nil
}

// moveLegacyState moves every entry of .eser/.state but the new layout's
// own directories into progresses/, through a temp directory.
func moveLegacyState(stateRoot, progresses string) error {
	temp := filepath.Join(stateRoot, ".progresses-tmp")
	if err := os.MkdirAll(temp, 0o750); err != nil {
		return fmt.Errorf("create %s: %w", temp, err)
	}

	entries, err := os.ReadDir(stateRoot)
	if err != nil {
		return fmt.Errorf("read %s: %w", stateRoot, err)
	}

	for _, entry := range entries {
		switch entry.Name() {
		case ".progresses-tmp", "progresses", "sessions", "events", "purge-history":
			continue
		}

		from := filepath.Join(stateRoot, entry.Name())
		if err := os.Rename(from, filepath.Join(temp, entry.Name())); err != nil {
			return fmt.Errorf("move %s: %w", from, err)
		}
	}

	if err := os.Rename(temp, progresses); err != nil {
		return fmt.Errorf("move %s to %s: %w", temp, progresses, err)
	}

	return nil
}
