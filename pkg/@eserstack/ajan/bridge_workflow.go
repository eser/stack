// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/eser/stack/pkg/ajan/codebasefx/validatortools"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// ---------------------------------------------------------------------------
// Workflow bridge — wire types
// ---------------------------------------------------------------------------

type workflowRunRequest struct {
	ChangedFiles []string           `json:"changedFiles,omitempty"`
	Workflows    []workflowDefInput `json:"workflows"`
	Root         string             `json:"root"`
	Event        string             `json:"event,omitempty"`
	WorkflowID   string             `json:"workflowId,omitempty"`
	Only         string             `json:"only,omitempty"`
	// Manifest is the text of a .eser/manifest.yml; when set, its workflows
	// (in the manifest's own step format) replace Workflows.
	Manifest  string   `json:"manifest,omitempty"`
	Args      []string `json:"args,omitempty"`
	TimeoutMs int      `json:"timeoutMs,omitempty"`
	Fix       bool     `json:"fix"`
	DryRun    bool     `json:"dryRun,omitempty"`
}

type workflowDefInput struct {
	Includes []string            `json:"includes,omitempty"`
	ID       string              `json:"id"`
	On       []string            `json:"on"`
	Steps    []workflowStepInput `json:"steps"`
}

type workflowStepInput struct {
	Options         map[string]any  `json:"options,omitempty"`
	InputSchema     json.RawMessage `json:"inputSchema,omitempty"`
	Name            string          `json:"name"`
	ContinueOnError bool            `json:"continueOnError,omitempty"`
	TimeoutMs       int             `json:"timeoutMs,omitempty"`
	Bypass          bool            `json:"bypass,omitempty"`
}

type workflowRunResponse struct {
	Results []workflowResultResp `json:"results,omitempty"`
	Error   string               `json:"error,omitempty"`
}

type workflowResultResp struct {
	Steps           []workflowStepResp `json:"steps"`
	Stats           map[string]any     `json:"stats,omitempty"`
	ID              string             `json:"id"`
	WorkflowID      string             `json:"workflowId"` // the TypeScript engine's name for id
	TotalDurationMs float64            `json:"totalDurationMs"`
	Passed          bool               `json:"passed"`
}

type workflowStepResp struct {
	Issues     []workflowIssueResp    `json:"issues,omitempty"`
	Mutations  []workflowMutationResp `json:"mutations,omitempty"`
	Stats      map[string]any         `json:"stats,omitempty"`
	Name       string                 `json:"name"`
	DurationMs float64                `json:"durationMs"`
	Passed     bool                   `json:"passed"`
}

type workflowIssueResp struct {
	Path    string `json:"path,omitempty"`
	Message string `json:"message"`
	Line    int    `json:"line,omitempty"`
	Fixed   bool   `json:"fixed,omitempty"`
}

type workflowMutationResp struct {
	Path       string `json:"path"`
	OldContent string `json:"oldContent"`
	NewContent string `json:"newContent"`
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Workflow bridge functions
// ---------------------------------------------------------------------------

// bridgeWorkflowRun runs all workflows matching the given event.
// Only the built-in "shell" tool is available for step execution.
// Callers pass workflow definitions inline as JSON; tools must use name "shell".
func bridgeWorkflowRun(requestJSON string) string {
	var req workflowRunRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(workflowRunResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	if req.Event == "" && req.WorkflowID == "" {
		return marshalResponse(workflowRunResponse{Error: "event or workflowId is required"}) //nolint:exhaustruct
	}

	// The shell tool and the codebase validators, under the manifest's step
	// names as well as their codebase-* names.
	registry := workflowfx.NewRegistry()
	registry.Register(workflowfx.NewShellTool())
	validatortools.RegisterManifestTools(registry)

	defs := make([]*workflowfx.WorkflowDefinition, 0, len(req.Workflows))

	if req.Manifest != "" {
		config, err := workflowfx.ParseManifest("manifest", []byte(req.Manifest))
		if err != nil {
			return marshalResponse(workflowRunResponse{Error: err.Error()}) //nolint:exhaustruct
		}

		defs = config.Workflows
		req.Workflows = nil
	}

	for _, wd := range req.Workflows {
		steps := make([]workflowfx.StepConfig, 0, len(wd.Steps))

		for _, s := range wd.Steps {
			opts := s.Options
			if opts == nil {
				opts = make(map[string]any)
			}

			cfg := workflowfx.StepConfig{ //nolint:exhaustruct
				Name:            s.Name,
				Options:         opts,
				ContinueOnError: s.ContinueOnError,
				Bypass:          s.Bypass,
				InputSchema:     s.InputSchema,
			}

			if s.TimeoutMs > 0 {
				cfg.Timeout = time.Duration(s.TimeoutMs) * time.Millisecond
			}

			steps = append(steps, cfg)
		}

		defs = append(defs, &workflowfx.WorkflowDefinition{
			ID:       wd.ID,
			On:       wd.On,
			Steps:    steps,
			Includes: wd.Includes,
		})
	}

	root := req.Root
	if root == "" {
		root = "."
	}

	var defaultTimeout time.Duration
	if req.TimeoutMs > 0 {
		defaultTimeout = time.Duration(req.TimeoutMs) * time.Millisecond
	}

	runOpts := &workflowfx.RunOptions{ //nolint:exhaustruct
		Root:           root,
		Fix:            req.Fix,
		DryRun:         req.DryRun,
		Args:           req.Args,
		Only:           req.Only,
		ChangedFiles:   req.ChangedFiles,
		DefaultTimeout: defaultTimeout,
	}

	var results []*workflowfx.WorkflowResult

	if req.WorkflowID != "" {
		cfg := &workflowfx.WorkflowsConfig{Workflows: defs} //nolint:exhaustruct
		r, err := workflowfx.RunWorkflowWithConfig(context.Background(), req.WorkflowID, cfg, registry, runOpts)
		if err != nil {
			return marshalResponse(workflowRunResponse{Error: err.Error()}) //nolint:exhaustruct
		}
		results = []*workflowfx.WorkflowResult{r}
	} else {
		var err error
		results, err = workflowfx.RunByEvent(context.Background(), req.Event, defs, registry, runOpts)
		if err != nil {
			return marshalResponse(workflowRunResponse{Error: err.Error()}) //nolint:exhaustruct
		}
	}

	resp := make([]workflowResultResp, 0, len(results))

	for _, r := range results {
		steps := make([]workflowStepResp, 0, len(r.Steps))

		for _, s := range r.Steps {
			issues := make([]workflowIssueResp, 0, len(s.Issues))
			for _, i := range s.Issues {
				issues = append(issues, workflowIssueResp{
					Path:    i.Path,
					Line:    i.Line,
					Message: i.Message,
					Fixed:   i.Fixed,
				})
			}

			mutations := make([]workflowMutationResp, 0, len(s.Mutations))
			for _, m := range s.Mutations {
				mutations = append(mutations, workflowMutationResp{
					Path:       m.Path,
					OldContent: m.OldContent,
					NewContent: m.NewContent,
				})
			}

			steps = append(steps, workflowStepResp{
				Name:       s.Name,
				Passed:     s.Passed,
				Issues:     issues,
				Mutations:  mutations,
				Stats:      s.Stats,
				DurationMs: s.DurationMs,
			})
		}

		resp = append(resp, workflowResultResp{ //nolint:exhaustruct
			ID:              r.ID,
			WorkflowID:      r.ID,
			Passed:          r.Passed,
			Steps:           steps,
			TotalDurationMs: r.TotalDurationMs,
		})
	}

	return marshalResponse(workflowRunResponse{Results: resp}) //nolint:exhaustruct
}

func init() {
	register("workflowRun", bridgeWorkflowRun)
}
