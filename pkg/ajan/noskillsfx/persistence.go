// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
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
func (p Paths) SpecDir(specName string) string {
	return filepath.Join(p.SpecsDir, specName)
}

// SpecFile returns the path to spec.md for a named spec.
func (p Paths) SpecFile(specName string) string {
	return filepath.Join(p.SpecsDir, specName, "spec.md")
}

// SpecStateFile returns the per-spec state JSON path.
func (p Paths) SpecStateFile(specName string) string {
	return filepath.Join(p.SpecStatesDir, specName+".json")
}

// ConcernFile returns the path to a concern definition.
func (p Paths) ConcernFile(concernID string) string {
	return filepath.Join(p.ConcernsDir, concernID+".json")
}

// SessionFile returns the path to a session JSON file.
func (p Paths) SessionFile(sessionID string) string {
	return filepath.Join(p.SessionsDir, sessionID+".json")
}

// =============================================================================
// State file I/O
// =============================================================================

// ReadState reads the state.json from root. Returns CreateInitialState() when
// the file is absent (matching the TS behavior of catching the read error).
func ReadState(root string) (StateFile, error) {
	p := NewPaths(root)
	data, err := os.ReadFile(p.StateFile)

	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return CreateInitialState(), nil
		}

		return CreateInitialState(), fmt.Errorf("readState: %w", err)
	}

	var state StateFile
	if err := json.Unmarshal(data, &state); err != nil {
		return CreateInitialState(), fmt.Errorf("readState: parse error: %w", err)
	}

	return normalizeStateShape(state), nil
}

// WriteState atomically writes state to .eser/.state/progresses/state.json,
// creating intermediate directories as needed.
func WriteState(root string, state StateFile) error {
	p := NewPaths(root)

	if err := os.MkdirAll(p.ProgressesDir, 0o750); err != nil {
		return fmt.Errorf("writeState: mkdir: %w", err)
	}

	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("writeState: marshal: %w", err)
	}

	if err := os.WriteFile(p.StateFile, data, 0o644); err != nil { //nolint:gosec
		return fmt.Errorf("writeState: write: %w", err)
	}

	return nil
}

// normalizeStateShape backfills any fields that were added after a state file
// was written (forward-compatibility). Mirrors normalizeStateShape() in TS.
func normalizeStateShape(state StateFile) StateFile {
	// Ensure slice fields are non-nil so callers can range without nil checks.
	if state.Discovery.Answers == nil {
		state.Discovery.Answers = []DiscoveryAnswer{}
	}

	if state.Execution.ModifiedFiles == nil {
		state.Execution.ModifiedFiles = []string{}
	}

	if state.Execution.CompletedTasks == nil {
		state.Execution.CompletedTasks = []string{}
	}

	if state.Execution.NaItems == nil {
		state.Execution.NaItems = []string{}
	}

	if state.Decisions == nil {
		state.Decisions = []Decision{}
	}

	if state.RevisitHistory == nil {
		state.RevisitHistory = []RevisitEntry{}
	}

	if state.SpecState.Placeholders == nil {
		state.SpecState.Placeholders = []PlaceholderStatus{}
	}

	return state
}

// =============================================================================
// Manifest I/O (.eser/manifest.yml)
// =============================================================================

// ReadManifest reads and parses the YAML manifest. Returns ErrManifestNotFound
// when the file does not exist (caller should call ScaffoldEserDir first).
func ReadManifest(root string) (NosManifest, error) {
	p := NewPaths(root)
	data, err := os.ReadFile(p.ManifestFile)

	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return NosManifest{}, ErrManifestNotFound
		}

		return NosManifest{}, fmt.Errorf("readManifest: %w", err)
	}

	var manifest NosManifest
	if err := yaml.Unmarshal(data, &manifest); err != nil {
		return NosManifest{}, fmt.Errorf("readManifest: parse: %w", err)
	}

	return manifest, nil
}

// WriteManifest serialises the manifest to YAML and writes it.
func WriteManifest(root string, manifest NosManifest) error {
	p := NewPaths(root)

	if err := os.MkdirAll(p.EserDir, 0o750); err != nil {
		return fmt.Errorf("writeManifest: mkdir: %w", err)
	}

	data, err := yaml.Marshal(manifest)
	if err != nil {
		return fmt.Errorf("writeManifest: marshal: %w", err)
	}

	if err := os.WriteFile(p.ManifestFile, data, 0o644); err != nil { //nolint:gosec
		return fmt.Errorf("writeManifest: write: %w", err)
	}

	return nil
}

// IsInitialized reports whether .eser/manifest.yml exists and has a non-nil
// noskills section (matches isInitialized() in TS).
func IsInitialized(root string) bool {
	p := NewPaths(root)
	_, err := os.Stat(p.ManifestFile)

	return err == nil
}

// =============================================================================
// Per-spec state I/O (.eser/.state/progresses/specs/<name>.json)
// =============================================================================

// ReadSpecState reads a per-spec state file. Returns nil when absent.
func ReadSpecState(root, specName string) (*StateFile, error) {
	p := NewPaths(root)
	data, err := os.ReadFile(p.SpecStateFile(specName))

	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}

		return nil, fmt.Errorf("readSpecState %s: %w", specName, err)
	}

	var state StateFile
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, fmt.Errorf("readSpecState %s: parse: %w", specName, err)
	}

	normalized := normalizeStateShape(state)

	return &normalized, nil
}

// WriteSpecState writes a per-spec state file.
func WriteSpecState(root, specName string, state StateFile) error {
	p := NewPaths(root)

	if err := os.MkdirAll(p.SpecStatesDir, 0o750); err != nil {
		return fmt.Errorf("writeSpecState %s: mkdir: %w", specName, err)
	}

	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("writeSpecState %s: marshal: %w", specName, err)
	}

	if err := os.WriteFile(p.SpecStateFile(specName), data, 0o644); err != nil { //nolint:gosec
		return fmt.Errorf("writeSpecState %s: write: %w", specName, err)
	}

	return nil
}

// ListSpecStates returns the names of all spec state files under specStatesDir.
func ListSpecStates(root string) ([]string, error) {
	p := NewPaths(root)
	entries, err := os.ReadDir(p.SpecStatesDir)

	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []string{}, nil
		}

		return nil, fmt.Errorf("listSpecStates: %w", err)
	}

	names := make([]string, 0, len(entries))

	for _, e := range entries {
		if e.IsDir() {
			continue
		}

		name := e.Name()
		if len(name) > 5 && name[len(name)-5:] == ".json" {
			names = append(names, name[:len(name)-5])
		}
	}

	return names, nil
}

// =============================================================================
// Concern I/O (.eser/concerns/*.json)
// =============================================================================

// ReadConcern reads a single concern definition by ID.
func ReadConcern(root, concernID string) (*ConcernDefinition, error) {
	p := NewPaths(root)
	data, err := os.ReadFile(p.ConcernFile(concernID))

	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}

		return nil, fmt.Errorf("readConcern %s: %w", concernID, err)
	}

	var concern ConcernDefinition
	if err := json.Unmarshal(data, &concern); err != nil {
		return nil, fmt.Errorf("readConcern %s: parse: %w", concernID, err)
	}

	return &concern, nil
}

// ListConcerns returns the IDs of all concerns in .eser/concerns/.
func ListConcerns(root string) ([]string, error) {
	p := NewPaths(root)
	entries, err := os.ReadDir(p.ConcernsDir)

	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []string{}, nil
		}

		return nil, fmt.Errorf("listConcerns: %w", err)
	}

	ids := make([]string, 0, len(entries))

	for _, e := range entries {
		if e.IsDir() {
			continue
		}

		name := e.Name()
		if len(name) > 5 && name[len(name)-5:] == ".json" {
			ids = append(ids, name[:len(name)-5])
		}
	}

	return ids, nil
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

// =============================================================================
// Scaffold
// =============================================================================

// ScaffoldEserDir creates the full .eser/ directory tree under root.
// All dirs are created with 0755 permissions. Existing dirs are left untouched.
func ScaffoldEserDir(root string) error {
	p := NewPaths(root)
	dirs := []string{
		p.EserDir,
		p.StateDir,
		p.ProgressesDir,
		p.SpecStatesDir,
		p.SessionsDir,
		p.EventsDir,
		p.ConcernsDir,
		p.RulesDir,
		p.SpecsDir,
		p.WorkflowsDir,
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return fmt.Errorf("scaffoldEserDir: %w", err)
		}
	}

	return nil
}
