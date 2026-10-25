// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1 || eserajan_wasi

package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// drainCodebaseStreams snapshots and clears the walk and validate streams,
// cancels their producers and waits for them.
func drainCodebaseStreams() shutdownStep {
	codebaseWalkStreamMu.Lock()

	walks := make([]*codebaseWalkStreamState, 0, len(codebaseWalkStreamHandles))
	for _, s := range codebaseWalkStreamHandles {
		walks = append(walks, s)
	}

	clear(codebaseWalkStreamHandles)
	codebaseWalkStreamMu.Unlock()

	codebaseValidateStreamMu.Lock()

	validates := make(
		[]*codebaseValidateStreamState,
		0,
		len(codebaseValidateStreamHandles),
	)
	for _, s := range codebaseValidateStreamHandles {
		validates = append(validates, s)
	}

	clear(codebaseValidateStreamHandles)
	codebaseValidateStreamMu.Unlock()

	return shutdownStep{ //nolint:exhaustruct
		cancel: func() {
			for _, s := range walks {
				s.cancel()
			}

			for _, s := range validates {
				s.cancel()
			}
		},
		wait: func() {
			for _, s := range walks {
				s.wg.Wait()
			}

			for _, s := range validates {
				s.wg.Wait()
			}
		},
	}
}

type codebaseCommitMsgRequest struct {
	Message             string   `json:"message"`
	AllowAsterisk       *bool    `json:"allowAsterisk"`
	AllowMultipleScopes *bool    `json:"allowMultipleScopes"`
	ForceScope          *bool    `json:"forceScope"`
	Types               []string `json:"types,omitempty"`
}

type codebaseCommitMsgResponse struct {
	Valid  bool     `json:"valid"`
	Issues []string `json:"issues,omitempty"`
	Error  string   `json:"error,omitempty"`
}

type codebaseBumpRequest struct {
	Current  string `json:"current"`
	Command  string `json:"command"`
	Explicit string `json:"explicit,omitempty"`
}

type codebaseBumpResponse struct {
	Version string `json:"version,omitempty"`
	Error   string `json:"error,omitempty"`
}

type codebaseWalkRequest struct {
	Dir        string   `json:"dir"`
	Extensions []string `json:"extensions,omitempty"`
	Exclude    []string `json:"exclude,omitempty"`
	GitAware   bool     `json:"gitAware"`
}

type codebaseFileJSON struct {
	Path      string `json:"path"`
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	IsSymlink bool   `json:"isSymlink,omitempty"`
}

type codebaseWalkResponse struct {
	Files []codebaseFileJSON `json:"files,omitempty"`
	Error string             `json:"error,omitempty"`
}

type codebaseValidateRequest struct {
	Dir        string   `json:"dir"`
	Validators []string `json:"validators,omitempty"`
	Extensions []string `json:"extensions,omitempty"`
	// Exclude is applied to the walk, so an excluded path is never read, never
	// validated and never reported — the same contract as codebaseWalkRequest.
	// Before it existed the manifest's excludes reached only the TypeScript
	// tools, and the Go validators reported 84 "secrets" in skill docs.
	Exclude          []string       `json:"exclude,omitempty"`
	ValidatorOptions map[string]any `json:"validatorOptions,omitempty"`
	GitAware         bool           `json:"gitAware"`
}

type codebaseValidatorResultJSON struct {
	Name         string                       `json:"name"`
	Passed       bool                         `json:"passed"`
	Issues       []codebaseValidatorIssueJSON `json:"issues,omitempty"`
	FilesChecked int                          `json:"filesChecked"`
}

type codebaseValidatorIssueJSON struct {
	Severity string `json:"severity"`
	File     string `json:"file"`
	Line     int    `json:"line,omitempty"`
	Message  string `json:"message"`
}

type codebaseValidateResponse struct {
	Results []codebaseValidatorResultJSON `json:"results,omitempty"`
	Error   string                        `json:"error,omitempty"`
}

// bridgeCodebaseValidateCommitMsg validates a commit message.
func bridgeCodebaseValidateCommitMsg(requestJSON string) string {
	var req codebaseCommitMsgRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(codebaseCommitMsgResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	// An option left out keeps the TypeScript validator's default.
	opts := codebasefx.DefaultCommitMsgOptions()
	opts.Types = req.Types

	if req.AllowAsterisk != nil {
		opts.AllowAsterisk = *req.AllowAsterisk
	}

	if req.AllowMultipleScopes != nil {
		opts.AllowMultipleScopes = *req.AllowMultipleScopes
	}

	if req.ForceScope != nil {
		opts.ForceScope = *req.ForceScope
	}

	result := codebasefx.ValidateCommitMsg(req.Message, opts)

	return marshalResponse(codebaseCommitMsgResponse{Valid: result.Valid, Issues: result.Issues}) //nolint:exhaustruct
}

// bridgeCodebaseBumpVersion bumps a semver version string.
func bridgeCodebaseBumpVersion(requestJSON string) string {
	var req codebaseBumpRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(codebaseBumpResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	version, err := codebasefx.BumpVersion(req.Current, codebasefx.VersionCommand(req.Command), req.Explicit)
	if err != nil {
		return marshalResponse(codebaseBumpResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(codebaseBumpResponse{Version: version}) //nolint:exhaustruct
}

// bridgeCodebaseWalkFiles walks source files under a directory.
func bridgeCodebaseWalkFiles(requestJSON string) string {
	var req codebaseWalkRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(codebaseWalkResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	entries, err := codebasefx.WalkSourceFiles(context.Background(), codebasefx.WalkOptions{
		Root:       req.Dir,
		Extensions: req.Extensions,
		Exclude:    req.Exclude,
		GitAware:   req.GitAware,
	})
	if err != nil {
		return marshalResponse(codebaseWalkResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	files := make([]codebaseFileJSON, 0, len(entries))
	for _, e := range entries {
		files = append(files, codebaseFileJSON{
			Path:      e.Path,
			Name:      e.Name,
			Size:      e.Size,
			IsSymlink: e.IsSymlink,
		})
	}

	return marshalResponse(codebaseWalkResponse{Files: files}) //nolint:exhaustruct
}

// bridgeCodebaseValidateFiles runs built-in or named validators over a directory.
func bridgeCodebaseValidateFiles(requestJSON string) string {
	var req codebaseValidateRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(codebaseValidateResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	files, err := codebasefx.WalkSourceFiles(context.Background(), codebasefx.WalkOptions{
		Root:       req.Dir,
		Extensions: req.Extensions,
		Exclude:    req.Exclude,
		GitAware:   req.GitAware,
	})
	if err != nil {
		return marshalResponse(codebaseValidateResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	// Resolve requested validators (nil = all builtins).
	entries, err := resolveValidatorEntries(req.Validators, req.ValidatorOptions)
	if err != nil {
		return marshalResponse(codebaseValidateResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonResults := runValidatorEntries(files, entries)

	return marshalResponse(codebaseValidateResponse{Results: jsonResults}) //nolint:exhaustruct
}

// validatorOptionsFor returns one validator's entry from a request's
// validatorOptions. An absent entry is an empty object; an entry that is not an
// object is an error.
func validatorOptionsFor(opts map[string]any, name string) (map[string]any, error) {
	raw, ok := opts[name]
	if !ok || raw == nil {
		return map[string]any{}, nil
	}

	entry, ok := raw.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("validatorOptions[%q] has type %T; expected an object", name, raw)
	}

	return entry, nil
}

// resolveFilenameValidator builds the filenames validator from its rules and
// exclude options. Malformed rules are an error.
func resolveFilenameValidator(opts map[string]any) (codebasefx.ValidatorFunc, error) {
	fnOpts, err := validatorOptionsFor(opts, "filenames")
	if err != nil {
		return nil, err
	}

	rules, err := codebasefx.ParseFilenameRules(fnOpts["rules"])
	if err != nil {
		return nil, fmt.Errorf(`validatorOptions["filenames"]: %w`, err)
	}

	var excludes []string

	if rawExcl, ok := fnOpts["exclude"].([]any); ok {
		for _, e := range rawExcl {
			// A TypeScript RegExp exclude arrives as {} and cannot be applied
			// here; the string patterns are the ones Go matches.
			if s, ok := e.(string); ok {
				excludes = append(excludes, s)
			}
		}
	}

	return codebasefx.ValidateFilenames(rules, excludes), nil
}

// resolveLargeFileValidator builds the large-file validator from its maxKb
// option. A maxKb that is not a whole number of kilobytes is an error.
func resolveLargeFileValidator(opts map[string]any) (codebasefx.ValidatorFunc, error) {
	lfOpts, err := validatorOptionsFor(opts, "large-file")
	if err != nil {
		return nil, err
	}

	maxKb, err := codebasefx.ParseMaxKb(lfOpts["maxKb"])
	if err != nil {
		return nil, fmt.Errorf(`validatorOptions["large-file"]: %w`, err)
	}

	return codebasefx.ValidateLargeFile(maxKb * 1024), nil
}

// ErrUnknownValidator is returned when a caller asks for a validator name the
// bridge does not know.
var ErrUnknownValidator = errors.New("unknown validator")

// validatorEntry ties a reported name to the validator that produces the
// result carrying it.
//
// The two used to be built as separate parallel lists, which drifted: the name
// list was ordered eof, bom, trailing, line-endings, merge-conflicts, secrets
// while codebasefx.BuiltinValidators runs eof, trailing, bom, merge-conflicts,
// line-endings, secrets — so trailing-whitespace issues were reported as "bom"
// and merge conflicts as "line-endings". Keeping them in one struct makes that
// class of mismatch unrepresentable.
type validatorEntry struct {
	fn   codebasefx.ValidatorFunc
	name string
}

// defaultValidatorEntries is the set used when no validators are requested.
//
// It mirrors codebasefx.BuiltinValidators in both membership and order; the
// pairing is asserted against that function by test.
func defaultValidatorEntries() []validatorEntry {
	return []validatorEntry{
		{name: "eof", fn: codebasefx.ValidateEOF},
		{name: "trailing", fn: codebasefx.ValidateTrailingWhitespace},
		{name: "bom", fn: codebasefx.ValidateBOM},
		{name: "merge-conflicts", fn: codebasefx.ValidateMergeConflicts},
		{name: "line-endings", fn: codebasefx.ValidateLineEndings},
		{name: "secrets", fn: codebasefx.ValidateSecrets},
	}
}

// validatorsByName maps every requestable short name to its validator. The
// options of configurable validators are read here, so malformed options fail
// the request before any file is read.
func validatorsByName(opts map[string]any) (map[string]codebasefx.ValidatorFunc, error) {
	largeFile, err := resolveLargeFileValidator(opts)
	if err != nil {
		return nil, err
	}

	filenames, err := resolveFilenameValidator(opts)
	if err != nil {
		return nil, err
	}

	namingTodosOpts, err := validatorOptionsFor(opts, "naming-and-todos")
	if err != nil {
		return nil, err
	}

	allowNames, err := codebasefx.ParseAllowNames(namingTodosOpts["allowNames"])
	if err != nil {
		return nil, fmt.Errorf(`validatorOptions["naming-and-todos"]: %w`, err)
	}

	errorCoverage, err := optionalValidator(opts, "error-coverage", codebasefx.ParseErrorCoverageOptions)
	if err != nil {
		return nil, err
	}

	serverLoc, err := optionalValidator(opts, "server-loc", codebasefx.ParseServerLocOptions)
	if err != nil {
		return nil, err
	}

	return map[string]codebasefx.ValidatorFunc{
		"eof":              codebasefx.ValidateEOF,
		"bom":              codebasefx.ValidateBOM,
		"trailing":         codebasefx.ValidateTrailingWhitespace,
		"line-endings":     codebasefx.ValidateLineEndings,
		"merge-conflicts":  codebasefx.ValidateMergeConflicts,
		"secrets":          codebasefx.ValidateSecrets,
		"large-file":       largeFile,
		"json":             codebasefx.ValidateJSON,
		"yaml":             codebasefx.ValidateYAML,
		"toml":             codebasefx.ValidateTOML,
		"license":          codebasefx.ValidateLicenseHeader,
		"case-conflict":    codebasefx.ValidateCaseConflict(),
		"symlinks":         codebasefx.ValidateSymlinks(),
		"submodules":       codebasefx.ValidateSubmodules(),
		"shebangs":         codebasefx.ValidateShebangs,
		"runtime-js-apis":  codebasefx.ValidateRuntimeJSAPIs,
		"filenames":        filenames,
		"naming-and-todos": codebasefx.ValidateNamingAndTodos(allowNames),
		"self-imports":     codebasefx.ValidateSelfImports,
		"error-coverage":   errorCoverage,
		"server-loc":       serverLoc,
	}, nil
}

// optionalValidator builds a validator whose required options may be absent
// from a request that does not run it: then it answers with the parse error
// as an issue only if it is actually requested and run.
func optionalValidator(
	opts map[string]any,
	name string,
	parse func(map[string]any) (codebasefx.ValidatorFunc, error),
) (codebasefx.ValidatorFunc, error) {
	entryOpts, err := validatorOptionsFor(opts, name)
	if err != nil {
		return nil, err
	}

	vf, err := parse(entryOpts)
	if errors.Is(err, codebasefx.ErrMissingOption) {
		return nil, nil //nolint:nilnil // absent options: resolveValidatorEntries reports it if requested
	}

	if err != nil {
		return nil, fmt.Errorf("validatorOptions[%q]: %w", name, err)
	}

	return vf, nil
}

// resolveValidatorEntries maps requested names to name/validator pairs, in the
// order requested. Empty/nil = the builtin set.
//
// An unknown name is an error rather than a silent drop: dropping it shortened
// the validator list while the reported names still echoed the request, so
// every result after the dropped entry carried the wrong name.
func resolveValidatorEntries(
	names []string,
	opts map[string]any,
) ([]validatorEntry, error) {
	if len(names) == 0 {
		return defaultValidatorEntries(), nil
	}

	all, err := validatorsByName(opts)
	if err != nil {
		return nil, err
	}

	entries := make([]validatorEntry, 0, len(names))

	for _, name := range names {
		vf, ok := all[name]
		if !ok {
			return nil, fmt.Errorf("%w: %q", ErrUnknownValidator, name)
		}

		if vf == nil {
			return nil, fmt.Errorf("%w: validatorOptions[%q] lacks its required option", codebasefx.ErrMissingOption, name)
		}

		entries = append(entries, validatorEntry{name: name, fn: vf})
	}

	return entries, nil
}

// runValidatorEntries runs the paired validators over files and labels each
// result with the name it was resolved from.
func runValidatorEntries(
	files []codebasefx.FileEntry,
	entries []validatorEntry,
) []codebaseValidatorResultJSON {
	funcs := make([]codebasefx.ValidatorFunc, 0, len(entries))
	for _, e := range entries {
		funcs = append(funcs, e.fn)
	}

	rawResults := codebasefx.RunValidators(files, funcs)

	out := make([]codebaseValidatorResultJSON, 0, len(rawResults))

	for i, r := range rawResults {
		issues := make([]codebaseValidatorIssueJSON, 0, len(r.Issues))
		for _, iss := range r.Issues {
			issues = append(issues, codebaseValidatorIssueJSON{
				Severity: iss.Severity,
				File:     iss.File,
				Line:     iss.Line,
				Message:  iss.Message,
			})
		}

		out = append(out, codebaseValidatorResultJSON{
			Name:         entries[i].name,
			Passed:       r.Passed,
			Issues:       issues,
			FilesChecked: r.FilesChecked,
		})
	}

	return out
}

// ---------------------------------------------------------------------------
// Workspace check bridge
// ---------------------------------------------------------------------------

type workspaceCheckRequest struct {
	Dir             string   `json:"dir"`
	IgnoreWords     []string `json:"ignoreWords,omitempty"`
	RequireExamples bool     `json:"requireExamples"`
}

// bridgeCodebaseCheckCircularDeps detects inter-package circular dependencies.
func bridgeCodebaseCheckCircularDeps(requestJSON string) string {
	var req workspaceCheckRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	root := req.Dir
	if root == "" {
		root = "."
	}

	result, err := codebasefx.CheckCircularDeps(root)
	if err != nil {
		return marshalError(err.Error())
	}

	return marshalResponse(result)
}

// bridgeCodebaseCheckExportNames validates JSR manifest export path naming.
func bridgeCodebaseCheckExportNames(requestJSON string) string {
	var req workspaceCheckRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	root := req.Dir
	if root == "" {
		root = "."
	}

	result, err := codebasefx.CheckExportNames(root, req.IgnoreWords)
	if err != nil {
		return marshalError(err.Error())
	}

	return marshalResponse(result)
}

// bridgeCodebaseCheckModExports reports top-level modules no package entry point reaches.
func bridgeCodebaseCheckModExports(requestJSON string) string {
	var req workspaceCheckRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	root := req.Dir
	if root == "" {
		root = "."
	}

	result, err := codebasefx.CheckModExports(root)
	if err != nil {
		return marshalError(err.Error())
	}

	return marshalResponse(result)
}

// bridgeCodebaseCheckDocs validates JSDoc documentation on exported symbols.
func bridgeCodebaseCheckDocs(requestJSON string) string {
	var req workspaceCheckRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	root := req.Dir
	if root == "" {
		root = "."
	}

	result, err := codebasefx.CheckDocs(root, req.RequireExamples)
	if err != nil {
		return marshalError(err.Error())
	}

	return marshalResponse(result)
}

// ---------------------------------------------------------------------------
// Codebase streaming bridges
// ---------------------------------------------------------------------------

type codebaseWalkStreamState struct {
	ch     chan string
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

type codebaseValidateStreamState struct {
	ch     chan string
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

var (
	codebaseWalkStreamMu      sync.RWMutex
	codebaseWalkStreamHandles = make(map[string]*codebaseWalkStreamState)

	codebaseValidateStreamMu      sync.RWMutex
	codebaseValidateStreamHandles = make(map[string]*codebaseValidateStreamState)
)

// bridgeCodebaseWalkFilesStreamCreate starts a streaming file walk and returns a handle.
func bridgeCodebaseWalkFilesStreamCreate(requestJSON string) string {
	var req codebaseWalkRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	ctx, cancel := context.WithCancel(context.Background()) //nolint:gosec // cancel is stored in state.cancel and invoked by Close and by the drain path in ...StreamRead

	state := &codebaseWalkStreamState{
		ch:     make(chan string, 64),
		cancel: cancel,
	}
	state.wg.Add(1)

	go func() {
		defer state.wg.Done()
		defer close(state.ch)
		// This goroutine outlives the guarded export call, so it recovers on
		// its own: an escaping panic would abort the host process.
		defer func() {
			if recovered := recover(); recovered != nil {
				select {
				case state.ch <- marshalError(reportPanic(recovered)):
				case <-ctx.Done():
				}
			}
		}()

		entries, err := codebasefx.WalkSourceFiles(ctx, codebasefx.WalkOptions{
			Root:       req.Dir,
			Extensions: req.Extensions,
			Exclude:    req.Exclude,
			GitAware:   req.GitAware,
		})
		if err != nil {
			select {
			case state.ch <- marshalError(err.Error()):
			case <-ctx.Done():
			}

			return
		}

		for _, e := range entries {
			item := marshalResponse(codebaseFileJSON{
				Path:      e.Path,
				Name:      e.Name,
				Size:      e.Size,
				IsSymlink: e.IsSymlink,
			})

			select {
			case state.ch <- item:
			case <-ctx.Done():
				return
			}
		}
	}()

	handle := newHandle("cbwalk")

	codebaseWalkStreamMu.Lock()
	codebaseWalkStreamHandles[handle] = state
	codebaseWalkStreamMu.Unlock()

	return marshalResponse(aiHandleResponse{Handle: handle}) //nolint:exhaustruct
}

// bridgeCodebaseWalkFilesStreamRead reads the next file entry from a walk stream.
// Returns "null" when the stream is complete or the handle is gone.
func bridgeCodebaseWalkFilesStreamRead(handle string) string {
	codebaseWalkStreamMu.RLock()
	state, ok := codebaseWalkStreamHandles[handle]

	if ok {
		state.wg.Add(1)
	}
	codebaseWalkStreamMu.RUnlock()

	// "null" for an unknown handle is the deliberate stream-done sentinel:
	// draining past the end and reading after a close both look the same to the
	// caller. Close, not this read, is the authoritative lifecycle signal.
	if !ok {
		return "null"
	}
	defer state.wg.Done()

	item, open := <-state.ch
	if !open {
		codebaseWalkStreamMu.Lock()
		delete(codebaseWalkStreamHandles, handle)
		codebaseWalkStreamMu.Unlock()

		// The producer finished on its own, so Close will never run for this
		// handle. Release the context here or its resources outlive the stream.
		state.cancel()

		return "null"
	}

	return item
}

// bridgeCodebaseWalkFilesStreamClose cancels and removes a walk stream handle.
//
//nolint:unparam // uniform string return is part of the exported C ABI
func bridgeCodebaseWalkFilesStreamClose(handle string) string {
	codebaseWalkStreamMu.Lock()
	state, ok := codebaseWalkStreamHandles[handle]

	if ok {
		delete(codebaseWalkStreamHandles, handle)
	}
	codebaseWalkStreamMu.Unlock()

	if !ok {
		return "{}"
	}

	state.cancel()
	state.wg.Wait()

	return "{}"
}

// bridgeCodebaseValidateFilesStreamCreate starts a streaming validator run and returns a handle.
func bridgeCodebaseValidateFilesStreamCreate(requestJSON string) string {
	var req codebaseValidateRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	ctx, cancel := context.WithCancel(context.Background()) //nolint:gosec // cancel is stored in state.cancel and invoked by Close and by the drain path in ...StreamRead

	state := &codebaseValidateStreamState{
		ch:     make(chan string, 16),
		cancel: cancel,
	}
	state.wg.Add(1)

	go func() {
		defer state.wg.Done()
		defer close(state.ch)
		// This goroutine outlives the guarded export call, so it recovers on
		// its own: an escaping panic would abort the host process.
		defer func() {
			if recovered := recover(); recovered != nil {
				select {
				case state.ch <- marshalError(reportPanic(recovered)):
				case <-ctx.Done():
				}
			}
		}()

		files, err := codebasefx.WalkSourceFiles(ctx, codebasefx.WalkOptions{
			Root:       req.Dir,
			Extensions: req.Extensions,
			GitAware:   req.GitAware,
		})
		if err != nil {
			select {
			case state.ch <- marshalError(err.Error()):
			case <-ctx.Done():
			}

			return
		}

		entries, err := resolveValidatorEntries(req.Validators, req.ValidatorOptions)
		if err != nil {
			select {
			case state.ch <- marshalError(err.Error()):
			case <-ctx.Done():
			}

			return
		}

		for _, result := range runValidatorEntries(files, entries) {
			select {
			case state.ch <- marshalResponse(result):
			case <-ctx.Done():
				return
			}
		}
	}()

	handle := newHandle("cbval")

	codebaseValidateStreamMu.Lock()
	codebaseValidateStreamHandles[handle] = state
	codebaseValidateStreamMu.Unlock()

	return marshalResponse(aiHandleResponse{Handle: handle}) //nolint:exhaustruct
}

// bridgeCodebaseValidateFilesStreamRead reads the next validator result from a validate stream.
// Returns "null" when the stream is complete or the handle is gone.
func bridgeCodebaseValidateFilesStreamRead(handle string) string {
	codebaseValidateStreamMu.RLock()
	state, ok := codebaseValidateStreamHandles[handle]

	if ok {
		state.wg.Add(1)
	}
	codebaseValidateStreamMu.RUnlock()

	// "null" for an unknown handle is the deliberate stream-done sentinel:
	// draining past the end and reading after a close both look the same to the
	// caller. Close, not this read, is the authoritative lifecycle signal.
	if !ok {
		return "null"
	}
	defer state.wg.Done()

	item, open := <-state.ch
	if !open {
		codebaseValidateStreamMu.Lock()
		delete(codebaseValidateStreamHandles, handle)
		codebaseValidateStreamMu.Unlock()

		// The producer finished on its own, so Close will never run for this
		// handle. Release the context here or its resources outlive the stream.
		state.cancel()

		return "null"
	}

	return item
}

// bridgeCodebaseValidateFilesStreamClose cancels and removes a validate stream handle.
//
//nolint:unparam // uniform string return is part of the exported C ABI
func bridgeCodebaseValidateFilesStreamClose(handle string) string {
	codebaseValidateStreamMu.Lock()
	state, ok := codebaseValidateStreamHandles[handle]

	if ok {
		delete(codebaseValidateStreamHandles, handle)
	}
	codebaseValidateStreamMu.Unlock()

	if !ok {
		return "{}"
	}

	state.cancel()
	state.wg.Wait()

	return "{}"
}

func init() {
	registerShutdownDrain(drainCodebaseStreams)
	register("codebaseValidateCommitMsg", []string{"requestJSON"}, func(a []string) string { return bridgeCodebaseValidateCommitMsg(a[0]) })
	register("codebaseBumpVersion", []string{"requestJSON"}, func(a []string) string { return bridgeCodebaseBumpVersion(a[0]) })
	register("codebaseWalkFiles", []string{"requestJSON"}, func(a []string) string { return bridgeCodebaseWalkFiles(a[0]) })
	register("codebaseValidateFiles", []string{"requestJSON"}, func(a []string) string { return bridgeCodebaseValidateFiles(a[0]) })
	register("codebaseCheckCircularDeps", []string{"requestJSON"}, func(a []string) string { return bridgeCodebaseCheckCircularDeps(a[0]) })
	register("codebaseCheckExportNames", []string{"requestJSON"}, func(a []string) string { return bridgeCodebaseCheckExportNames(a[0]) })
	register("codebaseCheckModExports", []string{"requestJSON"}, func(a []string) string { return bridgeCodebaseCheckModExports(a[0]) })
	register("codebaseCheckDocs", []string{"requestJSON"}, func(a []string) string { return bridgeCodebaseCheckDocs(a[0]) })
	register("codebaseWalkFilesStreamCreate", []string{"requestJSON"}, func(a []string) string { return bridgeCodebaseWalkFilesStreamCreate(a[0]) })
	register("codebaseWalkFilesStreamRead", []string{"handle"}, func(a []string) string { return bridgeCodebaseWalkFilesStreamRead(a[0]) })
	register("codebaseWalkFilesStreamClose", []string{"handle"}, func(a []string) string { return bridgeCodebaseWalkFilesStreamClose(a[0]) })
	register("codebaseValidateFilesStreamCreate", []string{"requestJSON"}, func(a []string) string { return bridgeCodebaseValidateFilesStreamCreate(a[0]) })
	register("codebaseValidateFilesStreamRead", []string{"handle"}, func(a []string) string { return bridgeCodebaseValidateFilesStreamRead(a[0]) })
	register("codebaseValidateFilesStreamClose", []string{"handle"}, func(a []string) string { return bridgeCodebaseValidateFilesStreamClose(a[0]) })
}
