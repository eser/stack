// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// The lifecycle state files are read and written as state/persistence.ts
// does: JSON objects that keep every field and their order, written with
// JSON.stringify(state, null, 2) and a trailing newline. The typed StateFile
// in schema.go stays for callers that only read a few fields.

// InitialState is createInitialState(): the state of a project at rest.
func InitialState() *JSObject {
	return JSObjectOf(
		"version", "0.1.0",
		"phase", PhaseIdle,
		"spec", nil,
		"specDescription", nil,
		"branch", nil,
		"discovery", initialDiscovery(),
		"specState", initialSpecState(),
		"execution", initialExecution(),
		"decisions", []any{},
		"lastCalledAt", nil,
		"classification", nil,
		"completionReason", nil,
		"completedAt", nil,
		"completionNote", nil,
		"reopenedFrom", nil,
		"revisitHistory", []any{},
	)
}

func initialDiscovery() *JSObject {
	return JSObjectOf(
		"answers", []any{},
		"completed", false,
		"currentQuestion", 0.0,
		"audience", "human",
		"approved", false,
		"planPath", nil,
	)
}

// emptySpecMetadata is EMPTY_SPEC_METADATA.
func emptySpecMetadata() *JSObject {
	return JSObjectOf(
		"created", JSObjectOf("date", "", "user", ""),
		"lastModified", JSObjectOf("date", "", "user", ""),
		"contributors", []any{},
		"approvals", []any{},
		"pendingDecisions", []any{},
	)
}

func initialSpecState() *JSObject {
	return JSObjectOf(
		"path", nil,
		"status", "none",
		"metadata", emptySpecMetadata(),
		"placeholders", []any{},
	)
}

func initialExecution() *JSObject {
	return JSObjectOf(
		"iteration", 0.0,
		"lastProgress", nil,
		"modifiedFiles", []any{},
		"lastVerification", nil,
		"awaitingStatusReport", false,
		"debt", nil,
		"completedTasks", []any{},
		"debtCounter", 0.0,
		"naItems", []any{},
	)
}

// SpecNotFoundError means the named spec has no directory under
// .eser/specs/. Its message names the command that lists the specs.
type SpecNotFoundError struct {
	Name          string
	CommandPrefix string
}

func (e *SpecNotFoundError) Error() string {
	return "Spec '" + e.Name + "' not found. Run `" + e.CommandPrefix + " spec list` to see available specs."
}

// Is makes errors.Is(err, ErrSpecNotFound) hold.
func (e *SpecNotFoundError) Is(target error) bool {
	return target == ErrSpecNotFound
}

// validSpecPathName reports whether a spec name can be joined to a path
// without leaving its directory.
func validSpecPathName(name string) bool {
	return specNameRegexp.MatchString(name) && name != "." && name != ".."
}

// ResolveState is the TypeScript resolveState: the global state when
// specName is empty, else the per-spec state when it names the spec, else
// the global state when that does, else the per-spec state with the spec
// filled in. It fails with a *SpecNotFoundError when the spec has no
// directory; a name that holds a path separator never has one.
func ResolveState(root, specName, commandPrefix string, warn StateWarner) (*JSObject, error) {
	if specName == "" {
		return ReadHookState(root, warn), nil
	}

	notFound := &SpecNotFoundError{Name: specName, CommandPrefix: commandPrefix}
	if !validSpecPathName(specName) {
		return nil, notFound
	}

	specDir := filepath.Join(root, specsDir, specName)
	if _, err := os.Stat(specDir); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, notFound
		}

		return nil, fmt.Errorf("read spec directory %s: %w", specDir, err)
	}

	specState := ReadSpecStateObject(root, specName, warn)
	if specState.str("spec") == specName {
		return specState, nil
	}

	active := ReadHookState(root, warn)
	if active.str("spec") == specName {
		return active, nil
	}

	return specState.with("spec", specName), nil
}

// ReadSpecStateObject is the TypeScript readSpecState: the per-spec state,
// or the initial state when it is missing or cannot be read.
func ReadSpecStateObject(root, specName string, warn StateWarner) *JSObject {
	if !validSpecPathName(specName) {
		return InitialState()
	}

	return readStateFile(filepath.Join(root, specStatesDir, specName+".json"), warn)
}

// stateJSON is a state file's text: two-space JSON and a newline.
func stateJSON(state *JSObject) []byte {
	return []byte(jsonStringifyIndent(state) + "\n")
}

// WriteStateObject is the TypeScript writeState: the global state.json.
func WriteStateObject(root string, state *JSObject) error {
	dir := filepath.Join(root, progressesDir)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("create %s: %w", dir, err)
	}

	path := filepath.Join(root, stateFile)
	if err := writeFileAtomic(path, stateJSON(state), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}

	return nil
}

// WriteSpecStateObject is the TypeScript writeSpecState: the per-spec
// state file, then the decision ledger's record of what the write resolved.
// The ledger capture never fails the write.
func WriteSpecStateObject(root, specName string, state *JSObject, warn StateWarner) error {
	if !validSpecPathName(specName) {
		return &SpecNotFoundError{Name: specName, CommandPrefix: DefaultCommandPrefix}
	}

	previous := ReadSpecStateObject(root, specName, warn)

	dir := filepath.Join(root, specStatesDir)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("create %s: %w", dir, err)
	}

	path := filepath.Join(dir, specName+".json")
	if err := writeFileAtomic(path, stateJSON(state), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}

	CaptureLedger(root, previous, state, warn)

	return nil
}

// WriteStateAndSpec is the TypeScript writeStateAndSpec: one state to the
// global file and, when it names a spec, to that spec's file.
func WriteStateAndSpec(root string, state *JSObject, warn StateWarner) error {
	if err := WriteStateObject(root, state); err != nil {
		return err
	}

	if spec, ok := state.strOK("spec"); ok {
		return WriteSpecStateObject(root, spec, state, warn)
	}

	return nil
}

// SpecStateEntry is one per-spec state file.
type SpecStateEntry struct {
	Name  string
	State *JSObject
}

// ListSpecStateObjects is the TypeScript listSpecStates: every per-spec
// state file that parses, in name order. A file that does not parse goes to
// warn and is skipped.
func ListSpecStateObjects(root string, warn StateWarner) []SpecStateEntry {
	dir := filepath.Join(root, specStatesDir)

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}

	names := make([]string, 0, len(entries))

	for _, entry := range entries {
		if entry.Type().IsRegular() && strings.HasSuffix(entry.Name(), ".json") {
			names = append(names, entry.Name())
		}
	}

	sort.Strings(names)

	out := make([]SpecStateEntry, 0, len(names))

	for _, name := range names {
		path := filepath.Join(dir, name)

		data, err := os.ReadFile(path) //nolint:gosec // G304: a state file of the project
		if err != nil {
			if warn != nil {
				warn(path, err)
			}

			continue
		}

		parsed, err := parseJSON(string(data))
		if err != nil {
			if warn != nil {
				warn(path, err)
			}

			continue
		}

		state, _ := parsed.(*JSObject)
		if state == nil {
			state = NewJSObject()
		}

		out = append(out, SpecStateEntry{Name: strings.TrimSuffix(name, ".json"), State: state})
	}

	return out
}

// specDirExists reports whether a spec has its directory.
func specDirExists(root, specName string) bool {
	if !validSpecPathName(specName) {
		return false
	}

	_, err := os.Stat(filepath.Join(root, specsDir, specName))

	return err == nil
}
