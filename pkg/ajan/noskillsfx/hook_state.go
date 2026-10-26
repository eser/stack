// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// The hooks read the project's files the way the TypeScript CLI reads them
// (state/persistence.ts): state as unchecked JSON with its fields and key
// order kept, the manifest's noskills section as the yaml package parses it, and
// a file that is missing or corrupt as the documented default. The typed
// readers in persistence.go serve noskills-server and differ on purpose in
// places (IsInitialized, the legacy top-level manifest); these do not.

// StateWarner is told about a state file that exists but cannot be read; the
// TypeScript CLI prints a warning for it and goes on with the default.
type StateWarner func(path string, err error)

// CorruptStateWarning is the text the TypeScript CLI prints for a state file
// that exists but cannot be read.
func CorruptStateWarning(path string, err error) string {
	return "noskills: WARNING — " + path + " exists but could not be read (" + err.Error() + "). " +
		"Treating it as empty; the previous contents are still on disk and have NOT been overwritten yet."
}

// HookManifest is the noskills section of .eser/manifest.yml as the hooks
// read it. Present is false when the file is missing, does not parse or has
// no section, the cases where readManifest returns null.
type HookManifest struct {
	Present  bool
	AllowGit bool   // allowGit === true
	Command  string // command when it is a non-empty string
	Concerns []string
	Tools    []string
	// MaxIterations is maxIterationsBeforeRestart when it is a number.
	MaxIterations    float64
	HasMaxIterations bool
	// Validates is set when the section has a validate entry, which turns
	// on the transition validator (manifestRequestsValidation).
	Validates bool
}

func stringItems(value any) []string {
	items, _ := value.([]any)
	out := make([]string, 0, len(items))

	for _, item := range items {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}

	return out
}

// readManifestSection is the TypeScript readManifest: the section's raw
// value, or nil when there is none to read.
func readManifestSection(root string) (*JSObject, bool) {
	data, err := os.ReadFile(filepath.Join(root, manifestFile)) //nolint:gosec // G304: the project's own manifest
	if err != nil {
		return nil, false
	}

	document, err := parseYAMLCore(string(data))
	if err != nil {
		return nil, false
	}

	o, ok := document.(*JSObject)
	if !ok {
		return nil, false
	}

	value, present := o.get(manifestSectionKey)
	if !present || value == nil {
		return nil, false
	}

	section, isObject := value.(*JSObject)
	if !isObject {
		// A scalar or a list where the section belongs: readManifest returns
		// it, and every field the hooks read is then undefined.
		return NewJSObject(), true
	}

	return section, true
}

// ReadHookManifest reads the noskills section as the hooks use it.
func ReadHookManifest(root string) HookManifest {
	section, ok := readManifestSection(root)
	if !ok {
		return HookManifest{} //nolint:exhaustruct // the zero value is "no manifest"
	}

	allowGit, _ := section.get("allowGit")
	command := StringField(section, "command")
	concerns, _ := section.get("concerns")
	tools, _ := section.get("tools")
	maxValue, _ := section.get("maxIterationsBeforeRestart")
	maxIterations, hasMax := maxValue.(float64)

	return HookManifest{
		Present:          true,
		AllowGit:         allowGit == true,
		Command:          command,
		Concerns:         stringItems(concerns),
		Tools:            stringItems(tools),
		MaxIterations:    maxIterations,
		HasMaxIterations: hasMax,
		Validates:        section.hasKey("validate"),
	}
}

// CommandPrefix is the command the hooks' messages and the git wrapper name:
// the manifest's command, or DefaultCommandPrefix.
func (m *HookManifest) CommandPrefix() string {
	if m.Command != "" {
		return m.Command
	}

	return DefaultCommandPrefix
}

// IsHookInitialized is the TypeScript isInitialized: the manifest parses
// and has a noskills key.
func IsHookInitialized(root string) bool {
	data, err := os.ReadFile(filepath.Join(root, manifestFile)) //nolint:gosec // G304: the project's own manifest
	if err != nil {
		return false
	}

	document, err := parseYAMLCore(string(data))
	if err != nil {
		return false
	}

	o, ok := document.(*JSObject)
	if !ok {
		return false
	}

	_, present := o.get(manifestSectionKey)

	return present
}

// normalizeHookState is normalizeStateShape: a legacy string
// discovery.userContext becomes a list, and any other value that is not a
// list is dropped.
func normalizeHookState(state *JSObject) *JSObject {
	discovery, ok := fieldObject(state, "discovery")
	if !ok {
		return state
	}

	raw, present := discovery.get("userContext")
	if !present {
		return state
	}

	switch v := raw.(type) {
	case []any:
		return state
	case string:
		normalized := discovery.clone()
		if v == "" {
			normalized.set("userContext", []any{})
		} else {
			normalized.set("userContext", []any{v})
		}

		out := state.clone()
		out.set("discovery", normalized)

		return out
	default:
		normalized := discovery.clone()
		normalized.remove("userContext")

		out := state.clone()
		out.set("discovery", normalized)

		return out
	}
}

// readStateFile reads one state file; a missing file or one that is not a
// JSON object gives the initial state, and the latter goes to warn.
func readStateFile(path string, warn StateWarner) *JSObject {
	data, err := os.ReadFile(path) //nolint:gosec // G304: a state file of the project
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) && warn != nil {
			warn(path, err)
		}

		return InitialState()
	}

	parsed, err := parseJSON(string(data))
	if err != nil {
		if warn != nil {
			warn(path, err)
		}

		return InitialState()
	}

	state, ok := parsed.(*JSObject)
	if !ok {
		// JSON.parse succeeds on a scalar; the TypeScript reader then works
		// on a value with no fields, which reads like an empty object.
		return NewJSObject()
	}

	return normalizeHookState(state)
}

// ReadHookState is the TypeScript readState: the global state.json.
func ReadHookState(root string, warn StateWarner) *JSObject {
	return readStateFile(filepath.Join(root, stateFile), warn)
}

// ErrSpecNotFound means the named spec has no directory under .eser/specs/.
var ErrSpecNotFound = errors.New("spec not found")

// specNameRegexp is what a spec name may hold before it is joined to a
// path: the hook reads it from state files and sessions.
var specNameRegexp = regexp.MustCompile(`^[^/\\\x00]+$`) //nolint:gochecknoglobals // compiled once

// ResolveHookState is the TypeScript resolveState for a named spec: the
// per-spec state when it names the spec, else the global state when that
// does, else the per-spec state with the spec filled in. It fails with
// ErrSpecNotFound when the spec has no directory.
func ResolveHookState(root, specName string, warn StateWarner) (*JSObject, error) {
	if specName == "" {
		return nil, &SpecNotFoundError{Name: specName, CommandPrefix: DefaultCommandPrefix}
	}

	return ResolveState(root, specName, DefaultCommandPrefix, warn)
}

var sessionIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`) //nolint:gochecknoglobals // compiled once

func readSessionFile(path, id string) *JSObject {
	data, err := os.ReadFile(path) //nolint:gosec // G304: a session file named by a validated id
	if err != nil {
		return nil
	}

	parsed, err := parseJSON(string(data))
	if err != nil {
		return nil
	}

	session, ok := parsed.(*JSObject)
	if !ok || StringField(session, "id") != id {
		return nil
	}

	return session
}

// ReadHookSession is the TypeScript readSession: the session file of a
// valid id whose embedded id matches, or nil.
func ReadHookSession(root, sessionID string) *JSObject {
	if !sessionIDPattern.MatchString(sessionID) {
		return nil
	}

	return readSessionFile(filepath.Join(root, sessionsDir, sessionID+".json"), sessionID)
}

// ListHookSessions is the TypeScript listSessions: every session file whose
// name is a valid id matching its embedded id, in name order.
func ListHookSessions(root string) []*JSObject {
	dir := filepath.Join(root, sessionsDir)

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}

	var sessions []*JSObject

	for _, entry := range entries {
		name := entry.Name()
		if !entry.Type().IsRegular() || !strings.HasSuffix(name, ".json") {
			continue
		}

		id := strings.TrimSuffix(name, ".json")
		if !sessionIDPattern.MatchString(id) {
			continue
		}

		if session := readSessionFile(filepath.Join(dir, name), id); session != nil {
			sessions = append(sessions, session)
		}
	}

	return sessions
}

// ListHookConcerns is the TypeScript listConcerns: every concern file under
// .eser/concerns/, in name order. A file that does not parse, or whose
// scope values are unknown, goes to warn and is skipped.
func ListHookConcerns(root string, warn StateWarner) []ConcernDefinition {
	dir := filepath.Join(root, concernsDir)

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}

	var concerns []ConcernDefinition

	for _, entry := range entries {
		if !entry.Type().IsRegular() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		path := filepath.Join(dir, entry.Name())

		concern, err := readConcernFile(path)
		if err != nil {
			if warn != nil {
				warn(path, err)
			}

			continue
		}

		concerns = append(concerns, concern)
	}

	return concerns
}

func readConcernFile(path string) (ConcernDefinition, error) {
	data, err := os.ReadFile(path) //nolint:gosec // G304: a concern file of the project
	if err != nil {
		return ConcernDefinition{}, fmt.Errorf("read: %w", err)
	}

	var concern ConcernDefinition
	if err := json.Unmarshal(data, &concern); err != nil {
		return ConcernDefinition{}, fmt.Errorf("parse: %w", err)
	}

	if err := ValidateConcernScopes(&concern); err != nil {
		return ConcernDefinition{}, fmt.Errorf("%w; see README-HOW.md#where-content-applies-scope", err)
	}

	return concern, nil
}

// ActiveHookConcerns keeps the concerns the manifest lists.
func ActiveHookConcerns(all []ConcernDefinition, manifest *HookManifest) []ConcernDefinition {
	if !manifest.Present {
		return nil
	}

	var active []ConcernDefinition

	for _, concern := range all {
		for _, id := range manifest.Concerns {
			if id == concern.ID {
				active = append(active, concern)

				break
			}
		}
	}

	return active
}

// classificationOf reads state.classification as the concern scope checks
// use it: nil when it is null or missing, and each flag true only when it
// is the boolean true.
func classificationOf(state *JSObject) *SpecClassification {
	value, present := state.get("classification")
	if !present || value == nil {
		return nil
	}

	o, _ := value.(*JSObject)
	flag := func(key string) bool {
		v, _ := o.get(key)

		return v == true
	}

	return &SpecClassification{
		InvolvesWebUI:        flag("involvesWebUI"),
		InvolvesCLI:          flag("involvesCLI"),
		InvolvesPublicAPI:    flag("involvesPublicAPI"),
		InvolvesMigration:    flag("involvesMigration"),
		InvolvesDataHandling: flag("involvesDataHandling"),
		Source:               nil,
		InferredFrom:         nil,
	}
}
