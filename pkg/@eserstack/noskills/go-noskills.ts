// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Go-backed noskills orchestrator client.
 *
 * Calls the noskills names of the native Go library (noskillsInit,
 * noskillsSpecNew, noskillsNext)
 * (pkg/@eserstack/ajan/bridge_noskills.go) on a project directory:
 *   1. `initNoskills({ root })` sets the project up once.
 *   2. `newNoskillsSpec({ root, description })` creates a spec.
 *   3. `nextNoskillsStep({ root, specName, answer? })` reads or advances it.
 *
 * The WASM fallback does not serve these names (they answer
 * UNSUPPORTED_IN_WASM); they need the native library.
 *
 * @module
 */

import * as ffiClient from "./ffi-client.ts";

/** Options for {@link initNoskills}. */
export type NoskillsInitOptions = {
  /** The project directory. */
  readonly root: string;
};

/** What {@link initNoskills} answers. */
export type NoskillsInitResult = {
  /** The project directory it set up. */
  readonly root: string;
};

/** Options for {@link newNoskillsSpec}. */
export type NoskillsSpecNewOptions = {
  /** The project directory. */
  readonly root: string;
  /** What the spec is about. */
  readonly description?: string;
  /** The spec's name; generated from the description when absent. */
  readonly specName?: string;
  /** A plan file to start the spec from. */
  readonly planPath?: string;
};

/** What {@link newNoskillsSpec} answers. */
export type NoskillsSpecNewResult = {
  /** The spec's name. */
  readonly specName: string;
  /** The absolute path of the spec document. */
  readonly specFile: string;
};

/** Options for {@link nextNoskillsStep}. */
export type NoskillsNextOptions = {
  /** The project directory. */
  readonly root: string;
  /** The spec; required while a spec is active. */
  readonly specName?: string;
  /** The answer to the current question. */
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
 * Sets up noskills in a project directory via the native Go library.
 *
 * @param options - The project directory
 * @returns The directory it set up
 * @throws Error if the native library is unavailable.
 *
 * @example
 * ```typescript
 * import { initNoskills } from "@eserstack/noskills/go-noskills";
 *
 * await initNoskills({ root: "/path/to/project" });
 * ```
 */
export const initNoskills = async (
  options: NoskillsInitOptions,
): Promise<NoskillsInitResult> => {
  await ffiClient.ensureLib();
  const lib = ffiClient.getLib();

  if (lib === null) {
    throw new Error("native library not available for initNoskills");
  }

  const result = lib.call("noskillsInit", {
    ...options,
  }) as NoskillsInitResult & {
    error?: string;
  };

  if (result.error !== undefined && result.error !== "") {
    throw new Error(result.error);
  }

  return { root: result.root };
};

/**
 * Create a new noskills spec via the native Go library.
 *
 * @param options - The project directory and the spec's description or name
 * @returns The spec's name and the path of its document
 * @throws Error if the native library is unavailable.
 *
 * @example
 * ```typescript
 * import { newNoskillsSpec } from "@eserstack/noskills/go-noskills";
 *
 * const { specName } = await newNoskillsSpec({
 *   root: "/path/to/project",
 *   description: "add auth to the API",
 * });
 * console.log(specName); // e.g. "add-auth-to-the-api"
 * ```
 */
export const newNoskillsSpec = async (
  options: NoskillsSpecNewOptions,
): Promise<NoskillsSpecNewResult> => {
  await ffiClient.ensureLib();
  const lib = ffiClient.getLib();

  if (lib === null) {
    throw new Error("native library not available for newNoskillsSpec");
  }

  const result = lib.call("noskillsSpecNew", {
    ...options,
  }) as NoskillsSpecNewResult & {
    error?: string;
  };

  if (result.error !== undefined && result.error !== "") {
    throw new Error(result.error);
  }

  return { specName: result.specName, specFile: result.specFile };
};

/**
 * Advance or query the current step for a noskills spec.
 *
 * @param options - The project directory, the spec (required while a spec is
 *   active) and an optional answer to the current question
 * @returns Current step details including roadmap, gate, question, and modeDirective
 * @throws Error if the native library is unavailable.
 *
 * @example
 * ```typescript
 * import { nextNoskillsStep } from "@eserstack/noskills/go-noskills";
 *
 * // Query current step
 * const root = "/path/to/project";
 * const step = await nextNoskillsStep({ root, specName: "add-auth-to-the-api" });
 * console.log(step.question);
 *
 * // Submit answer and advance
 * const next = await nextNoskillsStep({
 *   root,
 *   specName: "add-auth-to-the-api",
 *   answer: "yes",
 * });
 * ```
 */
export const nextNoskillsStep = async (
  options: NoskillsNextOptions,
): Promise<NoskillsNextResult> => {
  await ffiClient.ensureLib();
  const lib = ffiClient.getLib();

  if (lib === null) {
    throw new Error("native library not available for nextNoskillsStep");
  }

  const result = lib.call("noskillsNext", {
    ...options,
  }) as NoskillsNextResult & {
    error?: string;
  };

  if (result.error !== undefined && result.error !== "") {
    throw new Error(result.error);
  }

  return result;
};
