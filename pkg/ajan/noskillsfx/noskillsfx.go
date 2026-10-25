// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package noskillsfx is a Go port of the @eserstack/noskills state machine.
//
// noskillsfx manages the lifecycle of a software specification through 9
// ordered phases: UNINITIALIZED → IDLE → DISCOVERY → DISCOVERY_REFINEMENT →
// SPEC_PROPOSAL → SPEC_APPROVED → EXECUTING → (BLOCKED ↔ EXECUTING) → COMPLETED.
//
// # State persistence
//
// Runtime state is stored under .eser/.state/ in the project root:
//
//	.eser/.state/progresses/state.json   — active workflow state
//	.eser/.state/progresses/specs/       — per-spec state files
//	.eser/.state/sessions/               — ephemeral session bindings
//	.eser/manifest.yml                   — project config (YAML)
//	.eser/specs/<name>/spec.md           — living spec documents
//	.eser/concerns/*.json                — concern definitions
//
// The lifecycle commands (spec new, next, status, approve, done, followup,
// init) work on the state files as JSON objects that keep their fields and
// key order, so a file the TypeScript CLI wrote reads back unchanged and a
// file written here is the one the TypeScript CLI would write. The typed
// StateFile in schema.go is for callers that only read a few fields.
//
// # Quick Start
//
//	env := noskillsfx.ServiceLifecycleEnv("/path/to/project")
//
//	spec, err := noskillsfx.SpecNew(ctx, env, noskillsfx.SpecNewOptions{Description: "Add feature X"})
//	answer := "Users sign in with an email and a password"
//	result, err := noskillsfx.Next(ctx, env, noskillsfx.NextOptions{Spec: spec.Name, Answer: &answer})
//	fmt.Println(result.Output) // the instruction, as `noskills next` prints it
package noskillsfx
