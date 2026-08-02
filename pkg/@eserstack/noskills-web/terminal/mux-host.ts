// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Mux host for the web frontend.
 *
 * Replaces the old single-PTY-per-tab `PtyManager` with a single
 * {@link mux.MuxServer} that owns every tab, pane, and PTY. The browser attaches
 * one WebSocket carrying the neutral mux protocol (scene + per-pane output in,
 * actions out) and renders the whole scene — so the web view is just another mux
 * frontend, identical in feed to the ANSI TUI.
 *
 * noskills-specific glue stays here: session persistence, spec↔tab binding, and
 * notifying the pane bound to a spec via the `writeToPane` action. Session
 * creation and the agent spawn resolver are shared with the TUI manager via
 * `@eserstack/noskills/session`.
 *
 * @module
 */

import * as mux from "@eserstack/mux";
import { defaultAgentAdapter, getAgentAdapter } from "@eserstack/agents";
import * as persistence from "@eserstack/noskills/persistence";
import * as sessionBinding from "@eserstack/noskills/session";

/** Per-tab noskills metadata, keyed by the mux tab id. */
export type WebTab = {
  readonly id: string;
  readonly specName: string | null;
  readonly sessionId: string;
};

/** Options for {@link MuxHost}; the seams let tests avoid real PTYs and the
 *  native `where`/`which` agent discovery (both go through the ajan FFI). */
export type MuxHostOptions = {
  readonly createHost?: (cb: mux.PtyHostCallbacks) => mux.PtyHost;
  /** Override agent-binary discovery (defaults to the claude-code adapter). */
  readonly resolveCommand?: () => Promise<string>;
};

export class MuxHost {
  readonly #root: string;
  readonly server: mux.MuxServer;
  readonly #adapter = getAgentAdapter("claude-code") ?? defaultAgentAdapter();
  /** mux tab id → noskills tab metadata. */
  readonly #tabs = new Map<string, WebTab>();
  readonly #resolveCommandOverride: (() => Promise<string>) | undefined;
  #command: string | null = null;

  constructor(root: string, opts: MuxHostOptions = {}) {
    this.#root = root;
    this.#resolveCommandOverride = opts.resolveCommand;

    this.server = mux.createServer({
      // The browser draws its own tab bar and chrome in HTML, so the mux
      // viewport reserves nothing — panes fill the grid the browser reports.
      initialState: mux.engine.createInitialState({ cols: 120, rows: 40 }),
      resolveSpawn: sessionBinding.buildAgentSpawnResolver(root),
      chrome: { tabBarRows: 0, statusBarRows: 0 },
      createHost: opts.createHost,
      // The web mux server outlives any single tab; closing the last one leaves
      // an empty multiplexer the browser can repopulate with "+".
      exitOnEmpty: false,
      // A pane exiting on its own (agent quit) closes its tab; reconcile so the
      // persisted session is deleted promptly, not just on the next read.
      onPaneExit: () => this.#reconcile(),
    });
  }

  /** Drop bindings whose mux tab has gone away (pane exited / tab closed). */
  #reconcile(): void {
    const live = new Set(this.server.getState().tabs.map((t) => t.id));
    for (const id of [...this.#tabs.keys()]) {
      if (!live.has(id)) {
        const tab = this.#tabs.get(id)!;
        this.#tabs.delete(id);
        persistence.deleteSession(this.#root, tab.sessionId).catch(() => {});
      }
    }
  }

  async #resolveCommand(): Promise<string> {
    if (this.#command === null) {
      this.#command = this.#resolveCommandOverride !== undefined
        ? await this.#resolveCommandOverride()
        : (await this.#adapter.resolveCommand()) ?? "claude";
    }
    return this.#command;
  }

  /** Create a tab running a coding agent, optionally bound to a spec. */
  async createTab(specName?: string): Promise<WebTab> {
    // Reuse the canonical session factories (spec-bound loads the live phase).
    const binding = specName !== undefined
      ? await sessionBinding.createSpecSession(this.#root, specName, "web")
      : await sessionBinding.createFreeSession(this.#root, "web");

    const command = await this.#resolveCommand();
    this.server.dispatch({
      type: "newTab",
      command,
      cwd: this.#root,
      title: binding.spec ?? "free",
      meta: { sessionId: binding.sessionId },
    });

    // The newest tab is now active.
    const state = this.server.getState();
    const muxTab = state.tabs[state.activeTab]!;
    const tab: WebTab = {
      id: muxTab.id,
      specName: binding.spec,
      sessionId: binding.sessionId,
    };
    this.#tabs.set(tab.id, tab);
    return tab;
  }

  /** Close a specific tab by mux id without moving the user's active tab. */
  closeTab(tabId: string): void {
    const idx = this.server.getState().tabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return;
    this.server.dispatch({ type: "closeTab", index: idx });
    this.#reconcile();
  }

  /** The tab bound to a spec, if any. */
  findTabBySpec(specName: string): WebTab | undefined {
    this.#reconcile();
    for (const tab of this.#tabs.values()) {
      if (tab.specName === specName) return tab;
    }
    return undefined;
  }

  /** Write a notification into the pane currently focused in a spec's tab. */
  notifySpec(specName: string, text: string): boolean {
    const tab = this.findTabBySpec(specName);
    if (tab === undefined) return false;
    // Resolve the live pane from the tab — the original pane may have been
    // replaced by a split/promotion, so a cached pane id could be stale.
    const muxTab = this.server.getState().tabs.find((t) => t.id === tab.id);
    if (muxTab === undefined) return false;
    this.server.dispatch({
      type: "writeToPane",
      pane: muxTab.focusedPane,
      data: text,
    });
    return true;
  }

  /** All open tabs (for the server-rendered dashboard shell). */
  listTabs(): readonly WebTab[] {
    this.#reconcile();
    return [...this.#tabs.values()];
  }

  /** Tear down every pane/PTY and persisted session. */
  async killAll(): Promise<void> {
    const sessions = [...this.#tabs.values()].map((t) => t.sessionId);
    this.#tabs.clear();
    await this.server.dispose();
    for (const id of sessions) {
      await persistence.deleteSession(this.#root, id).catch(() => {});
    }
  }
}
