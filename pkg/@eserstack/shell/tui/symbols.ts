// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Unicode glyphs for TUI prompt chrome (clack-style).
 *
 * @module
 */

// Bar connectors
/** Vertical bar that joins a prompt to the lines under it. */
export const BAR = "│";
/** Top corner that opens a prompt group, as drawn by `intro`. */
export const BAR_START = "┌";
/** Bottom corner that closes a prompt or a prompt group. */
export const BAR_END = "└";
/** Horizontal bar segment. */
export const BAR_H = "─";

// Radio buttons (select)
/** The highlighted option in `select`. */
export const RADIO_ACTIVE = "●";
/** An option in `select` that is not highlighted. */
export const RADIO_INACTIVE = "○";

// Checkboxes (multiselect)
/** A checked option in `multiselect`. */
export const CHECKBOX_ACTIVE = "◼";
/** An unchecked option in `multiselect`. */
export const CHECKBOX_INACTIVE = "◻";

// Prompt state markers
/** Marks the prompt waiting for an answer. */
export const PROMPT_ACTIVE = "◆";
/** Marks a prompt that has been answered. */
export const PROMPT_DONE = "◇";
/** Marks a prompt that was cancelled. */
export const PROMPT_CANCEL = "■";

// Alert/log icons
/** Status icon for an informational line, such as a spinner stopped with info. */
export const S_INFO = "●";
/** Status icon for a success line. */
export const S_SUCCESS = "◆";
/** Status icon for a warning, such as a prompt's validation message. */
export const S_WARN = "▲";
/** Status icon for an error line. */
export const S_ERROR = "■";
/** Status icon for a step line, as drawn by `log.step`. */
export const S_STEP = "◇";
