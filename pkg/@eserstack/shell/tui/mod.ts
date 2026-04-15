// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @module @eserstack/shell/tui
 *
 * Terminal UI — interactive prompts, spinners, progress bars, and styled output.
 *
 * Built on `@eserstack/streams/span` for multi-target rendering (ANSI, Markdown, plain).
 * All components are pure functions — no classes, no mutation (terminui-inspired).
 */

// Context & cancellation
export {
  CANCEL,
  type Cancel,
  type ConfirmOptions,
  createTestContext,
  createTuiContext,
  DEFAULT_SIGNALS,
  type GroupOptions,
  isCancel,
  type MultiselectOptions,
  type PromptOptions,
  type SelectOption,
  type SelectOptions,
  type SignalAction,
  type SignalConfig,
  type TextOptions,
  type TuiContext,
  type TuiContextOptions,
  type TuiTarget,
} from "./types.ts";

// Unicode symbols
export * as symbols from "./symbols.ts";

// Terminal utilities
export { stripAnsi, supportsColor } from "./colors.ts";

// Input handling
export {
  clearLines,
  eraseLine,
  hideCursor,
  type InputEvent,
  type KeypressEvent,
  readInput,
  readKeypress,
  showCursor,
  withRawMode,
} from "./keypress.ts";

// Interactive prompts
export { confirm } from "./confirm.ts";
export { text } from "./text.ts";
export { select } from "./select.ts";
export { multiselect } from "./multiselect.ts";
export { group } from "./group.ts";

// Non-interactive output
export { gap, gapDetached, intro, log, messageDetached, outro } from "./log.ts";
export {
  createSpinner,
  type SpinnerHandle,
  type SpinnerOptions,
} from "./spinner.ts";
export {
  createProgress,
  type ProgressHandle,
  type ProgressOptions,
} from "./progress.ts";

// TUI primitives — terminal control, rendering, layout
export * as terminal from "./terminal.ts";
export * as ansi from "./ansi.ts";
export * as box from "./box.ts";
export * as layout from "./layout.ts";
export * as list from "./list.ts";

// Mouse support
export * as mouse from "./mouse.ts";

// Virtual terminal widget
export { VTermWidget } from "./vterm-widget.ts";

// TUI widget system — layout, scroll, tabs, text editing, dirty tracking
export * as layoutTypes from "./layout-types.ts";
export * as flexLayout from "./flex-layout.ts";
export * as scrollContainer from "./scroll-container.ts";
export * as tabBar from "./tab-bar.ts";
export * as dirtyTracker from "./dirty-tracker.ts";
export * as textarea from "./textarea.ts";
