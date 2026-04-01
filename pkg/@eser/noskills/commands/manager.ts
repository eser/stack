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
  const root = runtime.process.cwd();

  if (!(await persistence.isInitialized(root))) {
    console.error("noskills is not initialized. Run:", cmdPrefix(), "init");
    return results.fail({ exitCode: 1 });
  }

  // Load specs
  const specStates = await persistence.listSpecStates(root);
  const specs: specList.SpecInfo[] = specStates.map((s) => ({
    name: s.name,
    phase: s.state.phase,
    hasActiveSession: false,
  }));

  const state = managerTypes.createInitialState();
  const { cols, rows } = tui.terminal.getTerminalSize();

  const layoutConfig: tui.layout.LayoutConfig = {
    leftWidth: 0.25,
    rightTopHeight: 0.35,
  };
  const panels = tui.layout.calculateLayout(cols, rows, layoutConfig);

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

    // Terminal
    write(terminalPanel.render(activeTab, panels.rightBottom));

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

    const innerW = panels.rightBottom.width - 2;
    const innerH = panels.rightBottom.height - 2;
    const widget = new tui.VTermWidget(innerH, innerW);

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
        },
        cols: innerW,
        rows: innerH,
      });

      tab.process = pty;
      processGroup.add(tab.id, pty);

      // Wire PTY output to VTermWidget + trigger re-render
      pty.onData((data) => {
        widget.write(data);
        tabManager.appendToBuffer(tab, data); // keep raw buffer too
        scheduleRender?.();
      });
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

    const specInnerW = panels.rightBottom.width - 2;
    const specInnerH = panels.rightBottom.height - 2;
    const specWidget = new tui.VTermWidget(specInnerH, specInnerW);

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
        },
        cols: specInnerW,
        rows: specInnerH,
      });

      tab.process = pty;
      processGroup.add(tab.id, pty);

      pty.onData((data) => {
        specWidget.write(data);
        tabManager.appendToBuffer(tab, data);
        scheduleRender?.();
      });
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

    // Status bar — always render (cheap, 1 line)
    if (dirtyPanels.has("status") || dirtyPanels.size === 0) {
      const focusLabel = state.focus === "list" ? "LIST" : "TERM";
      const statusText =
        ` noskills manager | ${specs.length} spec(s) | ${state.tabs.length} tab(s) | [${focusLabel}] Tab: toggle | q: quit | n: new | f: free`;
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

    if (dirtyPanels.has("specs")) {
      buf.push(
        specList.render(
          specs,
          state.tabs,
          state.selectedTabIndex,
          panels.left,
        ),
      );
    }

    if (dirtyPanels.has("monitor")) {
      buf.push(monitor.render(activeTab, panels.rightTop));
    }

    if (dirtyPanels.has("terminal")) {
      buf.push(terminalPanel.render(activeTab, panels.rightBottom));
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

  markAllDirty();
  renderFrame();

  // ── Mouse helpers ──
  const isInsidePanel = (
    mx: number,
    my: number,
    p: tui.layout.Panel,
  ): boolean =>
    mx >= p.x && mx < p.x + p.width && my >= p.y && my < p.y + p.height;

  const handleMouse = async (
    ev: tui.mouse.MouseEvent,
  ): Promise<void> => {
    // Click in spec list → select item or trigger action
    if (isInsidePanel(ev.x + 1, ev.y + 1, panels.left)) {
      if (ev.type === "mousedown" && ev.button === 0) {
        state.focus = "list";
        const relRow = ev.y + 1 - panels.left.y - 1; // adjust for 0-based + border
        if (relRow >= 0 && relRow < listItems.length) {
          const item = listItems[relRow]!;
          if (item.selectable !== false) {
            state.selectedTabIndex = relRow;
            // Check if it's an action item
            if (item.label.includes("[n]") || item.label.includes("[f]")) {
              await createFreeTab();
              markAllDirty();
              return;
            }
            // It's a spec — open tab for it
            const specName = specs.find((s) => s.name === item.label)?.name;
            if (specName !== undefined) {
              await createSpecTab(specName);
              markAllDirty();
              return;
            }
          }
        }
        dirtyPanels.add("specs");
        dirtyPanels.add("monitor");
        dirtyPanels.add("status");
      } else if (ev.type === "wheel") {
        const dir = ev.direction === "up" ? "up" : "down";
        Object.assign(
          state,
          keyboardRouter.navigateList(state, dir, listItems),
        );
        dirtyPanels.add("specs");
        dirtyPanels.add("monitor");
      }
      return;
    }

    // Click in terminal panel → focus terminal + forward mouse to PTY
    if (isInsidePanel(ev.x + 1, ev.y + 1, panels.rightBottom)) {
      state.focus = "terminal";
      dirtyPanels.add("status");

      const activeTab = tabManager.getActiveTab(state);
      if (activeTab?.process !== null && activeTab !== null) {
        // Forward mouse as SGR sequence relative to terminal inner area
        const relX = ev.x + 1 - panels.rightBottom.x; // panel-relative
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

      // Wheel in terminal → forward as scroll
      if (
        ev.type === "wheel" && activeTab?.process !== null && activeTab !== null
      ) {
        const scrollKey = ev.direction === "up" ? "\x1b[A" : "\x1b[B";
        activeTab.process?.write(scrollKey.repeat(3));
      }
      return;
    }

    // Click in monitor → focus spec list
    if (isInsidePanel(ev.x + 1, ev.y + 1, panels.rightTop)) {
      state.focus = "list";
      dirtyPanels.add("status");
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

          case "freeMode":
            await createFreeTab();
            markAllDirty();
            break;

          case "newSpec":
            await createFreeTab();
            markAllDirty();
            break;

          case "select": {
            const selectedItem = listItems[state.selectedTabIndex];
            if (selectedItem === undefined) break;

            const label = selectedItem.label;
            if (label.includes("[n]") || label.includes("[f]")) {
              await createFreeTab();
            } else {
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
    await processGroup.killAll();
    processGroup.forceKillAll();
    await persistence.gcStaleSessions(root);
    write(tui.mouse.disableMouse());
    write(tui.terminal.showCursorSeq());
    write(tui.terminal.exitAlternateScreen());
  }

  return results.ok(undefined);
};
