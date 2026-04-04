// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Dashboard core — unified data/action layer for noskills state.
 *
 * Provides `getState()` for reading, actions for mutations, and event
 * JSONL for audit trail. Consumed by the TUI manager and (future) web UI.
 *
 * @module
 */

export { getSpecSummary, getState } from "./state.ts";
export type {
  DashboardState,
  Mention,
  Question,
  RoleMap,
  Signoff,
  SpecSummary,
  User,
} from "./state.ts";

export {
  addNote,
  addQuestion,
  approve,
  complete,
  replyMention,
  signoff,
} from "./actions.ts";
export type { ActionResult } from "./actions.ts";

export { appendEvent, readEvents, watchEvents } from "./events.ts";
export type { DashboardEvent, EventType } from "./events.ts";

export {
  addLearning,
  formatLearnings,
  getRelevantLearnings,
  readLearnings,
  removeLearning,
} from "./learnings.ts";
export type { Learning, LearningType } from "./learnings.ts";

export {
  checkStaleness,
  readRegistry,
  scanProject,
  verifyDiagram,
  writeRegistry,
} from "./diagrams.ts";
export type { DiagramEntry, DiagramType, StaleDiagram } from "./diagrams.ts";
