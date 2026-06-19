// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills manager` — multi-spec TUI, now a thin client of @eserstack/mux.
 *
 * mux owns the tabs, panes, PTYs, rendering, and input loop. noskills keeps its
 * product glue: the spec-list + monitor sidebars (drawn as mux "decorations"),
 * session binding (NOSKILLS_SESSION), spec navigation, and the dashboard watch.
 * Each tab runs a coding agent resolved via @eserstack/agents (Claude Code).
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import type * as shellArgs from "@eserstack/shell/args";
import * as tui from "@eserstack/shell/tui";
import * as mux from "@eserstack/mux";
import { defaultAgentAdapter, getAgentAdapter } from "@eserstack/agents";
import * as persistence from "../state/persistence.ts";
import * as dashboard from "../dashboard/mod.ts";
import * as specList from "../manager/spec-list.ts";
import * as monitor from "../manager/monitor.ts";
import * as sessionBinding from "../manager/session-binding.ts";
import type * as managerTypes from "../manager/types.ts";
import { cmdPrefix } from "../output/cmd.ts";

const SIDEBAR_COLS = 30;
const MONITOR_ROWS = 8;

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const isDryRun = args?.includes("--dry-run") ?? false;
  const { root } = await persistence.resolveProjectRoot();

  if (!(await persistence.isInitialized(root))) {
    console.error("noskills is not initialized. Run:", cmdPrefix(), "init");
    return results.fail({ exitCode: 1 });
  }

  const adapter = getAgentAdapter("claude-code") ?? defaultAgentAdapter();

  // ── noskills-owned UI state ──
  let specs: specList.SpecInfo[] = (await dashboard.getState(root)).specs.map(
    (s) => ({ name: s.name, phase: s.phase, hasActiveSession: false }),
  );
  let selectedSpec = 0;
  let specFocus = false;
  /** mux tab id → noskills tab metadata (for the sidebar/monitor). */
  const tabInfo = new Map<string, managerTypes.ManagerTab>();

  if (isDryRun) {
    console.log(`noskills manager | ${specs.length} spec(s) | ${cmdPrefix()}`);
    return results.ok(undefined);
  }

  // ── mux server ──
  let sidebarVisible = true;
  const buildChrome = (): mux.engine.geometry.Chrome => ({
    tabBarRows: 1,
    statusBarRows: 1,
    leftCols: sidebarVisible ? SIDEBAR_COLS : 0,
    topRows: MONITOR_ROWS,
  });

  const resolveSpawn = sessionBinding.buildAgentSpawnResolver(root);

  const { cols, rows } = tui.terminal.getTerminalSize();

  const server = mux.createServer({
    initialState: mux.engine.createInitialState({ cols, rows }),
    resolveSpawn,
    chrome: buildChrome(),
  });

  // ── tab creation ──
  const openTab = async (
    binding: sessionBinding.SessionBinding,
  ): Promise<void> => {
    const command = (await adapter.resolveCommand()) ?? "claude";
    server.dispatch({
      type: "newTab",
      command,
      cwd: root,
      title: binding.spec ?? "free",
      meta: { sessionId: binding.sessionId },
    });

    // The newest tab is now active; record its metadata by id.
    const state = server.getState();
    const tab = state.tabs[state.activeTab];
    if (tab !== undefined) {
      tabInfo.set(tab.id, {
        id: tab.id,
        spec: binding.spec,
        mode: binding.mode,
        sessionId: binding.sessionId,
        phase: binding.phase,
      });
    }
  };

  const openFreeTab = async (): Promise<void> => {
    await openTab(await sessionBinding.createFreeSession(root, adapter.id));
  };

  const openSpecTab = async (specName: string): Promise<void> => {
    // Switch to an existing tab for this spec instead of opening a duplicate.
    for (const info of tabInfo.values()) {
      if (info.spec === specName) {
        const idx = server.getState().tabs.findIndex((t) => t.id === info.id);
        if (idx >= 0) {
          server.dispatch({ type: "gotoTab", index: idx });
          return;
        }
      }
    }

    await openTab(
      await sessionBinding.createSpecSession(root, specName, adapter.id),
    );
  };

  // ── decorations: spec-list sidebar + monitor strip ──
  // Forward-declared: the decorate/onKey/onMouse closures below reference
  // frontend.refresh() but are created before createTuiFrontend assigns it.
  // deno-lint-ignore prefer-const
  let frontend: mux.Frontend;

  const decorate = (
    ctx: {
      regions: mux.engine.geometry.DecorationRegions;
      scene: mux.scene.Scene;
    },
  ): string => {
    // Reconcile metadata against the live scene: clean up closed tabs.
    const liveIds = new Set(ctx.scene.tabs.map((t) => t.id));
    for (const id of [...tabInfo.keys()]) {
      if (!liveIds.has(id)) {
        const info = tabInfo.get(id)!;
        tabInfo.delete(id);
        persistence.deleteSession(root, info.sessionId).catch(() => {});
      }
    }

    const tabs = [...tabInfo.values()];
    let out = "";

    if (ctx.regions.left !== undefined) {
      out += specList.render(
        specs,
        tabs,
        selectedSpec,
        { id: "specs", ...ctx.regions.left },
      );
    }

    if (ctx.regions.top !== undefined) {
      const activeId = ctx.scene.tabs[ctx.scene.activeTab]?.id;
      const activeInfo = activeId !== undefined
        ? tabInfo.get(activeId) ?? null
        : null;
      out += monitor.render(activeInfo, { id: "monitor", ...ctx.regions.top });
    }

    return out;
  };

  // ── input: spec navigation + tab management (intercepts before mux) ──
  const onKey = (key: tui.KeypressEvent): boolean => {
    if (specFocus) {
      switch (key.name) {
        case "up":
          selectedSpec = Math.max(0, selectedSpec - 1);
          frontend.refresh();
          return true;
        case "down":
          selectedSpec = Math.min(
            Math.max(0, specs.length - 1),
            selectedSpec + 1,
          );
          frontend.refresh();
          return true;
        case "return": {
          const spec = specs[selectedSpec];
          specFocus = false;
          if (spec !== undefined) void openSpecTab(spec.name).catch(() => {});
          frontend.refresh();
          return true;
        }
        case "x": // close the active tab from the sidebar
          specFocus = false;
          server.dispatch({ type: "closeFocusedPane" });
          frontend.refresh();
          return true;
        case "escape":
        case "tab":
          specFocus = false;
          frontend.refresh();
          return true;
        default:
          return true; // consume everything while the sidebar is focused
      }
    }

    if (key.ctrl && key.name === "e") {
      specFocus = true;
      frontend.refresh();
      return true;
    }
    if (key.ctrl && key.name === "t") {
      void openFreeTab().catch(() => {});
      return true;
    }
    if (key.ctrl && key.name === "w") {
      sidebarVisible = !sidebarVisible;
      server.setChrome(buildChrome());
      return true;
    }
    // ctrl+1..9 → switch tab
    if (key.ctrl && /^[1-9]$/.test(key.name)) {
      server.dispatch({ type: "gotoTab", index: Number(key.name) - 1 });
      return true;
    }

    return false; // pass through to mux (the focused agent)
  };

  // Click a spec in the sidebar to open it; pane clicks fall through to mux focus.
  const onMouse = (
    ev: tui.mouse.MouseEvent,
    scene: mux.scene.Scene | null,
  ): boolean => {
    if (scene === null) return false;
    const left = scene.chrome.leftCols ?? 0;
    if (left > 0 && ev.x <= left && ev.type === "mousedown") {
      // Sidebar box: border at row 2 (1-based), items start at row 3.
      const idx = ev.y - 3;
      if (idx >= 0 && idx < specs.length) {
        selectedSpec = idx;
        void openSpecTab(specs[idx]!.name).catch(() => {});
        frontend.refresh();
      }
      return true;
    }

    return false;
  };

  // ── wire server ↔ frontend over an in-process transport ──
  const [serverSide, frontendSide] = mux.createInProcessPair<
    mux.ServerToFrontend,
    mux.FrontendToServer
  >();
  server.connect(serverSide);

  frontend = mux.createTuiFrontend({
    transport: frontendSide,
    keymap: mux.keybindings.buildKeymap({
      normal: { "ctrl+q": { type: "quit" } },
    }),
    decorate,
    onKey,
    onMouse,
    statusText:
      " noskills | ctrl+e specs · ctrl+t new tab · ctrl+1-9 switch · ctrl+w hide · ctrl+q quit",
  });

  // Refresh the spec list when the dashboard changes.
  const unsubEvents = dashboard.watchEvents(root, async () => {
    try {
      const updated = await dashboard.getState(root);
      specs = updated.specs.map((s) => ({
        name: s.name,
        phase: s.phase,
        hasActiveSession: false,
      }));
      if (selectedSpec >= specs.length) {
        selectedSpec = Math.max(0, specs.length - 1);
      }
      frontend.refresh();
    } catch {
      // best effort
    }
  });

  await openFreeTab();

  try {
    await frontend.run();
  } finally {
    unsubEvents();
    frontend.stop();
    // decorate() only deletes sessions for tabs that leave the scene; on quit
    // the still-open tabs are torn down without that, so sweep them here.
    for (const info of tabInfo.values()) {
      await persistence.deleteSession(root, info.sessionId).catch(() => {});
    }
    await server.dispose();
    await persistence.gcStaleSessions(root);
  }

  return results.ok(undefined);
};
