// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @module @eser/shell/tui
 *
 * Terminal UI — interactive prompts, spinners, progress bars, and styled output.
 *
 * Built on `@eser/streams/span` for multi-target rendering (ANSI, Markdown, plain).
 * All components are pure functions — no classes, no mutation (terminui-inspired).
 */

// Context & cancellation
export {
  CANCEL,
  type Cancel,
  type ConfirmOptions,
  createTestContext,
  createTuiContext,
  type GroupOptions,
  isCancel,
  type MultiselectOptions,
  type PromptOptions,
  type SelectOption,
  type SelectOptions,
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
  type KeypressEvent,
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
export { intro, log, outro } from "./log.ts";
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
