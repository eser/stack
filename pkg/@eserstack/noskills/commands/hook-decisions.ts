// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Hook decision logic — pure functions for PreToolUse guards.
 *
 * Extracted from invoke-hook.ts so the decision logic can be
 * unit-tested without stdin/stdout plumbing.
 *
 * The git-guard predicates now live in `@eserstack/agents/guards` (the canonical
 * home, shared with the agent driving loop's safety policy); they are re-exported
 * here so existing importers keep working and the two never drift.
 *
 * @module
 */

// =============================================================================
// noskills command detection (control plane whitelist)
// =============================================================================

/** Check if a Bash command is a noskills/nos CLI command (control plane). */
export const isNoskillsCommand = (command: string): boolean => {
  const trimmed = command.trim();

  return trimmed.includes("noskills") ||
    trimmed.includes(" nos ") ||
    trimmed.endsWith(" nos") ||
    trimmed.startsWith("nos ");
};

// =============================================================================
// Git Allowlist — read-only commands only (canonical: @eserstack/agents/guards)
// =============================================================================

export {
  containsGitWriteBypass,
  extractGitInvocations,
  hasGitWrite,
  isGitAllowed,
  isGitReadOnly,
  stripFlagValues,
} from "@eserstack/agents/guards";
