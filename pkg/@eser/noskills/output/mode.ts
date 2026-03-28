// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Agent mode detection — noskills behaves differently inside an agent vs terminal.
 *
 * Two independent axes:
 * - **audience**: "agent" (Claude Code, Cursor, Kiro) vs "human" (terminal user)
 * - **interaction**: "interactive" (TTY, can prompt) vs "non-interactive" (piped, CI)
 *
 * Detection delegates to `@eser/shell/env` for the canonical two-axis detection,
 * with noskills-specific overrides (--agent flag, manifest agentMode).
 *
 * @module
 */

import type * as schema from "../state/schema.ts";
import * as env from "@eser/shell/env";

export type Mode = "agent" | "human";

/** Detect audience from args, config, and environment. */
export const detectMode = (
  args?: readonly string[],
  config?: schema.NosManifest | null,
): Mode => {
  // 1. Explicit --agent/--human flag
  if (args !== undefined) {
    for (const arg of args) {
      if (arg === "--agent") return "agent";
      if (arg === "--human") return "human";
    }
  }

  // 2. Persisted in manifest
  const manifestMode = (config as Record<string, unknown> | null)
    ?.["agentMode"];
  if (manifestMode === true) return "agent";
  if (manifestMode === false) return "human";

  // 3. Environment detection via @eser/shell/env
  return env.detectAudience();
};

/** Detect interaction mode from args and environment. */
export const detectInteraction = (
  args?: readonly string[],
): env.Interaction => {
  if (args !== undefined) {
    for (const arg of args) {
      if (arg === "--non-interactive") return "non-interactive";
    }
  }

  return env.detectInteraction();
};

/** Strip mode-related flags from args. */
export const stripModeFlag = (
  args?: readonly string[],
): readonly string[] => {
  if (args === undefined) return [];

  return args.filter(
    (a) => a !== "--agent" && a !== "--human" && a !== "--non-interactive",
  );
};
