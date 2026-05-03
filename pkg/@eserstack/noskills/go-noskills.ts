// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Go-backed noskills orchestrator client.
 *
 * Delegates to EserAjanNoskills* for spec management and step advancement
 * via the native Go library.
 *
 * Protocol:
 *   1. `initNoskills()` — initialise the session (called once per process)
 *   2. `newNoskillsSpec(description)` — create a new spec, returns spec name
 *   3. `nextNoskillsStep(specName, answer?)` — advance or query current step
 *
 * @module
 */

import { ensureLib, getLib } from "./ffi-client.ts";

export type NoskillsInitOptions = {
  readonly configDir?: string;
};

export type NoskillsInitResult = {
  readonly sessionId: string;
};

export type NoskillsSpecNewOptions = {
  readonly description: string;
  readonly mode?: string;
};

export type NoskillsSpecNewResult = {
  readonly name: string;
};

export type NoskillsNextOptions = {
  readonly specName: string;
  readonly answer?: string;
};

export type NoskillsNextResult = {
  readonly roadmap?: string;
  readonly gate?: string;
  readonly question?: string;
  readonly modeDirective?: string;
  readonly commandMap?: Record<string, string>;
  readonly interactiveOptions?: string[];
  readonly meta?: Record<string, unknown>;
  readonly phase?: string;
  readonly done?: boolean;
};

/**
 * Initialise the noskills session via the native Go library.
 *
 * @param options - Init options (optional configDir)
 * @returns Session identifier
 * @throws Error if the native library is unavailable.
 *
 * @example
 * ```typescript
 * import { initNoskills } from "@eserstack/noskills/go-noskills";
 *
 * const { sessionId } = await initNoskills();
 * ```
 */
export const initNoskills = async (
  options: NoskillsInitOptions = {},
): Promise<NoskillsInitResult> => {
  await ensureLib();
  const lib = getLib();

  if (lib === null) {
    throw new Error("native library not available for initNoskills");
  }

  const raw = lib.symbols.EserAjanNoskillsInit(JSON.stringify(options));
  const result = JSON.parse(raw) as NoskillsInitResult & { error?: string };

  if (result.error) {
    throw new Error(result.error);
  }

  return { sessionId: result.sessionId };
};

/**
 * Create a new noskills spec via the native Go library.
 *
 * @param options - Spec creation options
 * @returns Auto-generated spec name
 * @throws Error if the native library is unavailable.
 *
 * @example
 * ```typescript
 * import { newNoskillsSpec } from "@eserstack/noskills/go-noskills";
 *
 * const { name } = await newNoskillsSpec({ description: "add auth to the API" });
 * console.log(name); // e.g. "spec-abc123"
 * ```
 */
export const newNoskillsSpec = async (
  options: NoskillsSpecNewOptions,
): Promise<NoskillsSpecNewResult> => {
  await ensureLib();
  const lib = getLib();

  if (lib === null) {
    throw new Error("native library not available for newNoskillsSpec");
  }

  const raw = lib.symbols.EserAjanNoskillsSpecNew(JSON.stringify(options));
  const result = JSON.parse(raw) as NoskillsSpecNewResult & { error?: string };

  if (result.error) {
    throw new Error(result.error);
  }

  return { name: result.name };
};

/**
 * Advance or query the current step for a noskills spec.
 *
 * @param options - Step options: specName (required), answer (optional, submits current step)
 * @returns Current step details including roadmap, gate, question, and modeDirective
 * @throws Error if the native library is unavailable.
 *
 * @example
 * ```typescript
 * import { nextNoskillsStep } from "@eserstack/noskills/go-noskills";
 *
 * // Query current step
 * const step = await nextNoskillsStep({ specName: "spec-abc123" });
 * console.log(step.question);
 *
 * // Submit answer and advance
 * const next = await nextNoskillsStep({ specName: "spec-abc123", answer: "yes" });
 * ```
 */
export const nextNoskillsStep = async (
  options: NoskillsNextOptions,
): Promise<NoskillsNextResult> => {
  await ensureLib();
  const lib = getLib();

  if (lib === null) {
    throw new Error("native library not available for nextNoskillsStep");
  }

  const raw = lib.symbols.EserAjanNoskillsNext(JSON.stringify(options));
  const result = JSON.parse(raw) as NoskillsNextResult & { error?: string };

  if (result.error) {
    throw new Error(result.error);
  }

  return result;
};
