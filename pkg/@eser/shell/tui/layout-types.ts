// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Type definitions for the TUI widget system.
 *
 * Covers flex layout, scroll containers, tab bars, textarea editing,
 * and dirty-region tracking. This file contains NO runtime code.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Flex Layout Types
// ---------------------------------------------------------------------------

/** Direction a flex container lays out its children. */
export type FlexDirection = "row" | "column";

/** Size specification: fixed cells, percentage of parent, or flex grow/shrink. */
export type FlexSize =
  | { type: "fixed"; value: number }
  | { type: "percent"; value: number }
  | { type: "flex"; grow: number; shrink?: number };

/** A node in the layout tree — can contain children laid out via flex. */
export type FlexNode = {
  /** Layout direction for children. Default: "column". */
  readonly direction?: FlexDirection;
  /** How this node is sized inside its parent. Default: flex grow 1. */
  readonly size?: FlexSize;
  /** Gap between children in terminal cells. */
  readonly gap?: number;
  /** Inner padding in terminal cells. */
  readonly padding?: {
    readonly top?: number;
    readonly right?: number;
    readonly bottom?: number;
    readonly left?: number;
  };
  /** Child nodes. */
  readonly children?: ReadonlyArray<FlexNode>;
  /** Stable identifier for referencing the computed panel. */
  readonly id?: string;
};

/** Result of laying out a single FlexNode into absolute coordinates. */
export type ComputedPanel = {
  readonly id?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

// ---------------------------------------------------------------------------
// ScrollContainer Types
// ---------------------------------------------------------------------------

/** Immutable snapshot of vertical scroll position. */
export type ScrollState = {
  /** Index of the first visible row. */
  readonly offset: number;
  /** Total number of content rows. */
  readonly contentHeight: number;
  /** Number of rows visible in the viewport. */
  readonly viewportHeight: number;
};

/** Configuration for a scrollable container widget. */
export type ScrollContainerProps = {
  readonly panel: ComputedPanel;
  readonly contentHeight: number;
  /** Whether to render a scrollbar gutter. Default: true. */
  readonly showScrollbar?: boolean;
  /** Visual style for the scrollbar thumb. Default: "block". */
  readonly scrollbarStyle?: "block" | "line";
};

/** High-level scroll actions that a reducer can interpret. */
export type ScrollAction =
  | "up"
  | "down"
  | "pageUp"
  | "pageDown"
  | "home"
  | "end";

// ---------------------------------------------------------------------------
// TabBar Types
// ---------------------------------------------------------------------------

/** Describes a single tab for the tab-bar widget. */
export type TabDefinition = {
  readonly id: string;
  readonly label: string;
  /** Optional badge text shown next to the label. */
  readonly badge?: string;
  /** Colour hint for the badge. */
  readonly badgeColor?: "green" | "yellow" | "red" | "cyan" | "dim";
  /** Whether this tab can be closed by the user. */
  readonly closable?: boolean;
};

/** Configuration for rendering a tab bar. */
export type TabBarProps = {
  readonly tabs: ReadonlyArray<TabDefinition>;
  readonly activeIndex: number;
  /** Available horizontal columns for rendering. */
  readonly maxWidth: number;
  /** Visual style of the active-tab indicator. Default: "inverse". */
  readonly style?: "underline" | "inverse" | "bracket";
};

// ---------------------------------------------------------------------------
// Textarea Types
// ---------------------------------------------------------------------------

/** Immutable snapshot of a multi-line text editor. */
export type TextareaState = {
  readonly lines: ReadonlyArray<string>;
  readonly cursorRow: number;
  readonly cursorCol: number;
  /** Index of the first visible line (vertical scroll). */
  readonly scrollRow: number;
  /** When set, defines the anchor end of a selection range. */
  readonly selectionAnchor?: { readonly row: number; readonly col: number };
};

/** Configuration for rendering a textarea widget. */
export type TextareaProps = {
  readonly panel: ComputedPanel;
  readonly readonly?: boolean;
  /** Soft-wrap long lines. Default: true. */
  readonly wordWrap?: boolean;
  /** Show line numbers in a gutter. Default: false. */
  readonly lineNumbers?: boolean;
  /** Text shown when the editor is empty. */
  readonly placeholder?: string;
};

/** A single reversible text mutation for undo/redo. */
export type TextEdit = {
  readonly type: "insert" | "delete" | "replace";
  readonly position: { readonly row: number; readonly col: number };
  readonly text: string;
  /** Original text before a replace — needed for undo. */
  readonly replacedText?: string;
};

/** Undo/redo history stacks (both immutable). */
export type UndoStack = {
  readonly past: ReadonlyArray<TextEdit>;
  /** Edits that can be re-applied via redo. */
  readonly future: ReadonlyArray<TextEdit>;
};

/** Discriminated-union actions dispatched to a textarea reducer. */
export type TextareaAction =
  | { readonly type: "insert"; readonly text: string }
  | {
    readonly type: "delete";
    readonly direction: "backward" | "forward";
  }
  | {
    readonly type: "deleteWord";
    readonly direction: "backward" | "forward";
  }
  | {
    readonly type: "moveCursor";
    readonly direction: "up" | "down" | "left" | "right";
  }
  | {
    readonly type: "moveCursorWord";
    readonly direction: "left" | "right";
  }
  | {
    readonly type: "moveCursorLine";
    readonly direction: "home" | "end";
  }
  | {
    readonly type: "moveCursorDoc";
    readonly direction: "top" | "bottom";
  }
  | {
    readonly type: "select";
    readonly direction: "up" | "down" | "left" | "right";
  }
  | {
    readonly type: "selectWord";
    readonly direction: "left" | "right";
  }
  | { readonly type: "selectAll" }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "newline" }
  | { readonly type: "tab" };

// ---------------------------------------------------------------------------
// Dirty Tracking Types
// ---------------------------------------------------------------------------

/** Tracks whether a panel region needs re-rendering. */
export type DirtyRegion = {
  readonly panelId: string;
  readonly dirty: boolean;
  /** Optional hash of last rendered content for content-based invalidation. */
  readonly lastRenderHash?: number;
};

/** Collection of dirty-tracking state for all layout regions. */
export type DirtyTracker = {
  readonly regions: ReadonlyArray<DirtyRegion>;
};
