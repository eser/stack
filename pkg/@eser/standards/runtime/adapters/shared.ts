// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared utilities for runtime adapters.
 * Reduces code duplication across Deno, Node, and Bun adapters.
 *
 * @module
 */

import type { SpawnOptions } from "../types.ts";

/**
 * Standard stdio mode type used by our SpawnOptions.
 */
export type StdioMode = "inherit" | "piped" | "null" | undefined;

/**
 * Node.js/Bun compatible stdio mode.
 */
export type NodeStdioMode = "inherit" | "pipe" | "ignore";

/**
 * Deno compatible stdio mode.
 */
export type DenoStdioMode = "inherit" | "piped" | "null";

/**
 * Maps our stdio mode to Node.js/Bun compatible mode.
 */
export const mapStdioToNode = (mode: StdioMode): NodeStdioMode => {
  if (mode === "inherit") return "inherit";
  if (mode === "piped") return "pipe";
  return "ignore";
};

/**
 * Maps our stdio mode to Deno compatible mode.
 */
export const mapStdioToDeno = (mode: StdioMode): DenoStdioMode => {
  if (mode === "inherit") return "inherit";
  if (mode === "piped") return "piped";
  return "null";
};

/**
 * Resolved stdio mode (never undefined after defaults applied).
 */
export type ResolvedStdioMode = "inherit" | "piped" | "null";

/**
 * Normalized stdio modes with defaults applied.
 */
export interface StdioModes {
  readonly stdin: ResolvedStdioMode;
  readonly stdout: ResolvedStdioMode;
  readonly stderr: ResolvedStdioMode;
}

/**
 * Gets normalized stdio options with defaults applied.
 */
export const getStdioModes = (options?: SpawnOptions): StdioModes => ({
  stdin: options?.stdin ?? "null",
  stdout: options?.stdout ?? "piped",
  stderr: options?.stderr ?? "piped",
});

/**
 * Gets Node.js/Bun compatible stdio array.
 */
export const getNodeStdioArray = (
  options?: SpawnOptions,
): [NodeStdioMode, NodeStdioMode, NodeStdioMode] => {
  const modes = getStdioModes(options);
  return [
    mapStdioToNode(modes.stdin),
    mapStdioToNode(modes.stdout),
    mapStdioToNode(modes.stderr),
  ];
};

/**
 * Gets Deno compatible stdio options.
 */
export const getDenoStdioOptions = (options?: SpawnOptions) => {
  const modes = getStdioModes(options);
  return {
    stdin: mapStdioToDeno(modes.stdin),
    stdout: mapStdioToDeno(modes.stdout),
    stderr: mapStdioToDeno(modes.stderr),
  };
};
