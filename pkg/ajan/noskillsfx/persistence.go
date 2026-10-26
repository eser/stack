// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"fmt"
	"os"
	"path/filepath"
)

// =============================================================================
// Path constants (mirrors persistence.ts path constants)
// =============================================================================

const (
	eserDir       = ".eser"
	stateDir      = eserDir + "/.state"
	progressesDir = stateDir + "/progresses"
	stateFile     = progressesDir + "/state.json"
	askTokenFile  = progressesDir + "/ask-token.json"
	manifestFile  = eserDir + "/manifest.yml"
	concernsDir   = eserDir + "/concerns"
	rulesDir      = eserDir + "/rules"
	specsDir      = eserDir + "/specs"
	workflowsDir  = eserDir + "/workflows"
	specStatesDir = progressesDir + "/specs"
	activeFile    = progressesDir + "/active.json"
	sessionsDir   = stateDir + "/sessions"
	eventsDir     = stateDir + "/events"
	eventsFile    = eventsDir + "/events.jsonl"
	eserGitignore = eserDir + "/.gitignore"
)

// Paths holds all canonical file-path helpers rooted at a project root.
// Call NewPaths(root) to obtain an instance.
type Paths struct {
	Root          string
	EserDir       string
	StateDir      string
	ProgressesDir string
	StateFile     string
	AskTokenFile  string
	ManifestFile  string
	ConcernsDir   string
	RulesDir      string
	SpecsDir      string
	WorkflowsDir  string
	SpecStatesDir string
	ActiveFile    string
	SessionsDir   string
	EventsDir     string
	EventsFile    string
	EserGitignore string
}

// NewPaths constructs a Paths instance rooted at root.
func NewPaths(root string) Paths {
	j := func(rel string) string { return filepath.Join(root, filepath.FromSlash(rel)) }

	return Paths{
		Root:          root,
		EserDir:       j(eserDir),
		StateDir:      j(stateDir),
		ProgressesDir: j(progressesDir),
		StateFile:     j(stateFile),
		AskTokenFile:  j(askTokenFile),
		ManifestFile:  j(manifestFile),
		ConcernsDir:   j(concernsDir),
		RulesDir:      j(rulesDir),
		SpecsDir:      j(specsDir),
		WorkflowsDir:  j(workflowsDir),
		SpecStatesDir: j(specStatesDir),
		ActiveFile:    j(activeFile),
		SessionsDir:   j(sessionsDir),
		EventsDir:     j(eventsDir),
		EventsFile:    j(eventsFile),
		EserGitignore: j(eserGitignore),
	}
}

// SpecDir returns the directory for a named spec.
func (p Paths) SpecDir(specName string) string { //nolint:gocritic // hugeParam: read-only value receiver; a pointer would change the method set
	return filepath.Join(p.SpecsDir, specName)
}

// SpecFile returns the path to spec.md for a named spec.
func (p Paths) SpecFile(specName string) string { //nolint:gocritic // hugeParam: read-only value receiver; a pointer would change the method set
	return filepath.Join(p.SpecsDir, specName, "spec.md")
}

// SpecStateFile returns the per-spec state JSON path.
func (p Paths) SpecStateFile(specName string) string { //nolint:gocritic // hugeParam: StateFile is copied on purpose; transitions return a new state
	return filepath.Join(p.SpecStatesDir, specName+".json")
}

// ConcernFile returns the path to a concern definition.
func (p Paths) ConcernFile(concernID string) string { //nolint:gocritic // hugeParam: read-only value receiver; a pointer would change the method set
	return filepath.Join(p.ConcernsDir, concernID+".json")
}

// SessionFile returns the path to a session JSON file.
func (p Paths) SessionFile(sessionID string) string { //nolint:gocritic // hugeParam: read-only value receiver; a pointer would change the method set
	return filepath.Join(p.SessionsDir, sessionID+".json")
}

// manifestSectionKey is the top-level key of .eser/manifest.yml that holds the
// noskills config, as readManifest and writeManifest in persistence.ts use it.
// The rest of the file belongs to other tools (`stack:`, `workflows:`,
// `scripts:`).
const manifestSectionKey = "noskills"

// writeFileAtomic writes via a temporary file in the same directory and renames
// it over the target, so a crash or a full disk leaves the previous file intact
// instead of a truncated one. Same-directory is required: rename is only atomic
// within a filesystem.
func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)

	temp, err := os.CreateTemp(dir, filepath.Base(path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("create temp: %w", err)
	}

	tempName := temp.Name()

	defer func() {
		// No-op once the rename succeeded; removes the temp on every failure
		// path so a half-written file is never left behind.
		_ = os.Remove(tempName)
	}()

	if _, err := temp.Write(data); err != nil {
		_ = temp.Close()

		return fmt.Errorf("write temp: %w", err)
	}

	// Durability before visibility: rename can otherwise be committed while the
	// contents are still only in the page cache.
	if err := temp.Sync(); err != nil {
		_ = temp.Close()

		return fmt.Errorf("sync temp: %w", err)
	}

	if err := temp.Close(); err != nil {
		return fmt.Errorf("close temp: %w", err)
	}

	if err := os.Chmod(tempName, perm); err != nil {
		return fmt.Errorf("chmod temp: %w", err)
	}

	if err := os.Rename(tempName, path); err != nil {
		return fmt.Errorf("rename temp: %w", err)
	}

	return nil
}

// =============================================================================
// Project root discovery
// =============================================================================

// FindProjectRoot walks up from dir looking for a .eser/ directory.
// Returns the directory containing .eser/, or "" if not found.
func FindProjectRoot(dir string) string {
	current := filepath.Clean(dir)

	for {
		candidate := filepath.Join(current, eserDir)
		if _, err := os.Stat(candidate); err == nil {
			return current
		}

		parent := filepath.Dir(current)
		if parent == current {
			return ""
		}

		current = parent
	}
}

// ResolveProjectRoot returns root if non-empty, otherwise calls FindProjectRoot
// from the current working directory.
func ResolveProjectRoot(root string) (string, error) {
	if root != "" {
		return root, nil
	}

	cwd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("resolveProjectRoot: %w", err)
	}

	found := FindProjectRoot(cwd)
	if found == "" {
		return cwd, nil // fall back to cwd
	}

	return found, nil
}
