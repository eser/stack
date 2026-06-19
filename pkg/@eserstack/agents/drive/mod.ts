// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Autonomous driving: read a pane's terminal, detect agent state, and inject
 * gated messages.
 *
 * @module
 */

export { inject } from "./injector.ts";
export { createReader } from "./reader.ts";
export type { Reader, ReaderIo } from "./reader.ts";
export {
  type AuditEntry,
  type Autonomy,
  createSafety,
  defaultSafetyPolicy,
  type GateResult,
  type Safety,
  type SafetyOptions,
  type SafetyPolicy,
} from "./safety.ts";
export {
  type AgentIo,
  createDrivingLoop,
  type DriveEvent,
  type DrivingLoop,
  type DrivingLoopOptions,
} from "./loop.ts";
