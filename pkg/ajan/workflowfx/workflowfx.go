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
//
// # Manifest files
//
// LoadManifest reads .eser/manifest.yml (or .eser/manifest.yaml) and
// ParseManifest parses manifest bytes. Both validate against the manifest
// schema, docs/schema/manifest.json (embedded as manifest_schema.json), and
// return the workflows as definitions and the scripts as ScriptConfig values.
// A step is a tool name or a one-key map from the tool name to its options;
// the keys continueOnError, timeout (seconds), if, bypass, loop and
// inputSchema are engine directives and are taken out of the options. Every
// problem is a *ManifestError naming the file, the YAML path and the line:
//
//	.eser/manifest.yml:154: workflows[0].steps[12].shell.timeout: exclusiveMinimum: got 0, want 0
//
//	config, err := workflowfx.LoadManifest(".")
//	results, err := workflowfx.RunByEvent(ctx, "precommit", config.Workflows, reg, nil)
package workflowfx
