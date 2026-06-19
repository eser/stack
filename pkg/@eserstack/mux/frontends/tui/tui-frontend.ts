// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The ANSI TUI frontend.
 *
 * Owns a {@link VTermWidget} per pane (fed by the server's raw output stream),
 * composites them with the scene into a frame on a single coalescing scheduler,
 * and writes to stdout. Raw input is mapped to actions and sent back. It only
 * ever talks to the server through the neutral protocol, so the same server can
 * just as well drive a browser frontend.
 *
 * @module
 */

import * as tui from "@eserstack/shell/tui";
import { runtime } from "@eserstack/standards/cross-runtime";
import type { PaneId, Viewport } from "../../engine/types.ts";
import {
  type DecorationRegions,
  decorationRegions,
  DEFAULT_CHROME,
} from "../../engine/geometry.ts";
import type { Keymap } from "../../keybindings/mod.ts";
import type {
  FrontendToServer,
  ServerToFrontend,
  Transport,
} from "../../ipc/protocol.ts";
import type { Scene } from "../../scene/scene.ts";
import { createScheduler } from "../../render/scheduler.ts";
import type { Frontend } from "../frontend.ts";
import { composite } from "./compositor.ts";
import { keyToMessages, mouseToMessages } from "./input-source.ts";

/** Render extra content into the chrome's reserved regions (sidebars/strips). */
export type DecorateFn = (
  ctx: { readonly regions: DecorationRegions; readonly scene: Scene },
) => string;

export type TuiFrontendOptions = {
  readonly transport: Transport<FrontendToServer, ServerToFrontend>;
  readonly keymap: Keymap;
  readonly sizePollMs?: number;
  /** Draw consumer decorations (e.g. a spec-list sidebar) each frame. */
  readonly decorate?: DecorateFn;
  /** Intercept a key before default handling; return true if handled (consumed). */
  readonly onKey?: (key: tui.KeypressEvent, scene: Scene | null) => boolean;
  /** Intercept a mouse event before default handling; return true if handled. */
  readonly onMouse?: (ev: tui.mouse.MouseEvent, scene: Scene | null) => boolean;
  /** Override the status-bar text (otherwise mux's mode hints are shown). */
  readonly statusText?: string;
};

const encoder = new TextEncoder();

export const createTuiFrontend = (opts: TuiFrontendOptions): Frontend => {
  const { transport, keymap } = opts;
  const widgets = new Map<PaneId, tui.VTermWidget>();

  let scene: Scene | null = null;
  let running = false;
  let stopped = false;
  let abort: AbortController | null = null;
  let sizeTimer: ReturnType<typeof setInterval> | null = null;
  let lastViewport: Viewport = { cols: 80, rows: 24 };

  const write = (s: string): void =>
    runtime.process.writeToStdout(encoder.encode(s));

  const ensureWidget = (id: PaneId): tui.VTermWidget => {
    const existing = widgets.get(id);
    if (existing !== undefined) return existing;

    const p = scene?.panes.find((pp) => pp.id === id);
    const cols = p ? Math.max(1, p.geom.width - 2) : 80;
    const rows = p ? Math.max(1, p.geom.height - 2) : 24;
    const widget = new tui.VTermWidget(rows, cols);
    widgets.set(id, widget);

    return widget;
  };

  const reconcileWidgets = (): void => {
    if (scene === null) return;

    const live = new Set<PaneId>();
    for (const p of scene.panes) {
      live.add(p.id);
      const cols = Math.max(1, p.geom.width - 2);
      const rows = Math.max(1, p.geom.height - 2);
      const w = widgets.get(p.id);
      if (w === undefined) {
        widgets.set(p.id, new tui.VTermWidget(rows, cols));
      } else if (w.terminal.rows !== rows || w.terminal.cols !== cols) {
        w.resize(rows, cols);
      }
    }

    for (const id of [...widgets.keys()]) {
      if (!live.has(id)) widgets.delete(id);
    }
  };

  const render = (fullRedraw: boolean): void => {
    if (stopped || scene === null) return;

    const frame = composite(
      scene,
      { getWidget: (id) => widgets.get(id) },
      { fullRedraw, statusText: opts.statusText },
    );

    let out = tui.terminal.hideCursorSeq() + frame.data;
    if (opts.decorate !== undefined) {
      out += opts.decorate({
        regions: decorationRegions(scene.viewport, scene.chrome),
        scene,
      });
    }
    out += tui.ansi.moveTo(frame.cursor.row, frame.cursor.col) +
      (frame.cursor.visible ? tui.terminal.showCursorSeq() : "");

    write(out);
  };

  const scheduler = createScheduler(render);

  const handle = (msg: ServerToFrontend): void => {
    switch (msg.t) {
      case "scene": {
        const prev = scene;
        const d = msg.delta;
        scene = {
          tabs: d.tabs ?? prev?.tabs ?? [],
          activeTab: d.activeTab ?? prev?.activeTab ?? 0,
          mode: d.mode ?? prev?.mode ?? "normal",
          viewport: d.viewport ?? prev?.viewport ?? lastViewport,
          focusedPane: d.focusedPane !== undefined
            ? d.focusedPane
            : (prev?.focusedPane ?? null),
          panes: d.panes ?? prev?.panes ?? [],
          chrome: d.chrome ?? prev?.chrome ?? DEFAULT_CHROME,
        };

        const structural = msg.full || d.panes !== undefined ||
          d.tabs !== undefined || d.viewport !== undefined ||
          d.chrome !== undefined;
        if (structural) reconcileWidgets();

        if (structural) scheduler.requestFull();
        else scheduler.schedule();
        break;
      }

      case "output":
        ensureWidget(msg.pane).write(msg.data);
        scheduler.schedule();
        break;

      case "exit":
        stop();
        break;
    }
  };

  const startSizePoll = (): void => {
    sizeTimer = setInterval(() => {
      const s = tui.terminal.getTerminalSize();
      if (s.cols !== lastViewport.cols || s.rows !== lastViewport.rows) {
        lastViewport = { cols: s.cols, rows: s.rows };
        transport.send({ t: "resize", viewport: lastViewport });
      }
    }, opts.sizePollMs ?? 250);
  };

  const stop = (): void => {
    if (!running) return;
    running = false;
    stopped = true; // make any late refresh()/render() a no-op
    abort?.abort();
    if (sizeTimer !== null) clearInterval(sizeTimer);
    scheduler.stop();
    write(
      tui.mouse.disableMouse() +
        tui.terminal.showCursorSeq() +
        tui.terminal.exitAlternateScreen(),
    );
    transport.close();
  };

  const run = async (): Promise<void> => {
    running = true;
    transport.onMessage(handle);

    write(
      tui.terminal.enterAlternateScreen() +
        tui.terminal.hideCursorSeq() +
        tui.terminal.clearScreenSeq() +
        tui.mouse.enableMouse(),
    );

    const vp = tui.terminal.getTerminalSize();
    lastViewport = { cols: vp.cols, rows: vp.rows };
    transport.send({ t: "attach", viewport: lastViewport });
    startSizePoll();

    abort = new AbortController();
    await tui.withRawMode(async () => {
      for await (
        const ev of tui.readInput(runtime.process.stdin, abort!.signal)
      ) {
        if (!running) break;

        // A throwing consumer interceptor must not kill the input pump.
        try {
          if (ev.kind === "mouse") {
            if (opts.onMouse?.(ev.event, scene) === true) continue;
            for (const m of mouseToMessages(ev.event, scene)) transport.send(m);
          } else {
            if (opts.onKey?.(ev.event, scene) === true) continue;
            for (
              const m of keyToMessages(
                ev.event,
                scene?.mode ?? "normal",
                keymap,
              )
            ) {
              transport.send(m);
            }
          }
        } catch {
          // ignore a bad interceptor / dispatch and keep reading input
        }
      }
    });
  };

  return {
    handle,
    run,
    stop,
    refresh: () => {
      if (!stopped) scheduler.schedule();
    },
  };
};
