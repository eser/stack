// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Dashboard actions — thin wrappers around machine.ts that add event logging.
 *
 * @module
 */

import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";
import * as identity from "../state/identity.ts";
import * as specUpdater from "../spec/updater.ts";
import * as events from "./events.ts";
import type { User } from "./state.ts";

// =============================================================================
// Result type
// =============================================================================

export type ActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

// =============================================================================
// Helpers
// =============================================================================

const resolveUser = async (
  root: string,
  user?: User,
): Promise<{ name: string; email: string }> => {
  if (user !== undefined) return user;
  return await identity.resolveUser(root);
};

// =============================================================================
// Actions
// =============================================================================

/** Approve a spec draft — transitions SPEC_PROPOSAL → SPEC_APPROVED. */
export const approve = async (
  root: string,
  specName: string,
  user?: User,
): Promise<ActionResult> => {
  try {
    let state = await persistence.resolveState(root, specName);

    if (state.phase !== "SPEC_PROPOSAL") {
      return { ok: false, error: `Cannot approve in phase: ${state.phase}` };
    }

    const resolved = await resolveUser(root, user);
    state = machine.approveSpec(state);
    state = machine.recordTransition(
      state,
      "SPEC_PROPOSAL",
      "SPEC_APPROVED",
      resolved,
    );
    await persistence.writeSpecState(root, specName, state);

    await events.appendEvent(root, {
      ts: new Date().toISOString(),
      type: "phase-change",
      spec: specName,
      user: resolved.name,
      from: "SPEC_PROPOSAL",
      to: "SPEC_APPROVED",
    });

    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

/** Add a note to a spec. */
export const addNote = async (
  root: string,
  specName: string,
  text: string,
  user?: User,
): Promise<ActionResult> => {
  try {
    let state = await persistence.resolveState(root, specName);
    const resolved = await resolveUser(root, user);

    state = machine.addSpecNote(state, text, resolved);
    await persistence.writeSpecState(root, specName, state);

    await events.appendEvent(root, {
      ts: new Date().toISOString(),
      type: "note",
      spec: specName,
      user: resolved.name,
      text,
    });

    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

/** Add a question to a spec (stored as a [QUESTION] note). */
export const addQuestion = async (
  root: string,
  specName: string,
  text: string,
  user?: User,
): Promise<ActionResult> => {
  try {
    let state = await persistence.resolveState(root, specName);
    const resolved = await resolveUser(root, user);

    state = machine.addSpecNote(state, `[QUESTION] ${text}`, resolved);
    await persistence.writeSpecState(root, specName, state);

    await events.appendEvent(root, {
      ts: new Date().toISOString(),
      type: "mention",
      spec: specName,
      user: resolved.name,
      from: resolved.name,
      to: "",
      question: text,
      id: `mention-${Date.now()}`,
    });

    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

/** Sign off on a spec. */
export const signoff = async (
  root: string,
  specName: string,
  user?: User,
): Promise<ActionResult> => {
  try {
    const resolved = await resolveUser(root, user);

    await events.appendEvent(root, {
      ts: new Date().toISOString(),
      type: "signoff",
      spec: specName,
      user: resolved.name,
      role: "reviewer",
      status: "signed",
    });

    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

/** Reply to a mention. */
export const replyMention = async (
  root: string,
  specName: string,
  mentionId: string,
  text: string,
  user?: User,
): Promise<ActionResult> => {
  try {
    let state = await persistence.resolveState(root, specName);
    const resolved = await resolveUser(root, user);

    state = machine.addSpecNote(
      state,
      `[REPLY:${mentionId}] ${text}`,
      resolved,
    );
    await persistence.writeSpecState(root, specName, state);

    await events.appendEvent(root, {
      ts: new Date().toISOString(),
      type: "mention-reply",
      spec: specName,
      user: resolved.name,
      mentionId,
      text,
    });

    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

/** Mark a spec as complete. */
export const complete = async (
  root: string,
  specName: string,
  user?: User,
): Promise<ActionResult> => {
  try {
    const state = await persistence.resolveState(root, specName);

    if (state.phase !== "EXECUTING") {
      return { ok: false, error: `Cannot complete in phase: ${state.phase}` };
    }

    const resolved = await resolveUser(root, user);
    let completedState = machine.completeSpec(state, "done");
    completedState = machine.recordTransition(
      completedState,
      "EXECUTING",
      "COMPLETED",
      resolved,
    );

    // Per-spec: COMPLETED
    await persistence.writeSpecState(root, specName, completedState);

    // Global: return to IDLE
    const idleState = machine.resetToIdle(completedState);
    await persistence.writeState(root, idleState);

    // Update spec.md
    try {
      await specUpdater.updateSpecStatus(root, specName, "completed");
      await specUpdater.updateProgressStatus(root, specName, "completed");
    } catch {
      // best effort
    }

    await events.appendEvent(root, {
      ts: new Date().toISOString(),
      type: "phase-change",
      spec: specName,
      user: resolved.name,
      from: "EXECUTING",
      to: "COMPLETED",
    });

    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};
