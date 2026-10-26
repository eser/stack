// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// ---------------------------------------------------------------------------
// Noskills bridge — wire types
// ---------------------------------------------------------------------------

type noskillsInitRequest struct {
	Root string `json:"root"`
}

type noskillsInitResponse struct {
	Root  string `json:"root,omitempty"`
	Error string `json:"error,omitempty"`
}

type noskillsSpecNewRequest struct {
	Root        string `json:"root"`
	Description string `json:"description,omitempty"`
	SpecName    string `json:"specName,omitempty"`
	PlanPath    string `json:"planPath,omitempty"`
}

type noskillsSpecNewResponse struct {
	SpecName string `json:"specName,omitempty"`
	SpecFile string `json:"specFile,omitempty"`
	Error    string `json:"error,omitempty"`
}

type noskillsNextRequest struct {
	Root     string `json:"root"`
	SpecName string `json:"specName,omitempty"`
	Answer   string `json:"answer,omitempty"`
}

// noskillsErrResponse is used when an error must be returned without any
// NextOutput fields (callers check result.error !== undefined).
type noskillsErrResponse struct {
	Error string `json:"error"`
}

// The three entry points run the lifecycle commands of noskillsfx, the
// ones the noskills CLI and noskills-server run, so the files they leave and
// the answers they give are the CLI's. They are not in the WASM profile:
// the full lifecycle (TASK-258) adds about 1.7 MB to the module, past the
// 8 MB limit of TASK-272, so on wasip1 the names answer UNSUPPORTED_IN_WASM.

// ---------------------------------------------------------------------------
// bridgeNoskillsInit: `init --agent` without the tool files
// ---------------------------------------------------------------------------

func bridgeNoskillsInit(requestJSON string) string {
	var req noskillsInitRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(noskillsInitResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	root, err := noskillsfx.ResolveProjectRoot(req.Root)
	if err != nil {
		return marshalResponse(noskillsInitResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	env := noskillsEnv(root)
	if _, err := noskillsfx.InitWithoutPrompts(env, providerProbe(context.Background()),
		noskillsfx.DefaultCommandPrefix); err != nil {
		return marshalResponse(noskillsInitResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(noskillsInitResponse{Root: root}) //nolint:exhaustruct
}

// ---------------------------------------------------------------------------
// bridgeNoskillsSpecNew: `spec new`
// ---------------------------------------------------------------------------

func bridgeNoskillsSpecNew(requestJSON string) string {
	var req noskillsSpecNewRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(noskillsSpecNewResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	root, err := noskillsfx.ResolveProjectRoot(req.Root)
	if err != nil {
		return marshalResponse(noskillsSpecNewResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	if !noskillsfx.IsHookInitialized(root) {
		return marshalResponse(noskillsSpecNewResponse{Error: "noskills not initialized — call noskillsInit first"}) //nolint:exhaustruct
	}

	name := req.SpecName
	if noskillsfx.LooksLikeDescription(name) {
		name = ""
	}

	result, err := noskillsfx.SpecNew(context.Background(), noskillsEnv(root), noskillsfx.SpecNewOptions{
		Name: name, Description: req.Description, PlanPath: req.PlanPath,
	})
	if err != nil {
		return marshalResponse(noskillsSpecNewResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	if result.Interactive != nil {
		return marshalResponse(noskillsSpecNewResponse{Error: "specName or description is required"}) //nolint:exhaustruct
	}

	return marshalResponse(noskillsSpecNewResponse{ //nolint:exhaustruct
		SpecName: result.Name,
		SpecFile: filepath.Join(root, filepath.FromSlash(result.Directory), "spec.md"),
	})
}

// ---------------------------------------------------------------------------
// bridgeNoskillsNext: `next`, with or without an answer
// ---------------------------------------------------------------------------

func bridgeNoskillsNext(requestJSON string) string {
	var req noskillsNextRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(noskillsErrResponse{fmt.Errorf("invalid request JSON: %w", err).Error()})
	}

	root, err := noskillsfx.ResolveProjectRoot(req.Root)
	if err != nil {
		return marshalResponse(noskillsErrResponse{err.Error()})
	}

	var answer *string
	if req.Answer != "" {
		answer = &req.Answer
	}

	result, err := noskillsfx.Next(context.Background(), noskillsEnv(root), noskillsfx.NextOptions{
		Spec: req.SpecName, Answer: answer, Audience: "",
	})
	if err != nil {
		return marshalResponse(noskillsErrResponse{err.Error()})
	}

	// The CLI's JSON, key for key; an error answer is {"error": ...}.
	return result.Output.String()
}

func init() {
	register("noskillsInit", bridgeNoskillsInit)
	register("noskillsSpecNew", bridgeNoskillsSpecNew)
	register("noskillsNext", bridgeNoskillsNext)
}
