// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills manager` — Multi-spec TUI with tab management.
 *
 * Each tab runs its own Claude Code instance with automatic session binding.
 * Uses @eser/shell/tui for rendering and @eser/shell/exec for process management.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import type * as shellArgs from "@eser/shell/args";
import * as tui from "@eser/shell/tui";
import * as exec from "@eser/shell/exec";
import * as persistence from "../state/persistence.ts";
import * as dashboard from "../dashboard/mod.ts";
import * as managerTypes from "../manager/types.ts";
import * as specList from "../manager/spec-list.ts";
import * as monitor from "../manager/monitor.ts";
import * as terminalPanel from "../manager/terminal-panel.ts";
import * as tabManager from "../manager/tab-manager.ts";
import * as keyboardRouter from "../manager/keyboard-router.ts";
import { cmdPrefix } from "../output/cmd.ts";
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const isDryRun = args?.includes("--dry-run") ?? false;
  const { root } = await persistence.resolveProjectRoot();

  if (!(await persistence.isInitialized(root))) {
    console.error("noskills is not initialized. Run:", cmdPrefix(), "init");
    return results.fail({ exitCode: 1 });
  }

  // Load specs via dashboard core
  const dashboardState = await dashboard.getState(root);
  const specs: specList.SpecInfo[] = dashboardState.specs.map((s) => ({
    name: s.name,
    phase: s.phase,
    hasActiveSession: false,
  }));

  const state = managerTypes.createInitialState();
  const { cols, rows } = tui.terminal.getTerminalSize();

  /** Build layout — supports independent panel toggles. */
  const buildLayout = (
    showSpecs: boolean,
    showMonitor: boolean,
  ): tui.layout.LayoutResult => {
    const tabBarRows = 1;
    const usableRows = rows - 1; // status bar

    if (!showSpecs && !showMonitor) {
      // Full-width terminal
      return {
        left: { id: "left", x: 0, y: 0, width: 0, height: 0 },
        rightTop: { id: "rightTop", x: 0, y: 0, width: 0, height: 0 },
        rightBottom: {
          id: "rightBottom",
          x: 1,
          y: tabBarRows + 1,
          width: cols,
          height: usableRows - tabBarRows,
        },
        statusBar: { id: "statusBar", x: 1, y: rows, width: cols, height: 1 },
      };
    }

    const config: tui.layout.LayoutConfig = {
      leftWidth: showSpecs ? 0.25 : 0,
      rightTopHeight: showMonitor ? 0.35 : 0,
    };
    const raw = tui.layout.calculateLayout(cols, rows, config);

    // Reserve 1 row for the tab bar above Terminal (always)
    const termY = raw.rightBottom.y + tabBarRows;
    const termH = raw.rightBottom.height - tabBarRows;
    const monitorH = showMonitor ? raw.rightTop.height - tabBarRows : 0;

    return {
      left: showSpecs
        ? raw.left
        : { id: "left", x: 0, y: 0, width: 0, height: 0 },
      rightTop: showMonitor
        ? { ...raw.rightTop, height: monitorH }
        : { id: "rightTop", x: 0, y: 0, width: 0, height: 0 },
      rightBottom: {
        ...raw.rightBottom,
        y: termY,
        height: termH,
      },
      statusBar: raw.statusBar,
    };
  };

  let panels = buildLayout(state.specsVisible, state.monitorVisible);

  /** Get terminal content dimensions (inside borders). */
  const getTerminalSize = (): { cols: number; rows: number } => ({
    cols: panels.rightBottom.width - 2,
    rows: panels.rightBottom.height - 2,
  });

  // Render helpers
  const encoder = new TextEncoder();
  const write = (s: string): void => {
    runtime.process.writeToStdout(encoder.encode(s));
  };

  if (isDryRun) {
    // Dry run: render one frame to stdout and exit
    write(tui.terminal.clearScreenSeq());

    // Status bar
    const statusText =
      ` noskills manager | ${specs.length} spec(s) | ${cmdPrefix()} | Ctrl+C to quit`;
    write(tui.ansi.moveTo(panels.statusBar.y, panels.statusBar.x));
    write(
      tui.ansi.inverse(
        tui.ansi.truncate(statusText, panels.statusBar.width),
      ),
    );

    // Spec list
    write(
      specList.render(specs, state.tabs, state.selectedTabIndex, panels.left),
    );

    // Monitor
    const activeTab = tabManager.getActiveTab(state);
    write(monitor.render(activeTab, panels.rightTop));

    // Terminal (with tab bar inside)
    write(
      terminalPanel.render(
        activeTab,
        panels.rightBottom,
        state.tabs,
        state.selectedTabIndex,
      ),
    );

    // Move cursor to bottom
    write(tui.ansi.moveTo(rows, 1));
    write("\n");

    return results.ok(undefined);
  }

  // Process group for graceful shutdown
  const processGroup = new exec.ProcessGroup();

  // Render callback — set later, called by PTY onData to refresh terminal panel
  let scheduleRender: (() => void) | null = null;

  // Resolve the command to spawn (fallback chain)
  const resolveCommand = async (): Promise<string> => {
    for (const candidate of ["claude", "claude-code"]) {
      try {
        const code = await exec.exec`which ${candidate}`.noThrow().code();
        if (code === 0) return candidate;
      } catch {
        // which not available or candidate not found
      }
    }
    return "claude"; // fallback — will fail with informative error
  };

  // Build list items (refreshed on spec changes)
  let listItems = specList.buildListItems(specs, state.tabs);

  // Set initial selection to first selectable item
  state.selectedTabIndex = tui.list.nextSelectableIndex(listItems, -1, "down");

  // ── Helper: create a free-mode tab with PTY ──
  const createFreeTab = async (): Promise<void> => {
    const sessionId = persistence.generateSessionId();
    await persistence.createSession(root, {
      id: sessionId,
      spec: null,
      mode: "free",
      phase: null,
      pid: 0,
      startedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      tool: "claude-code",
    });

    const termSize = getTerminalSize();
    const widget = new tui.VTermWidget(termSize.rows, termSize.cols);

    const tab: managerTypes.ManagerTab = {
      id: `tab-${sessionId}`,
      spec: null,
      mode: "free",
      sessionId,
      process: null,
      buffer: [],
      widget,
      active: true,
      phase: null,
    };

    // Spawn PTY process with command fallback
    try {
      const cmd = await resolveCommand();
      const pty = await exec.spawnPty({
        command: cmd,
        cwd: root,
        env: {
          ...runtime.env.toObject(),
          NOSKILLS_SESSION: sessionId,
          NOSKILLS_PROJECT_ROOT: root,
        },
        cols: termSize.cols,
        rows: termSize.rows,
      });

      tab.process = pty;
      processGroup.add(tab.id, pty);

      // Wire PTY output to VTermWidget + trigger re-render
      pty.onData((data) => {
        widget.write(data);
        tabManager.appendToBuffer(tab, data); // keep raw buffer too
        scheduleRender?.();
      });

      // Auto-close tab when PTY exits
      pty.exitCode.then(() => {
        Object.assign(state, tabManager.closeTab(state, tab.id));
        listItems = specList.buildListItems(specs, state.tabs);
        markAllDirty();
        if (state.running) renderFrame();
      }).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      widget.write(`[noskills manager] Failed to spawn claude: ${msg}\r\n`);
      widget.write("Is Claude Code installed? Set command in manifest.yml\r\n");
    }

    Object.assign(state, tabManager.createTab(state, tab));
    state.focus = "terminal";
    listItems = specList.buildListItems(specs, state.tabs);
  };

  // ── Helper: create a spec-bound tab with PTY ──
  const createSpecTab = async (specName: string): Promise<void> => {
    // Check if tab already exists for this spec
    const existing = state.tabs.find((t) => t.spec === specName);
    if (existing !== undefined) {
      const idx = state.tabs.indexOf(existing);
      Object.assign(state, tabManager.switchTab(state, idx));
      state.focus = "terminal";
      return;
    }

    // Load spec phase
    let phase: string | null = null;
    try {
      const specState = await persistence.resolveState(root, specName);
      phase = specState.phase;
    } catch {
      // spec not found
    }

    const sessionId = persistence.generateSessionId();
    await persistence.createSession(root, {
      id: sessionId,
      spec: specName,
      mode: "spec",
      phase,
      pid: 0,
      startedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      tool: "claude-code",
    });

    const specTermSize = getTerminalSize();
    const specWidget = new tui.VTermWidget(
      specTermSize.rows,
      specTermSize.cols,
    );

    const tab: managerTypes.ManagerTab = {
      id: `tab-${sessionId}`,
      spec: specName,
      mode: "spec",
      sessionId,
      process: null,
      buffer: [],
      widget: specWidget,
      active: true,
      phase,
    };

    try {
      const cmd = await resolveCommand();
      const pty = await exec.spawnPty({
        command: cmd,
        cwd: root,
        env: {
          ...runtime.env.toObject(),
          NOSKILLS_SESSION: sessionId,
          NOSKILLS_PROJECT_ROOT: root,
        },
        cols: specTermSize.cols,
        rows: specTermSize.rows,
      });

      tab.process = pty;
      processGroup.add(tab.id, pty);

      pty.onData((data) => {
        specWidget.write(data);
        tabManager.appendToBuffer(tab, data);
        scheduleRender?.();
      });

      // Auto-close tab when PTY exits
      pty.exitCode.then(() => {
        Object.assign(state, tabManager.closeTab(state, tab.id));
        listItems = specList.buildListItems(specs, state.tabs);
        markAllDirty();
        if (state.running) renderFrame();
      }).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      specWidget.write(
        `[noskills manager] Failed to spawn claude for spec "${specName}": ${msg}\r\n`,
      );
    }

    Object.assign(state, tabManager.createTab(state, tab));
    state.focus = "terminal";
    listItems = specList.buildListItems(specs, state.tabs);
  };

  // Auto-create first tab on startup
  await createFreeTab();

  // Interactive mode — full TUI loop
  write(tui.terminal.enterAlternateScreen());
  write(tui.terminal.hideCursorSeq());
  write(tui.terminal.clearScreenSeq());
  write(tui.mouse.enableMouse());

  // Dirty panel tracking — only re-render what changed
  const dirtyPanels = new Set<string>([
    "specs",
    "monitor",
    "terminal",
    "status",
  ]);

  const renderFrame = (): void => {
    const activeTab = tabManager.getActiveTab(state);
    const buf: string[] = [];

    // Hide cursor during render to prevent flicker
    buf.push(tui.terminal.hideCursorSeq());

    // Full clear when all panels dirty (startup, resize, tab changes)
    if (dirtyPanels.size >= 4) {
      buf.push("\x1b[2J\x1b[H"); // clear screen + cursor home
    }

    // Status bar — always render (cheap, 1 line)
    if (dirtyPanels.has("status") || dirtyPanels.size === 0) {
      const focusLabel = state.focus === "list" ? "LIST" : "TERM";
      const panelHint = `ctrl+e: ${
        state.specsVisible ? "hide" : "show"
      } specs | ctrl+w: ${state.monitorVisible ? "hide" : "show"} monitor`;
      const statusText =
        ` noskills | ${state.tabs.length} tab(s) | [${focusLabel}] tab: switch | ctrl+d: quit | ctrl+t: new tab | ${panelHint}`;
      buf.push(tui.ansi.moveTo(panels.statusBar.y, panels.statusBar.x));
      buf.push(
        tui.ansi.inverse(
          tui.ansi.truncate(statusText, panels.statusBar.width) +
            " ".repeat(
              Math.max(
                0,
                panels.statusBar.width - tui.ansi.visibleLength(statusText),
              ),
            ),
        ),
      );
    }

    if (state.specsVisible && dirtyPanels.has("specs")) {
      buf.push(
        specList.render(
          specs,
          state.tabs,
          state.selectedTabIndex,
          panels.left,
        ),
      );
    }

    if (state.monitorVisible && dirtyPanels.has("monitor")) {
      buf.push(monitor.render(activeTab, panels.rightTop));
    }

    if (dirtyPanels.has("terminal")) {
      buf.push(
        terminalPanel.render(
          activeTab,
          panels.rightBottom,
          state.tabs,
          state.selectedTabIndex,
        ),
      );
    }

    // Show cursor after render
    buf.push(tui.terminal.showCursorSeq());

    dirtyPanels.clear();
    write(buf.join(""));
  };

  /** Mark all panels dirty (for first render and full redraws). */
  const markAllDirty = (): void => {
    dirtyPanels.add("specs");
    dirtyPanels.add("monitor");
    dirtyPanels.add("terminal");
    dirtyPanels.add("status");
  };

  // Debounced render — PTY data can arrive faster than we can draw
  let renderPending = false;
  scheduleRender = (): void => {
    dirtyPanels.add("terminal"); // PTY output only dirties terminal panel
    if (renderPending) return;
    renderPending = true;
    setTimeout(() => {
      renderPending = false;
      if (state.running) renderFrame();
    }, 16); // ~60fps cap
  };

  // Watch for dashboard events — refresh spec list on state changes
  const unsubEvents = dashboard.watchEvents(root, async () => {
    try {
      const updated = await dashboard.getState(root);
      specs.length = 0;
      for (const s of updated.specs) {
        specs.push({ name: s.name, phase: s.phase, hasActiveSession: false });
      }
      listItems = specList.buildListItems(specs, state.tabs);
      dirtyPanels.add("specs");
      dirtyPanels.add("monitor");
      if (state.running) renderFrame();
    } catch {
      // best effort
    }
  });

  markAllDirty();
  renderFrame();

  // ── Mouse handler (delegates to keyboard-router) ──
  const handleMouse = async (
    ev: tui.mouse.MouseEvent,
  ): Promise<void> => {
    const action = keyboardRouter.routeMouseEvent(
      ev,
      panels,
      listItems,
      state.focus,
    );

    switch (action.type) {
      case "clickSpec": {
        state.focus = "list";
        state.selectedTabIndex = action.index;
        const specName = specs.find(
          (s) => s.name === listItems[action.index]?.label,
        )?.name;
        if (specName !== undefined) {
          await createSpecTab(specName);
          markAllDirty();
          return;
        }
        dirtyPanels.add("specs");
        dirtyPanels.add("monitor");
        dirtyPanels.add("status");
        break;
      }

      case "clickTerminal": {
        state.focus = "terminal";
        dirtyPanels.add("status");
        break;
      }

      case "clickMonitor": {
        state.focus = "list";
        dirtyPanels.add("status");
        break;
      }

      case "scrollSpecs": {
        Object.assign(
          state,
          keyboardRouter.navigateList(state, action.direction, listItems),
        );
        dirtyPanels.add("specs");
        dirtyPanels.add("monitor");
        break;
      }

      case "scrollTerminal": {
        const activeTab = tabManager.getActiveTab(state);
        if (activeTab?.process !== null && activeTab !== null) {
          const scrollKey = action.direction === "up" ? "\x1b[A" : "\x1b[B";
          activeTab.process?.write(scrollKey.repeat(3));
        }
        break;
      }

      case "forwardMouse": {
        state.focus = "terminal";
        dirtyPanels.add("status");
        const activeTab = tabManager.getActiveTab(state);
        if (activeTab?.process !== null && activeTab !== null) {
          const relX = ev.x + 1 - panels.rightBottom.x;
          const relY = ev.y + 1 - panels.rightBottom.y;
          let code = ev.button;
          if (ev.type === "mousemove") code |= 32;
          if (ev.type === "wheel") {
            code = (64 | (ev.direction === "down" ? 1 : 0)) as 0 | 1 | 2;
          }
          if (ev.shift) code |= 4;
          if (ev.ctrl) code |= 16;
          const suffix = ev.type === "mouseup" ? "m" : "M";
          activeTab.process?.write(
            `\x1b[<${code};${relX};${relY}${suffix}`,
          );
        }
        break;
      }

      case "none":
        break;
    }
  };

  try {
    await tui.withRawMode(async () => {
      for await (const input of tui.readInput(runtime.process.stdin)) {
        if (!state.running) break;

        // ── Mouse events ──
        if (input.kind === "mouse") {
          await handleMouse(input.event);
          if (dirtyPanels.size > 0) renderFrame();
          continue;
        }

        // ── Keyboard events ──
        const key = input.event;
        const action = keyboardRouter.routeKey(
          state,
          key.name,
          key.ctrl,
        );

        switch (action.type) {
          case "quit":
            state.running = false;
            break;

          case "toggleFocus":
            Object.assign(state, keyboardRouter.toggleFocus(state));
            dirtyPanels.add("status");
            break;

          case "navigate":
            Object.assign(
              state,
              keyboardRouter.navigateList(state, action.direction, listItems),
            );
            dirtyPanels.add("specs");
            dirtyPanels.add("monitor");
            dirtyPanels.add("terminal");
            break;

          case "newTab":
            await createFreeTab();
            markAllDirty();
            break;

          case "toggleSpecs": {
            state.specsVisible = !state.specsVisible;
            if (!state.specsVisible && !state.monitorVisible) {
              state.focus = "terminal";
            }
            panels = buildLayout(state.specsVisible, state.monitorVisible);
            const specSize = getTerminalSize();
            for (const t of state.tabs) {
              if (t.process !== null) {
                t.process.resize(specSize.cols, specSize.rows);
              }
              if (t.widget !== null) {
                t.widget.resize(specSize.rows, specSize.cols);
              }
            }
            markAllDirty();
            break;
          }

          case "toggleMonitor": {
            state.monitorVisible = !state.monitorVisible;
            if (!state.specsVisible && !state.monitorVisible) {
              state.focus = "terminal";
            }
            panels = buildLayout(state.specsVisible, state.monitorVisible);
            const monSize = getTerminalSize();
            for (const t of state.tabs) {
              if (t.process !== null) {
                t.process.resize(monSize.cols, monSize.rows);
              }
              if (t.widget !== null) {
                t.widget.resize(monSize.rows, monSize.cols);
              }
            }
            markAllDirty();
            break;
          }

          case "select": {
            const selectedItem = listItems[state.selectedTabIndex];
            if (selectedItem === undefined) break;

            const label = selectedItem.label;
            {
              const specName = specs.find((s) => s.name === label)?.name;
              if (specName !== undefined) {
                await createSpecTab(specName);
              }
            }
            markAllDirty();
            break;
          }

          case "closeTab": {
            const activeTab = tabManager.getActiveTab(state);
            if (activeTab !== null) {
              if (activeTab.process !== null) {
                processGroup.remove(activeTab.id);
              }
              await persistence.deleteSession(root, activeTab.sessionId);
              Object.assign(state, tabManager.closeTab(state, activeTab.id));
              listItems = specList.buildListItems(specs, state.tabs);
              state.focus = "list";
            }
            markAllDirty();
            break;
          }

          case "passthrough": {
            const activeTab = tabManager.getActiveTab(state);
            if (activeTab?.process !== null && activeTab !== null) {
              activeTab.process?.write(
                new TextDecoder().decode(key.raw),
              );
            }
            break;
          }

          case "none":
            break;
        }

        if (!state.running) break;
        if (dirtyPanels.size > 0) renderFrame();
      }
    });
  } finally {
    // Graceful shutdown
    unsubEvents();
    await processGroup.killAll();
    processGroup.forceKillAll();
    await persistence.gcStaleSessions(root);
    write(tui.mouse.disableMouse());
    write(tui.terminal.showCursorSeq());
    write(tui.terminal.exitAlternateScreen());
  }

  return results.ok(undefined);
};
