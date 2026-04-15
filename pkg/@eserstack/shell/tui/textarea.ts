// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Full multi-line text editor widget with undo/redo, word selection,
 * and keybindings.
 *
 * Every function is pure — all state transitions return new objects,
 * no mutation occurs. Compose freely with the rest of the TUI system.
 *
 * @module
 */

import * as ansi from "./ansi.ts";
import * as layoutTypes from "./layout-types.ts";

// ---------------------------------------------------------------------------
// Clamp helper
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

// ---------------------------------------------------------------------------
// State factories
// ---------------------------------------------------------------------------

/** Create an initial textarea state, optionally pre-filled with text. */
export const createTextareaState = (
  initialText?: string,
): layoutTypes.TextareaState => {
  const lines = initialText !== undefined && initialText !== ""
    ? initialText.split("\n")
    : [""];

  return {
    lines,
    cursorRow: 0,
    cursorCol: 0,
    scrollRow: 0,
    selectionAnchor: undefined,
  };
};

/** Create an empty undo/redo stack. */
export const createUndoStack = (): layoutTypes.UndoStack => ({
  past: [],
  future: [],
});

// ---------------------------------------------------------------------------
// Word boundary helper
// ---------------------------------------------------------------------------

const isWordChar = (ch: string): boolean => /[\w]/.test(ch);

/**
 * Find the column of the next word boundary in the given direction.
 * Words are sequences of alphanumeric/underscore characters.
 */
export const findWordBoundary = (
  line: string,
  col: number,
  direction: "left" | "right",
): number => {
  if (direction === "left") {
    let c = col;
    // Skip whitespace/non-word chars going left
    while (c > 0 && !isWordChar(line[c - 1]!)) {
      c--;
    }
    // Skip word chars going left
    while (c > 0 && isWordChar(line[c - 1]!)) {
      c--;
    }
    return c;
  }

  // direction === "right"
  let c = col;
  const len = line.length;
  // Skip word chars going right
  while (c < len && isWordChar(line[c]!)) {
    c++;
  }
  // Skip whitespace/non-word chars going right
  while (c < len && !isWordChar(line[c]!)) {
    c++;
  }
  return c;
};

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

/** Normalise a selection range so start <= end. Returns undefined when there is no selection. */
export const getSelectionRange = (
  state: layoutTypes.TextareaState,
):
  | { start: { row: number; col: number }; end: { row: number; col: number } }
  | undefined => {
  if (state.selectionAnchor === undefined) {
    return undefined;
  }

  const anchor = state.selectionAnchor;
  const cursor = { row: state.cursorRow, col: state.cursorCol };

  const anchorBefore = anchor.row < cursor.row ||
    (anchor.row === cursor.row && anchor.col <= cursor.col);

  return anchorBefore
    ? { start: anchor, end: cursor }
    : { start: cursor, end: anchor };
};

/** Return the selected text between anchor and cursor. Empty string if no selection. */
export const getSelectedText = (
  state: layoutTypes.TextareaState,
): string => {
  const range = getSelectionRange(state);
  if (range === undefined) {
    return "";
  }

  const { start, end } = range;

  if (start.row === end.row) {
    return state.lines[start.row]!.slice(start.col, end.col);
  }

  const parts: string[] = [];
  parts.push(state.lines[start.row]!.slice(start.col));
  for (let r = start.row + 1; r < end.row; r++) {
    parts.push(state.lines[r]!);
  }
  parts.push(state.lines[end.row]!.slice(0, end.col));
  return parts.join("\n");
};

/** Delete selected text. Returns collapsed state and updated undo stack. */
export const deleteSelection = (
  state: layoutTypes.TextareaState,
  undoStack: layoutTypes.UndoStack,
): { state: layoutTypes.TextareaState; undoStack: layoutTypes.UndoStack } => {
  const range = getSelectionRange(state);
  if (range === undefined) {
    return { state, undoStack };
  }

  const { start, end } = range;
  const deletedText = getSelectedText(state);

  const before = state.lines[start.row]!.slice(0, start.col);
  const after = state.lines[end.row]!.slice(end.col);
  const merged = before + after;

  const newLines = [
    ...state.lines.slice(0, start.row),
    merged,
    ...state.lines.slice(end.row + 1),
  ];

  const edit: layoutTypes.TextEdit = {
    type: "delete",
    position: { row: start.row, col: start.col },
    text: deletedText,
  };

  return {
    state: {
      lines: newLines,
      cursorRow: start.row,
      cursorCol: start.col,
      scrollRow: state.scrollRow,
      selectionAnchor: undefined,
    },
    undoStack: {
      past: [...undoStack.past, edit],
      future: [],
    },
  };
};

// ---------------------------------------------------------------------------
// Internal reducer helpers
// ---------------------------------------------------------------------------

type ReducerResult = {
  state: layoutTypes.TextareaState;
  undoStack: layoutTypes.UndoStack;
};

const pushEdit = (
  undoStack: layoutTypes.UndoStack,
  edit: layoutTypes.TextEdit,
): layoutTypes.UndoStack => ({
  past: [...undoStack.past, edit],
  future: [],
});

/** Ensure cursorRow is visible by adjusting scrollRow. */
const autoScroll = (
  state: layoutTypes.TextareaState,
  viewportHeight: number,
): layoutTypes.TextareaState => {
  const vh = viewportHeight > 0 ? viewportHeight : 20;
  let sr = state.scrollRow;
  if (state.cursorRow < sr) {
    sr = state.cursorRow;
  } else if (state.cursorRow >= sr + vh) {
    sr = state.cursorRow - vh + 1;
  }
  return sr !== state.scrollRow ? { ...state, scrollRow: sr } : state;
};

// ---------------------------------------------------------------------------
// Insert
// ---------------------------------------------------------------------------

const handleInsert = (
  state: layoutTypes.TextareaState,
  undoStack: layoutTypes.UndoStack,
  text: string,
): ReducerResult => {
  // If there is a selection, delete it first
  let current = state;
  let undo = undoStack;
  if (current.selectionAnchor !== undefined) {
    const sel = deleteSelection(current, undo);
    current = sel.state;
    undo = sel.undoStack;
  }

  const { cursorRow, cursorCol, lines } = current;
  const line = lines[cursorRow]!;
  const before = line.slice(0, cursorCol);
  const after = line.slice(cursorCol);

  const insertParts = text.split("\n");
  const edit: layoutTypes.TextEdit = {
    type: "insert",
    position: { row: cursorRow, col: cursorCol },
    text,
  };

  if (insertParts.length === 1) {
    const newLine = before + text + after;
    const newLines = [
      ...lines.slice(0, cursorRow),
      newLine,
      ...lines.slice(cursorRow + 1),
    ];
    return {
      state: {
        lines: newLines,
        cursorRow,
        cursorCol: cursorCol + text.length,
        scrollRow: current.scrollRow,
        selectionAnchor: undefined,
      },
      undoStack: pushEdit(undo, edit),
    };
  }

  // Multi-line insert
  const firstLine = before + insertParts[0]!;
  const lastPart = insertParts[insertParts.length - 1]!;
  const lastLine = lastPart + after;
  const middleLines = insertParts.slice(1, -1);

  const newLines = [
    ...lines.slice(0, cursorRow),
    firstLine,
    ...middleLines,
    lastLine,
    ...lines.slice(cursorRow + 1),
  ];

  return {
    state: {
      lines: newLines,
      cursorRow: cursorRow + insertParts.length - 1,
      cursorCol: lastPart.length,
      scrollRow: current.scrollRow,
      selectionAnchor: undefined,
    },
    undoStack: pushEdit(undo, edit),
  };
};

// ---------------------------------------------------------------------------
// Delete (single char)
// ---------------------------------------------------------------------------

const handleDelete = (
  state: layoutTypes.TextareaState,
  undoStack: layoutTypes.UndoStack,
  direction: "backward" | "forward",
): ReducerResult => {
  // If there is a selection, delete it regardless of direction
  if (state.selectionAnchor !== undefined) {
    return deleteSelection(state, undoStack);
  }

  const { cursorRow, cursorCol, lines } = state;
  const line = lines[cursorRow]!;

  if (direction === "backward") {
    if (cursorCol === 0) {
      if (cursorRow === 0) {
        return { state, undoStack };
      }
      // Merge with previous line
      const prevLine = lines[cursorRow - 1]!;
      const merged = prevLine + line;
      const newLines = [
        ...lines.slice(0, cursorRow - 1),
        merged,
        ...lines.slice(cursorRow + 1),
      ];

      const edit: layoutTypes.TextEdit = {
        type: "delete",
        position: { row: cursorRow - 1, col: prevLine.length },
        text: "\n",
      };

      return {
        state: {
          lines: newLines,
          cursorRow: cursorRow - 1,
          cursorCol: prevLine.length,
          scrollRow: state.scrollRow,
          selectionAnchor: undefined,
        },
        undoStack: pushEdit(undoStack, edit),
      };
    }

    // Remove character before cursor
    const deleted = line[cursorCol - 1]!;
    const newLine = line.slice(0, cursorCol - 1) + line.slice(cursorCol);
    const newLines = [
      ...lines.slice(0, cursorRow),
      newLine,
      ...lines.slice(cursorRow + 1),
    ];

    const edit: layoutTypes.TextEdit = {
      type: "delete",
      position: { row: cursorRow, col: cursorCol - 1 },
      text: deleted,
    };

    return {
      state: {
        lines: newLines,
        cursorRow,
        cursorCol: cursorCol - 1,
        scrollRow: state.scrollRow,
        selectionAnchor: undefined,
      },
      undoStack: pushEdit(undoStack, edit),
    };
  }

  // Forward delete
  if (cursorCol === line.length) {
    if (cursorRow === lines.length - 1) {
      return { state, undoStack };
    }
    // Merge with next line
    const nextLine = lines[cursorRow + 1]!;
    const merged = line + nextLine;
    const newLines = [
      ...lines.slice(0, cursorRow),
      merged,
      ...lines.slice(cursorRow + 2),
    ];

    const edit: layoutTypes.TextEdit = {
      type: "delete",
      position: { row: cursorRow, col: cursorCol },
      text: "\n",
    };

    return {
      state: {
        lines: newLines,
        cursorRow,
        cursorCol,
        scrollRow: state.scrollRow,
        selectionAnchor: undefined,
      },
      undoStack: pushEdit(undoStack, edit),
    };
  }

  // Remove character at cursor
  const deleted = line[cursorCol]!;
  const newLine = line.slice(0, cursorCol) + line.slice(cursorCol + 1);
  const newLines = [
    ...lines.slice(0, cursorRow),
    newLine,
    ...lines.slice(cursorRow + 1),
  ];

  const edit: layoutTypes.TextEdit = {
    type: "delete",
    position: { row: cursorRow, col: cursorCol },
    text: deleted,
  };

  return {
    state: {
      lines: newLines,
      cursorRow,
      cursorCol,
      scrollRow: state.scrollRow,
      selectionAnchor: undefined,
    },
    undoStack: pushEdit(undoStack, edit),
  };
};

// ---------------------------------------------------------------------------
// DeleteWord
// ---------------------------------------------------------------------------

const handleDeleteWord = (
  state: layoutTypes.TextareaState,
  undoStack: layoutTypes.UndoStack,
  direction: "backward" | "forward",
): ReducerResult => {
  if (state.selectionAnchor !== undefined) {
    return deleteSelection(state, undoStack);
  }

  const { cursorRow, cursorCol, lines } = state;
  const line = lines[cursorRow]!;

  if (direction === "backward") {
    if (cursorCol === 0) {
      // At start of line — behave like single backward delete
      return handleDelete(state, undoStack, "backward");
    }
    const boundary = findWordBoundary(line, cursorCol, "left");
    const deleted = line.slice(boundary, cursorCol);
    const newLine = line.slice(0, boundary) + line.slice(cursorCol);
    const newLines = [
      ...lines.slice(0, cursorRow),
      newLine,
      ...lines.slice(cursorRow + 1),
    ];

    const edit: layoutTypes.TextEdit = {
      type: "delete",
      position: { row: cursorRow, col: boundary },
      text: deleted,
    };

    return {
      state: {
        lines: newLines,
        cursorRow,
        cursorCol: boundary,
        scrollRow: state.scrollRow,
        selectionAnchor: undefined,
      },
      undoStack: pushEdit(undoStack, edit),
    };
  }

  // Forward
  if (cursorCol === line.length) {
    return handleDelete(state, undoStack, "forward");
  }
  const boundary = findWordBoundary(line, cursorCol, "right");
  const deleted = line.slice(cursorCol, boundary);
  const newLine = line.slice(0, cursorCol) + line.slice(boundary);
  const newLines = [
    ...lines.slice(0, cursorRow),
    newLine,
    ...lines.slice(cursorRow + 1),
  ];

  const edit: layoutTypes.TextEdit = {
    type: "delete",
    position: { row: cursorRow, col: cursorCol },
    text: deleted,
  };

  return {
    state: {
      lines: newLines,
      cursorRow,
      cursorCol,
      scrollRow: state.scrollRow,
      selectionAnchor: undefined,
    },
    undoStack: pushEdit(undoStack, edit),
  };
};

// ---------------------------------------------------------------------------
// Cursor movement (plain)
// ---------------------------------------------------------------------------

const handleMoveCursor = (
  state: layoutTypes.TextareaState,
  direction: "up" | "down" | "left" | "right",
): layoutTypes.TextareaState => {
  const { cursorRow, cursorCol, lines } = state;

  switch (direction) {
    case "up": {
      if (cursorRow === 0) return { ...state, selectionAnchor: undefined };
      const newRow = cursorRow - 1;
      const newCol = Math.min(cursorCol, lines[newRow]!.length);
      return {
        ...state,
        cursorRow: newRow,
        cursorCol: newCol,
        selectionAnchor: undefined,
      };
    }
    case "down": {
      if (cursorRow === lines.length - 1) {
        return { ...state, selectionAnchor: undefined };
      }
      const newRow = cursorRow + 1;
      const newCol = Math.min(cursorCol, lines[newRow]!.length);
      return {
        ...state,
        cursorRow: newRow,
        cursorCol: newCol,
        selectionAnchor: undefined,
      };
    }
    case "left": {
      if (cursorCol === 0) {
        if (cursorRow === 0) return { ...state, selectionAnchor: undefined };
        return {
          ...state,
          cursorRow: cursorRow - 1,
          cursorCol: lines[cursorRow - 1]!.length,
          selectionAnchor: undefined,
        };
      }
      return { ...state, cursorCol: cursorCol - 1, selectionAnchor: undefined };
    }
    case "right": {
      if (cursorCol === lines[cursorRow]!.length) {
        if (cursorRow === lines.length - 1) {
          return { ...state, selectionAnchor: undefined };
        }
        return {
          ...state,
          cursorRow: cursorRow + 1,
          cursorCol: 0,
          selectionAnchor: undefined,
        };
      }
      return { ...state, cursorCol: cursorCol + 1, selectionAnchor: undefined };
    }
  }
};

const handleMoveCursorWord = (
  state: layoutTypes.TextareaState,
  direction: "left" | "right",
): layoutTypes.TextareaState => {
  const { cursorRow, cursorCol, lines } = state;
  const line = lines[cursorRow]!;

  if (direction === "left") {
    if (cursorCol === 0) {
      if (cursorRow === 0) return { ...state, selectionAnchor: undefined };
      return {
        ...state,
        cursorRow: cursorRow - 1,
        cursorCol: lines[cursorRow - 1]!.length,
        selectionAnchor: undefined,
      };
    }
    const newCol = findWordBoundary(line, cursorCol, "left");
    return { ...state, cursorCol: newCol, selectionAnchor: undefined };
  }

  // right
  if (cursorCol === line.length) {
    if (cursorRow === lines.length - 1) {
      return { ...state, selectionAnchor: undefined };
    }
    return {
      ...state,
      cursorRow: cursorRow + 1,
      cursorCol: 0,
      selectionAnchor: undefined,
    };
  }
  const newCol = findWordBoundary(line, cursorCol, "right");
  return { ...state, cursorCol: newCol, selectionAnchor: undefined };
};

const handleMoveCursorLine = (
  state: layoutTypes.TextareaState,
  direction: "home" | "end",
): layoutTypes.TextareaState => {
  if (direction === "home") {
    return { ...state, cursorCol: 0, selectionAnchor: undefined };
  }
  return {
    ...state,
    cursorCol: state.lines[state.cursorRow]!.length,
    selectionAnchor: undefined,
  };
};

const handleMoveCursorDoc = (
  state: layoutTypes.TextareaState,
  direction: "top" | "bottom",
): layoutTypes.TextareaState => {
  if (direction === "top") {
    return { ...state, cursorRow: 0, cursorCol: 0, selectionAnchor: undefined };
  }
  const lastRow = state.lines.length - 1;
  return {
    ...state,
    cursorRow: lastRow,
    cursorCol: state.lines[lastRow]!.length,
    selectionAnchor: undefined,
  };
};

// ---------------------------------------------------------------------------
// Selection movement
// ---------------------------------------------------------------------------

const ensureAnchor = (
  state: layoutTypes.TextareaState,
): { row: number; col: number } =>
  state.selectionAnchor ?? { row: state.cursorRow, col: state.cursorCol };

const handleSelect = (
  state: layoutTypes.TextareaState,
  direction: "up" | "down" | "left" | "right",
): layoutTypes.TextareaState => {
  const anchor = ensureAnchor(state);
  const moved = handleMoveCursor(
    { ...state, selectionAnchor: undefined },
    direction,
  );
  return { ...moved, selectionAnchor: anchor };
};

const handleSelectWord = (
  state: layoutTypes.TextareaState,
  direction: "left" | "right",
): layoutTypes.TextareaState => {
  const anchor = ensureAnchor(state);
  const moved = handleMoveCursorWord(
    { ...state, selectionAnchor: undefined },
    direction,
  );
  return { ...moved, selectionAnchor: anchor };
};

const handleSelectAll = (
  state: layoutTypes.TextareaState,
): layoutTypes.TextareaState => {
  const lastRow = state.lines.length - 1;
  return {
    ...state,
    selectionAnchor: { row: 0, col: 0 },
    cursorRow: lastRow,
    cursorCol: state.lines[lastRow]!.length,
  };
};

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------

const applyEditForward = (
  state: layoutTypes.TextareaState,
  edit: layoutTypes.TextEdit,
): layoutTypes.TextareaState => {
  switch (edit.type) {
    case "insert": {
      // Re-insert text at position
      const { row, col } = edit.position;
      const line = state.lines[row]!;
      const before = line.slice(0, col);
      const after = line.slice(col);
      const parts = edit.text.split("\n");

      if (parts.length === 1) {
        const newLine = before + edit.text + after;
        const newLines = [
          ...state.lines.slice(0, row),
          newLine,
          ...state.lines.slice(row + 1),
        ];
        return {
          ...state,
          lines: newLines,
          cursorRow: row,
          cursorCol: col + edit.text.length,
          selectionAnchor: undefined,
        };
      }

      const firstLine = before + parts[0]!;
      const lastPart = parts[parts.length - 1]!;
      const lastLine = lastPart + after;
      const middleLines = parts.slice(1, -1);
      const newLines = [
        ...state.lines.slice(0, row),
        firstLine,
        ...middleLines,
        lastLine,
        ...state.lines.slice(row + 1),
      ];
      return {
        ...state,
        lines: newLines,
        cursorRow: row + parts.length - 1,
        cursorCol: lastPart.length,
        selectionAnchor: undefined,
      };
    }
    case "delete": {
      // Re-delete text at position
      const { row, col } = edit.position;
      const delParts = edit.text.split("\n");
      if (delParts.length === 1) {
        const line = state.lines[row]!;
        const newLine = line.slice(0, col) + line.slice(col + edit.text.length);
        const newLines = [
          ...state.lines.slice(0, row),
          newLine,
          ...state.lines.slice(row + 1),
        ];
        return {
          ...state,
          lines: newLines,
          cursorRow: row,
          cursorCol: col,
          selectionAnchor: undefined,
        };
      }
      const endRow = row + delParts.length - 1;
      const endCol = delParts[delParts.length - 1]!.length;
      const before = state.lines[row]!.slice(0, col);
      const after = state.lines[endRow]!.slice(endCol);
      const merged = before + after;
      const newLines = [
        ...state.lines.slice(0, row),
        merged,
        ...state.lines.slice(endRow + 1),
      ];
      return {
        ...state,
        lines: newLines,
        cursorRow: row,
        cursorCol: col,
        selectionAnchor: undefined,
      };
    }
    case "replace": {
      // Apply the replacement
      const { row, col } = edit.position;
      const oldText = edit.replacedText ?? "";
      const oldParts = oldText.split("\n");
      const endRow = row + oldParts.length - 1;
      const endCol = oldParts.length === 1
        ? col + oldText.length
        : oldParts[oldParts.length - 1]!.length;
      const before = state.lines[row]!.slice(0, col);
      const after = state.lines[endRow]!.slice(endCol);
      const newParts = edit.text.split("\n");
      if (newParts.length === 1) {
        const merged = before + edit.text + after;
        const newLines = [
          ...state.lines.slice(0, row),
          merged,
          ...state.lines.slice(endRow + 1),
        ];
        return {
          ...state,
          lines: newLines,
          cursorRow: row,
          cursorCol: col + edit.text.length,
          selectionAnchor: undefined,
        };
      }
      const firstLine = before + newParts[0]!;
      const lastPart = newParts[newParts.length - 1]!;
      const lastLine = lastPart + after;
      const middleLines = newParts.slice(1, -1);
      const newLines = [
        ...state.lines.slice(0, row),
        firstLine,
        ...middleLines,
        lastLine,
        ...state.lines.slice(endRow + 1),
      ];
      return {
        ...state,
        lines: newLines,
        cursorRow: row + newParts.length - 1,
        cursorCol: lastPart.length,
        selectionAnchor: undefined,
      };
    }
  }
};

const applyEditInverse = (
  state: layoutTypes.TextareaState,
  edit: layoutTypes.TextEdit,
): layoutTypes.TextareaState => {
  switch (edit.type) {
    case "insert": {
      // Inverse of insert is delete
      return applyEditForward(state, {
        type: "delete",
        position: edit.position,
        text: edit.text,
      });
    }
    case "delete": {
      // Inverse of delete is insert
      return applyEditForward(state, {
        type: "insert",
        position: edit.position,
        text: edit.text,
      });
    }
    case "replace": {
      // Inverse of replace: swap text and replacedText
      return applyEditForward(state, {
        type: "replace",
        position: edit.position,
        text: edit.replacedText ?? "",
        replacedText: edit.text,
      });
    }
  }
};

const handleUndo = (
  state: layoutTypes.TextareaState,
  undoStack: layoutTypes.UndoStack,
): ReducerResult => {
  if (undoStack.past.length === 0) {
    return { state, undoStack };
  }

  const edit = undoStack.past[undoStack.past.length - 1]!;
  const newState = applyEditInverse(state, edit);

  return {
    state: newState,
    undoStack: {
      past: undoStack.past.slice(0, -1),
      future: [...undoStack.future, edit],
    },
  };
};

const handleRedo = (
  state: layoutTypes.TextareaState,
  undoStack: layoutTypes.UndoStack,
): ReducerResult => {
  if (undoStack.future.length === 0) {
    return { state, undoStack };
  }

  const edit = undoStack.future[undoStack.future.length - 1]!;
  const newState = applyEditForward(state, edit);

  return {
    state: newState,
    undoStack: {
      past: [...undoStack.past, edit],
      future: undoStack.future.slice(0, -1),
    },
  };
};

// ---------------------------------------------------------------------------
// Newline / Tab
// ---------------------------------------------------------------------------

const handleNewline = (
  state: layoutTypes.TextareaState,
  undoStack: layoutTypes.UndoStack,
): ReducerResult => {
  // If there is a selection, delete it first
  let current = state;
  let undo = undoStack;
  if (current.selectionAnchor !== undefined) {
    const sel = deleteSelection(current, undo);
    current = sel.state;
    undo = sel.undoStack;
  }

  const { cursorRow, cursorCol, lines } = current;
  const line = lines[cursorRow]!;
  const before = line.slice(0, cursorCol);
  const after = line.slice(cursorCol);

  const newLines = [
    ...lines.slice(0, cursorRow),
    before,
    after,
    ...lines.slice(cursorRow + 1),
  ];

  const edit: layoutTypes.TextEdit = {
    type: "insert",
    position: { row: cursorRow, col: cursorCol },
    text: "\n",
  };

  return {
    state: {
      lines: newLines,
      cursorRow: cursorRow + 1,
      cursorCol: 0,
      scrollRow: current.scrollRow,
      selectionAnchor: undefined,
    },
    undoStack: pushEdit(undo, edit),
  };
};

const handleTab = (
  state: layoutTypes.TextareaState,
  undoStack: layoutTypes.UndoStack,
): ReducerResult => {
  return handleInsert(state, undoStack, "  ");
};

// ---------------------------------------------------------------------------
// Core reducer
// ---------------------------------------------------------------------------

/**
 * Pure state machine for the textarea.
 * Returns new state and updated undo stack for every action.
 */
export const textareaReducer = (
  state: layoutTypes.TextareaState,
  action: layoutTypes.TextareaAction,
  undoStack: layoutTypes.UndoStack,
): { state: layoutTypes.TextareaState; undoStack: layoutTypes.UndoStack } => {
  const result = ((): ReducerResult => {
    switch (action.type) {
      case "insert":
        return handleInsert(state, undoStack, action.text);
      case "delete":
        return handleDelete(state, undoStack, action.direction);
      case "deleteWord":
        return handleDeleteWord(state, undoStack, action.direction);
      case "moveCursor":
        return { state: handleMoveCursor(state, action.direction), undoStack };
      case "moveCursorWord":
        return {
          state: handleMoveCursorWord(state, action.direction),
          undoStack,
        };
      case "moveCursorLine":
        return {
          state: handleMoveCursorLine(state, action.direction),
          undoStack,
        };
      case "moveCursorDoc":
        return {
          state: handleMoveCursorDoc(state, action.direction),
          undoStack,
        };
      case "select":
        return { state: handleSelect(state, action.direction), undoStack };
      case "selectWord":
        return { state: handleSelectWord(state, action.direction), undoStack };
      case "selectAll":
        return { state: handleSelectAll(state), undoStack };
      case "undo":
        return handleUndo(state, undoStack);
      case "redo":
        return handleRedo(state, undoStack);
      case "newline":
        return handleNewline(state, undoStack);
      case "tab":
        return handleTab(state, undoStack);
    }
  })();

  // Auto-scroll after any action that may have changed cursorRow.
  // Use a reasonable default viewport height; the render function
  // will also handle scrollRow when it knows the panel dimensions.
  const scrolled = autoScroll(result.state, 20);

  return { state: scrolled, undoStack: result.undoStack };
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render the textarea into the given panel as an ANSI string.
 *
 * Handles line numbers, selection highlighting, cursor display,
 * placeholder text, and truncation.
 */
export const renderTextarea = (
  state: layoutTypes.TextareaState,
  props: layoutTypes.TextareaProps,
): string => {
  const { panel, lineNumbers, placeholder } = props;
  const { x, y, width, height } = panel;

  if (width <= 0 || height <= 0) return "";

  const gutterWidth = lineNumbers ? String(state.lines.length).length + 1 : 0;
  const textWidth = width - gutterWidth;
  if (textWidth <= 0) return "";

  // Adjust scrollRow to fit the panel height
  let scrollRow = state.scrollRow;
  if (state.cursorRow < scrollRow) {
    scrollRow = state.cursorRow;
  } else if (state.cursorRow >= scrollRow + height) {
    scrollRow = state.cursorRow - height + 1;
  }
  scrollRow = clamp(scrollRow, 0, Math.max(0, state.lines.length - 1));

  const selRange = getSelectionRange(state);
  const parts: string[] = [];

  // Check if editor is empty and should show placeholder
  const isEmpty = state.lines.length === 1 && state.lines[0] === "";

  for (let vi = 0; vi < height; vi++) {
    const row = scrollRow + vi;
    const screenRow = y + vi + 1; // 1-based for ANSI
    const screenColStart = x + 1; // 1-based for ANSI

    // Gutter
    if (lineNumbers) {
      const gutterCol = screenColStart;
      if (row < state.lines.length) {
        const num = String(row + 1).padStart(gutterWidth - 1, " ");
        parts.push(ansi.moveTo(screenRow, gutterCol) + ansi.dim(num) + " ");
      } else {
        parts.push(
          ansi.moveTo(screenRow, gutterCol) + " ".repeat(gutterWidth),
        );
      }
    }

    const textColStart = screenColStart + gutterWidth;

    if (row >= state.lines.length) {
      // Blank line beyond content
      parts.push(
        ansi.moveTo(screenRow, textColStart) + " ".repeat(textWidth),
      );
      continue;
    }

    // Show placeholder when empty
    if (isEmpty && vi === 0 && placeholder !== undefined) {
      const ph = placeholder.length > textWidth
        ? placeholder.slice(0, textWidth - 1) + "\u2026"
        : placeholder;
      parts.push(
        ansi.moveTo(screenRow, textColStart) +
          ansi.dim(ph) +
          " ".repeat(Math.max(0, textWidth - ph.length)),
      );
      continue;
    }

    const line = state.lines[row]!;
    // Build the visible portion character by character
    let output = "";

    for (let col = 0; col < textWidth; col++) {
      const ch = col < line.length ? line[col]! : " ";
      const isCursor = row === state.cursorRow && col === state.cursorCol;
      const isSelected = selRange !== undefined &&
        isInSelection(row, col, selRange);

      if (isCursor) {
        output += ansi.inverse(ch);
      } else if (isSelected) {
        output += ansi.inverse(ch);
      } else {
        output += ch;
      }
    }

    // If cursor is at end of visible area (at line.length), show it
    // This is already handled above since we iterate up to textWidth

    parts.push(ansi.moveTo(screenRow, textColStart) + output);
  }

  return parts.join("");
};

/** Check whether a (row, col) position falls within a normalized selection range. */
const isInSelection = (
  row: number,
  col: number,
  range: {
    start: { row: number; col: number };
    end: { row: number; col: number };
  },
): boolean => {
  const { start, end } = range;

  if (row < start.row || row > end.row) return false;

  if (row === start.row && row === end.row) {
    return col >= start.col && col < end.col;
  }

  if (row === start.row) return col >= start.col;
  if (row === end.row) return col < end.col;

  return true;
};
