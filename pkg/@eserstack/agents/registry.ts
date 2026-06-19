// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Agent-adapter registry. Mirrors the sync/adapter registry pattern: a flat list
 * plus id lookup, with claude-code as the default.
 *
 * @module
 */

import type { AgentAdapter } from "./adapter.ts";
import { claudeCodeAdapter } from "./adapters/claude-code.ts";
import { opencodeAdapter } from "./adapters/opencode.ts";
import { codexAdapter } from "./adapters/codex.ts";

const ADAPTERS: readonly AgentAdapter[] = [
  claudeCodeAdapter,
  opencodeAdapter,
  codexAdapter,
];

/** All registered adapters. */
export const listAgentAdapters = (): readonly AgentAdapter[] => ADAPTERS;

/** Look up an adapter by id (e.g. "claude-code"), or undefined. */
export const getAgentAdapter = (id: string): AgentAdapter | undefined =>
  ADAPTERS.find((a) => a.id === id);

/** The default adapter (Claude Code). */
export const defaultAgentAdapter = (): AgentAdapter => claudeCodeAdapter;
