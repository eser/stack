// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * noskills — state-machine orchestrator for AI agents.
 *
 * @module
 */

export { moduleDef } from "./module.ts";

// Public API for programmatic consumers
export type {
  ConcernDefinition,
  Decision,
  NosConfig,
  Phase,
  StateFile,
} from "./state/schema.ts";
export { createInitialConfig, createInitialState } from "./state/schema.ts";
export * as machine from "./state/machine.ts";
export * as persistence from "./state/persistence.ts";
export * as compiler from "./context/compiler.ts";
export * as concerns from "./context/concerns.ts";
export * as questions from "./context/questions.ts";
