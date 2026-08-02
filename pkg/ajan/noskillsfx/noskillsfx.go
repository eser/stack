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
// # Quick Start
//
//	root := "/path/to/project"
//	state, err := noskillsfx.ReadState(root)
//
//	state, err = noskillsfx.StartSpec(state, "my-feature", "feat/my-feature", "Add feature X")
//	err = noskillsfx.WriteState(root, state)
package noskillsfx
