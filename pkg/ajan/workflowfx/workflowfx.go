// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package workflowfx provides a lightweight, event-driven workflow execution engine.
//
// Workflows are ordered sequences of tool steps. Each step resolves a named
// WorkflowTool from a Registry, applies per-step timeouts via context.WithTimeout,
// and aggregates results into a WorkflowResult.
//
// # Quick Start
//
//	// 1. Register tools
//	reg := workflowfx.NewRegistry()
//	reg.Register(myLintTool)
//	reg.Register(myFormatTool)
//
//	// 2. Define a workflow
//	wf := workflowfx.Create("ci").
//	    On("precommit").
//	    Step("lint").
//	    Step("format", workflowfx.StepOpts{"fix": true}).
//	    MustBuild()
//
//	// 3. Run it
//	result, err := workflowfx.RunWorkflow(ctx, wf, reg, &workflowfx.RunOptions{Fix: true})
//
// # Event dispatch
//
//	results, err := workflowfx.RunByEvent(ctx, "precommit", allWorkflows, reg, nil)
//
// # Workflow composition
//
//	workflowfx.Create("full-ci").
//	    On("prepush").
//	    Include("ci").          // prepend steps from "ci"
//	    Step("integration-tests").
//	    MustBuild()
package workflowfx
