// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * PTY manager — spawn and manage Claude Code PTY processes per tab.
 *
 * @module
 */

import * as exec from "@eserstack/shell/exec";
import * as persistence from "@eserstack/noskills/persistence";
import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Types
// =============================================================================

export type TabInstance = {
  readonly id: string;
  specName: string | null;
  sessionId: string;
  pty: exec.PtyProcess | null;
  readonly createdAt: string;
};

// =============================================================================
// Manager
// =============================================================================

export class PtyManager {
  readonly #root: string;
  readonly #tabs = new Map<string, TabInstance>();
  #counter = 0;

  constructor(root: string) {
    this.#root = root;
  }

  /** Resolve command to spawn (claude or claude-code). */
  async #resolveCommand(): Promise<string> {
    for (const candidate of ["claude", "claude-code"]) {
      try {
        const code = await exec.exec`which ${candidate}`.noThrow().code();
        if (code === 0) return candidate;
      } catch {
        // not found
      }
    }
    return "claude";
  }

  /** Create a new tab, optionally bound to a spec. */
  async createTab(specName?: string): Promise<TabInstance> {
    const id = `tab-${++this.#counter}-${Date.now().toString(36)}`;
    const sessionId = persistence.generateSessionId();

    const env: Record<string, string> = {
      ...runtime.env.toObject(),
      NOSKILLS_SESSION: sessionId,
      NOSKILLS_PROJECT_ROOT: this.#root,
    };

    // Create session
    await persistence.createSession(this.#root, {
      id: sessionId,
      spec: specName ?? null,
      mode: specName !== undefined ? "spec" : "free",
      phase: null,
      pid: 0,
      startedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      tool: "web",
      projectRoot: this.#root,
    });

    const cmd = await this.#resolveCommand();
    let pty: exec.PtyProcess | null = null;

    try {
      pty = await exec.spawnPty({
        command: cmd,
        cwd: this.#root,
        env,
        cols: 120,
        rows: 40,
      });
    } catch {
      // PTY spawn may fail if claude not installed
    }

    const tab: TabInstance = {
      id,
      specName: specName ?? null,
      sessionId,
      pty,
      createdAt: new Date().toISOString(),
    };

    this.#tabs.set(id, tab);
    return tab;
  }

  /** Close a tab and kill its PTY. */
  async closeTab(tabId: string): Promise<void> {
    const tab = this.#tabs.get(tabId);
    if (tab === undefined) return;

    if (tab.pty !== null) {
      tab.pty.kill();
    }

    await persistence.deleteSession(this.#root, tab.sessionId);
    this.#tabs.delete(tabId);
  }

  /** Get a tab by ID. */
  getTab(tabId: string): TabInstance | undefined {
    return this.#tabs.get(tabId);
  }

  /** Find the tab assigned to a spec. */
  findTabBySpec(specName: string): TabInstance | undefined {
    for (const tab of this.#tabs.values()) {
      if (tab.specName === specName) return tab;
    }
    return undefined;
  }

  /** List all tabs. */
  listTabs(): readonly TabInstance[] {
    return [...this.#tabs.values()];
  }

  /** Kill all PTYs (cleanup). */
  async killAll(): Promise<void> {
    for (const tab of this.#tabs.values()) {
      if (tab.pty !== null) {
        tab.pty.kill();
      }
      await persistence.deleteSession(this.#root, tab.sessionId);
    }
    this.#tabs.clear();
  }
}
