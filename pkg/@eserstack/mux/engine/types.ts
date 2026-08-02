// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Core data model for the multiplexer engine.
 *
 * The model is fully serializable: panes are plain descriptors and the layout
 * is a binary split tree. Live objects (PtyProcess, VTerminal) are owned by the
 * server and keyed by {@link PaneId}, never stored here — so {@link MuxState}
 * can be diffed, persisted, and sent over IPC unchanged.
 *
 * @module
 */

/** Stable identifier for a pane (e.g. "pane-3"). */
export type PaneId = string;

/** Stable identifier for a tab (e.g. "tab-2"). */
export type TabId = string;

/** A terminal pane runs a shell/command; an agent pane is driven programmatically. */
export type PaneKind = "terminal" | "agent";

/** Absolute, 1-based-friendly rectangle in terminal cells (0-based here). */
export type Geom = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** A client's terminal size in character cells. */
export type Viewport = {
  readonly cols: number;
  readonly rows: number;
};

/**
 * Serializable pane descriptor. No live PTY/VTerminal — those live in the
 * server keyed by `id`.
 */
export type Pane = {
  readonly id: PaneId;
  readonly kind: PaneKind;
  readonly title: string;
  readonly cwd?: string;
  /** Command to spawn; when omitted the server uses its default shell. */
  readonly command?: string;
  readonly args?: readonly string[];
  /** Free-form metadata for consumers (e.g. noskills session id / spec). */
  readonly meta?: Readonly<Record<string, string>>;
  /** Set once the underlying process has exited. */
  readonly exited?: boolean;
};

/**
 * Split arrangement.
 *
 * - `"vertical"` — a vertical divider, panes side by side (left/right) →
 *   maps to a flex `"row"`.
 * - `"horizontal"` — a horizontal divider, panes stacked (top/bottom) →
 *   maps to a flex `"column"`.
 *
 * This single mapping is applied in `geometry.ts`; document it here so the
 * confusion that bit the old hand-rolled layout never recurs.
 */
export type SplitDirection = "vertical" | "horizontal";

/** Binary split tree: a leaf holds one pane, a branch splits two children. */
export type SplitNode =
  | { readonly kind: "leaf"; readonly pane: PaneId }
  | {
    readonly kind: "branch";
    readonly direction: SplitDirection;
    readonly first: SplitNode;
    readonly second: SplitNode;
    /** Fraction of the parent allotted to `first` (0..1). */
    readonly ratio: number;
  };

/** A tab is a named workspace holding a split tree of panes. */
export type Tab = {
  readonly id: TabId;
  readonly name: string;
  readonly root: SplitNode;
  readonly focusedPane: PaneId;
  /** When set, only this pane is rendered (zoom). */
  readonly fullscreenPane?: PaneId;
};

/** Cardinal direction for focus movement and resizing. */
export type Direction = "up" | "down" | "left" | "right";

/** Scrollback navigation action. */
export type ScrollAction =
  | "up"
  | "down"
  | "pageUp"
  | "pageDown"
  | "home"
  | "end";

/** Keybinding mode (determines how keys are interpreted). */
export type InputMode =
  | "normal"
  | "pane"
  | "tab"
  | "resize"
  | "scroll"
  | "locked";

/** The full, serializable engine state. */
export type MuxState = {
  readonly panes: Readonly<Record<PaneId, Pane>>;
  readonly tabs: readonly Tab[];
  readonly activeTab: number;
  readonly mode: InputMode;
  readonly viewport: Viewport;
  readonly running: boolean;
  readonly nextPaneSeq: number;
  readonly nextTabSeq: number;
};

/**
 * Engine vocabulary. Frontends translate raw input (keys, mouse) into actions;
 * the reducer is the single place that interprets them.
 */
export type Action =
  | { readonly type: "switchMode"; readonly mode: InputMode }
  | { readonly type: "splitPane"; readonly direction: SplitDirection }
  | {
    readonly type: "newPane";
    readonly direction?: SplitDirection;
    readonly kind?: PaneKind;
    readonly command?: string;
    readonly args?: readonly string[];
    readonly cwd?: string;
    readonly title?: string;
    readonly meta?: Readonly<Record<string, string>>;
  }
  | { readonly type: "closeFocusedPane" }
  | { readonly type: "focusDirection"; readonly direction: Direction }
  | { readonly type: "focusNext" }
  | { readonly type: "focusPrev" }
  | { readonly type: "focusPane"; readonly pane: PaneId }
  | { readonly type: "toggleFullscreen" }
  | {
    readonly type: "resizePane";
    readonly direction: Direction;
    readonly step?: number;
  }
  | {
    readonly type: "newTab";
    readonly kind?: PaneKind;
    readonly command?: string;
    readonly args?: readonly string[];
    readonly cwd?: string;
    readonly title?: string;
    readonly meta?: Readonly<Record<string, string>>;
  }
  | { readonly type: "closeTab"; readonly index?: number }
  | { readonly type: "gotoTab"; readonly index: number }
  | { readonly type: "nextTab" }
  | { readonly type: "prevTab" }
  | { readonly type: "scroll"; readonly action: ScrollAction }
  | { readonly type: "writeInput"; readonly data: string }
  | {
    readonly type: "writeToPane";
    readonly pane: PaneId;
    readonly data: string;
  }
  | {
    readonly type: "resizeViewport";
    readonly cols: number;
    readonly rows: number;
  }
  | {
    readonly type: "paneExited";
    readonly pane: PaneId;
    readonly code: number;
  }
  | { readonly type: "detach" }
  | { readonly type: "quit" };
