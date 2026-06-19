// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The TUI compositor: turns a neutral {@link Scene} plus per-pane terminal
 * widgets into one ANSI {@link Frame}.
 *
 * Coordinate convention (matching the existing widgets): pane `Geom` is 0-based;
 * a box is drawn with its top-left at the 1-based `(geom.y+1, geom.x+1)`, and
 * `VTermWidget.render` insets one cell for the border. The tab bar occupies
 * row 1; the status bar the last row.
 *
 * @module
 */

import * as tui from "@eserstack/shell/tui";
import type { InputMode, PaneId } from "../../engine/types.ts";
import type { Scene } from "../../scene/scene.ts";
import type { Frame } from "./frame.ts";

/** Live terminal widgets the compositor reads pane contents from. */
export type CompositorDeps = {
  getWidget(pane: PaneId): tui.VTermWidget | undefined;
};

const MODE_HINTS: Record<InputMode, string> = {
  normal:
    "ctrl+p pane · ctrl+t tab · ctrl+n resize · ctrl+s scroll · ctrl+q quit",
  pane: "PANE: n new · v|s split · x close · f full · hjkl focus · esc",
  tab: "TAB: n new · x close · h/l switch · 1-9 goto · esc",
  resize: "RESIZE: hjkl/arrows · esc",
  scroll: "SCROLL: j/k · g/G · esc",
  locked: "LOCKED: ctrl+g to unlock",
};

const statusBar = (scene: Scene, override?: string): string => {
  const cols = scene.viewport.cols;
  const text = override ??
    ` ${scene.mode.toUpperCase()}  ${MODE_HINTS[scene.mode]}`;
  const visible = tui.ansi.visibleLength(text);
  const padded = tui.ansi.truncate(text, cols) +
    " ".repeat(Math.max(0, cols - visible));

  return tui.ansi.moveTo(scene.viewport.rows, 1) + tui.ansi.inverse(padded);
};

export const composite = (
  scene: Scene,
  deps: CompositorDeps,
  opts: { readonly fullRedraw: boolean; readonly statusText?: string },
): Frame => {
  const buf: string[] = [];

  if (opts.fullRedraw) buf.push(tui.terminal.clearScreenSeq());

  // Tab bar (row 1).
  const tabBar = tui.tabBar.renderTabBar({
    tabs: scene.tabs.map((t) => ({ id: t.id, label: t.name })),
    activeIndex: scene.activeTab,
    maxWidth: scene.viewport.cols,
  });
  buf.push(tui.ansi.moveTo(1, 1) + tabBar);

  let cursor = { row: scene.viewport.rows, col: 1, visible: false };

  for (const pane of scene.panes) {
    // Too small to draw a bordered box — skip rather than emit garbage.
    if (pane.geom.width < 2 || pane.geom.height < 2) continue;

    const boxPanel = {
      id: pane.id,
      x: pane.geom.x + 1,
      y: pane.geom.y + 1,
      width: pane.geom.width,
      height: pane.geom.height,
    };

    buf.push(
      tui.box.drawBox({
        ...boxPanel,
        title: pane.title,
        borderStyle: pane.focused ? "double" : "single",
        skipInterior: true,
      }),
    );

    const widget = deps.getWidget(pane.id);
    if (widget !== undefined) {
      buf.push(widget.render(boxPanel, opts.fullRedraw));

      if (pane.focused) {
        cursor = {
          row: boxPanel.y + 1 + widget.terminal.cursorRow,
          col: boxPanel.x + 1 + widget.terminal.cursorCol,
          visible: true,
        };
      }
    }
  }

  buf.push(statusBar(scene, opts.statusText));

  return { data: buf.join(""), cursor };
};
