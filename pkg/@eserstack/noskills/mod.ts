// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The modules of the TypeScript noskills that `watch`, `web`, `manager` and
 * `@eserstack/noskills-web` use. Internal: the Go noskills (cmd/noskills) is
 * the noskills command, and this package serves the commands it forwards
 * until they are ported (TASK-266).
 *
 * @module
 */

export { moduleDef } from "./module.ts";

export type {
  CodingToolId,
  ConcernDefinition,
  ConcernReminder,
  ConcernScope,
  DebtState,
  Decision,
  ExecutionState,
  NosManifest,
  Phase,
  ScopedReminder,
  StateFile,
  StatusReport,
  ValidatorConfig,
  VerificationResult,
} from "./state/schema.ts";
export { createInitialManifest, createInitialState } from "./state/schema.ts";
export * as machine from "./state/machine.ts";
export * as persistence from "./state/persistence.ts";
export * as compiler from "./context/compiler.ts";
export * as concerns from "./context/concerns.ts";
export * as questions from "./context/questions.ts";
export * as formatter from "./output/formatter.ts";
export * as dashboard from "./dashboard/mod.ts";
