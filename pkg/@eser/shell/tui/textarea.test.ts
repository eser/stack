// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as textarea from "./textarea.ts";
import * as layoutTypes from "./layout-types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const emptyUndo = (): layoutTypes.UndoStack => textarea.createUndoStack();

const stateWith = (
  lines: string[],
  cursorRow: number,
  cursorCol: number,
  extra?: Partial<layoutTypes.TextareaState>,
): layoutTypes.TextareaState => ({
  lines,
  cursorRow,
  cursorCol,
  scrollRow: 0,
  selectionAnchor: undefined,
  ...extra,
});

// ---------------------------------------------------------------------------
// createTextareaState
// ---------------------------------------------------------------------------

describe("createTextareaState", () => {
  it("should create empty state", () => {
    const state = textarea.createTextareaState();
    assertEquals(state.lines, [""]);
    assertEquals(state.cursorRow, 0);
    assertEquals(state.cursorCol, 0);
  });

  it("should split initial text by newlines", () => {
    const state = textarea.createTextareaState("hello\nworld");
    assertEquals(state.lines, ["hello", "world"]);
  });

  it("should handle text with no newlines", () => {
    const state = textarea.createTextareaState("hello");
    assertEquals(state.lines, ["hello"]);
  });
});

// ---------------------------------------------------------------------------
// createUndoStack
// ---------------------------------------------------------------------------

describe("createUndoStack", () => {
  it("should create empty stacks", () => {
    const undo = textarea.createUndoStack();
    assertEquals(undo.past.length, 0);
    assertEquals(undo.future.length, 0);
  });
});

// ---------------------------------------------------------------------------
// textareaReducer
// ---------------------------------------------------------------------------

describe("textareaReducer", () => {
  // -----------------------------------------------------------------------
  // insert
  // -----------------------------------------------------------------------

  describe("insert", () => {
    it("should insert character at cursor", () => {
      const state = stateWith(["hello"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "insert", text: "!" },
        emptyUndo(),
      );
      assertEquals(result.state.lines[0], "hello!");
      assertEquals(result.state.cursorCol, 6);
    });

    it("should insert in middle of line", () => {
      const state = stateWith(["hello"], 0, 2);
      const result = textarea.textareaReducer(
        state,
        { type: "insert", text: "X" },
        emptyUndo(),
      );
      assertEquals(result.state.lines[0], "heXllo");
      assertEquals(result.state.cursorCol, 3);
    });

    it("should push to undo stack on insert", () => {
      const state = stateWith(["hello"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "insert", text: "!" },
        emptyUndo(),
      );
      assertEquals(result.undoStack.past.length, 1);
      assertEquals(result.undoStack.past[0]!.type, "insert");
    });

    it("should clear redo stack on new insert", () => {
      const undo: layoutTypes.UndoStack = {
        past: [],
        future: [{ type: "insert", position: { row: 0, col: 0 }, text: "z" }],
      };
      const state = stateWith(["hello"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "insert", text: "!" },
        undo,
      );
      assertEquals(result.undoStack.future.length, 0);
    });
  });

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------

  describe("delete", () => {
    it("should delete backward", () => {
      const state = stateWith(["hello"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "delete", direction: "backward" },
        emptyUndo(),
      );
      assertEquals(result.state.lines[0], "hell");
      assertEquals(result.state.cursorCol, 4);
    });

    it("should delete forward", () => {
      const state = stateWith(["hello"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "delete", direction: "forward" },
        emptyUndo(),
      );
      assertEquals(result.state.lines[0], "ello");
      assertEquals(result.state.cursorCol, 0);
    });

    it("should merge lines on backward delete at line start", () => {
      const state = stateWith(["hello", "world"], 1, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "delete", direction: "backward" },
        emptyUndo(),
      );
      assertEquals(result.state.lines.length, 1);
      assertEquals(result.state.lines[0], "helloworld");
      assertEquals(result.state.cursorRow, 0);
      assertEquals(result.state.cursorCol, 5);
    });

    it("should merge lines on forward delete at line end", () => {
      const state = stateWith(["hello", "world"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "delete", direction: "forward" },
        emptyUndo(),
      );
      assertEquals(result.state.lines.length, 1);
      assertEquals(result.state.lines[0], "helloworld");
      assertEquals(result.state.cursorRow, 0);
      assertEquals(result.state.cursorCol, 5);
    });

    it("should do nothing on backward at start of document", () => {
      const state = stateWith(["hello"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "delete", direction: "backward" },
        emptyUndo(),
      );
      assertEquals(result.state.lines[0], "hello");
      assertEquals(result.state.cursorCol, 0);
    });

    it("should do nothing on forward at end of document", () => {
      const state = stateWith(["hello"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "delete", direction: "forward" },
        emptyUndo(),
      );
      assertEquals(result.state.lines[0], "hello");
      assertEquals(result.state.cursorCol, 5);
    });
  });

  // -----------------------------------------------------------------------
  // moveCursor
  // -----------------------------------------------------------------------

  describe("moveCursor", () => {
    it("should move right", () => {
      const state = stateWith(["hello"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "right" },
        emptyUndo(),
      );
      assertEquals(result.state.cursorCol, 1);
    });

    it("should move left", () => {
      const state = stateWith(["hello"], 0, 3);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "left" },
        emptyUndo(),
      );
      assertEquals(result.state.cursorCol, 2);
    });

    it("should move down", () => {
      const state = stateWith(["hello", "world"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "down" },
        emptyUndo(),
      );
      assertEquals(result.state.cursorRow, 1);
    });

    it("should move up", () => {
      const state = stateWith(["hello", "world"], 1, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "up" },
        emptyUndo(),
      );
      assertEquals(result.state.cursorRow, 0);
    });

    it("should wrap to previous line end on left at col 0", () => {
      const state = stateWith(["hello", "world"], 1, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "left" },
        emptyUndo(),
      );
      assertEquals(result.state.cursorRow, 0);
      assertEquals(result.state.cursorCol, 5);
    });

    it("should wrap to next line start on right at end of line", () => {
      const state = stateWith(["hello", "world"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "right" },
        emptyUndo(),
      );
      assertEquals(result.state.cursorRow, 1);
      assertEquals(result.state.cursorCol, 0);
    });

    it("should clamp col to line length on vertical move", () => {
      const state = stateWith(["hello world", "hi"], 0, 10);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "down" },
        emptyUndo(),
      );
      assertEquals(result.state.cursorRow, 1);
      assertEquals(result.state.cursorCol, 2);
    });

    it("should not move up past row 0", () => {
      const state = stateWith(["hello"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "up" },
        emptyUndo(),
      );
      assertEquals(result.state.cursorRow, 0);
    });

    it("should not move down past last row", () => {
      const state = stateWith(["hello"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "down" },
        emptyUndo(),
      );
      assertEquals(result.state.cursorRow, 0);
    });

    it("should clear selection on move", () => {
      const state = stateWith(["hello"], 0, 0, {
        selectionAnchor: { row: 0, col: 0 },
      });
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "right" },
        emptyUndo(),
      );
      assertEquals(result.state.selectionAnchor, undefined);
    });
  });

  // -----------------------------------------------------------------------
  // newline
  // -----------------------------------------------------------------------

  describe("newline", () => {
    it("should split line at cursor", () => {
      const state = stateWith(["hello"], 0, 2);
      const result = textarea.textareaReducer(
        state,
        { type: "newline" },
        emptyUndo(),
      );
      assertEquals(result.state.lines[0], "he");
      assertEquals(result.state.lines[1], "llo");
    });

    it("should create empty line when at end", () => {
      const state = stateWith(["hello"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "newline" },
        emptyUndo(),
      );
      assertEquals(result.state.lines[0], "hello");
      assertEquals(result.state.lines[1], "");
    });

    it("should move cursor to start of new line", () => {
      const state = stateWith(["hello"], 0, 3);
      const result = textarea.textareaReducer(
        state,
        { type: "newline" },
        emptyUndo(),
      );
      assertEquals(result.state.cursorRow, 1);
      assertEquals(result.state.cursorCol, 0);
    });
  });

  // -----------------------------------------------------------------------
  // undo/redo
  // -----------------------------------------------------------------------

  describe("undo/redo", () => {
    it("should undo last insert", () => {
      const state = stateWith(["hello"], 0, 5);
      const inserted = textarea.textareaReducer(
        state,
        { type: "insert", text: "x" },
        emptyUndo(),
      );
      const undone = textarea.textareaReducer(
        inserted.state,
        { type: "undo" },
        inserted.undoStack,
      );
      assertEquals(undone.state.lines[0], "hello");
    });

    it("should redo after undo", () => {
      const state = stateWith(["hello"], 0, 5);
      const inserted = textarea.textareaReducer(
        state,
        { type: "insert", text: "x" },
        emptyUndo(),
      );
      const undone = textarea.textareaReducer(
        inserted.state,
        { type: "undo" },
        inserted.undoStack,
      );
      const redone = textarea.textareaReducer(
        undone.state,
        { type: "redo" },
        undone.undoStack,
      );
      assertEquals(redone.state.lines[0], "hellox");
    });

    it("should clear redo on new edit after undo", () => {
      const state = stateWith(["hello"], 0, 5);
      const inserted = textarea.textareaReducer(
        state,
        { type: "insert", text: "x" },
        emptyUndo(),
      );
      const undone = textarea.textareaReducer(
        inserted.state,
        { type: "undo" },
        inserted.undoStack,
      );
      const newEdit = textarea.textareaReducer(
        undone.state,
        { type: "insert", text: "y" },
        undone.undoStack,
      );
      assertEquals(newEdit.undoStack.future.length, 0);
    });

    it("should do nothing when undo stack is empty", () => {
      const state = stateWith(["hello"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "undo" },
        emptyUndo(),
      );
      assertEquals(result.state.lines[0], "hello");
      assertEquals(result.undoStack.past.length, 0);
    });
  });

  // -----------------------------------------------------------------------
  // tab
  // -----------------------------------------------------------------------

  describe("tab", () => {
    it("should insert spaces", () => {
      const state = stateWith(["hello"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "tab" },
        emptyUndo(),
      );
      assertEquals(result.state.lines[0], "  hello");
      assertEquals(result.state.cursorCol, 2);
    });
  });

  // -----------------------------------------------------------------------
  // moveCursorWord
  // -----------------------------------------------------------------------

  describe("moveCursorWord", () => {
    it("should jump to next word boundary right", () => {
      const state = stateWith(["hello world"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursorWord", direction: "right" },
        emptyUndo(),
      );
      // findWordBoundary skips word chars then non-word chars, so from 0 it goes to 6
      assertEquals(result.state.cursorCol, 6);
    });

    it("should jump to previous word boundary left", () => {
      const state = stateWith(["hello world"], 0, 11);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursorWord", direction: "left" },
        emptyUndo(),
      );
      assertEquals(result.state.cursorCol, 6);
    });
  });

  // -----------------------------------------------------------------------
  // moveCursorLine
  // -----------------------------------------------------------------------

  describe("moveCursorLine", () => {
    it("should move to start of line on home", () => {
      const state = stateWith(["hello"], 0, 3);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursorLine", direction: "home" },
        emptyUndo(),
      );
      assertEquals(result.state.cursorCol, 0);
    });

    it("should move to end of line on end", () => {
      const state = stateWith(["hello"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursorLine", direction: "end" },
        emptyUndo(),
      );
      assertEquals(result.state.cursorCol, 5);
    });
  });

  // -----------------------------------------------------------------------
  // moveCursorDoc
  // -----------------------------------------------------------------------

  describe("moveCursorDoc", () => {
    it("should move to start of document on top", () => {
      const state = stateWith(["hello", "world", "foo"], 2, 3);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursorDoc", direction: "top" },
        emptyUndo(),
      );
      assertEquals(result.state.cursorRow, 0);
      assertEquals(result.state.cursorCol, 0);
    });

    it("should move to end of document on bottom", () => {
      const state = stateWith(["hello", "world", "foo"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursorDoc", direction: "bottom" },
        emptyUndo(),
      );
      assertEquals(result.state.cursorRow, 2);
      assertEquals(result.state.cursorCol, 3);
    });
  });
});

// ---------------------------------------------------------------------------
// selection
// ---------------------------------------------------------------------------

describe("selection", () => {
  describe("select actions", () => {
    it("should set anchor on first select", () => {
      const state = stateWith(["hello"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "select", direction: "right" },
        emptyUndo(),
      );
      assertEquals(result.state.selectionAnchor, { row: 0, col: 0 });
      assertEquals(result.state.cursorCol, 1);
    });

    it("should extend selection on continued select", () => {
      const state = stateWith(["hello"], 0, 1, {
        selectionAnchor: { row: 0, col: 0 },
      });
      const result = textarea.textareaReducer(
        state,
        { type: "select", direction: "right" },
        emptyUndo(),
      );
      assertEquals(result.state.selectionAnchor, { row: 0, col: 0 });
      assertEquals(result.state.cursorCol, 2);
    });
  });

  describe("selectAll", () => {
    it("should select entire document", () => {
      const state = stateWith(["hello", "world"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "selectAll" },
        emptyUndo(),
      );
      assertEquals(result.state.selectionAnchor, { row: 0, col: 0 });
      assertEquals(result.state.cursorRow, 1);
      assertEquals(result.state.cursorCol, 5);
    });
  });

  describe("getSelectedText", () => {
    it("should return empty for no selection", () => {
      const state = stateWith(["hello"], 0, 0);
      assertEquals(textarea.getSelectedText(state), "");
    });

    it("should return selected text within one line", () => {
      const state = stateWith(["hello"], 0, 3, {
        selectionAnchor: { row: 0, col: 0 },
      });
      assertEquals(textarea.getSelectedText(state), "hel");
    });

    it("should return multi-line selection", () => {
      const state = stateWith(["hello", "world"], 1, 3, {
        selectionAnchor: { row: 0, col: 2 },
      });
      assertEquals(textarea.getSelectedText(state), "llo\nwor");
    });
  });

  describe("getSelectionRange", () => {
    it("should return undefined for no selection", () => {
      const state = stateWith(["hello"], 0, 0);
      assertEquals(textarea.getSelectionRange(state), undefined);
    });

    it("should normalize start and end", () => {
      // Anchor is after cursor — should still return start < end
      const state = stateWith(["hello"], 0, 1, {
        selectionAnchor: { row: 0, col: 4 },
      });
      const range = textarea.getSelectionRange(state);
      assertEquals(range!.start, { row: 0, col: 1 });
      assertEquals(range!.end, { row: 0, col: 4 });
    });
  });
});

// ---------------------------------------------------------------------------
// findWordBoundary
// ---------------------------------------------------------------------------

describe("findWordBoundary", () => {
  it("should find right boundary", () => {
    // From col 0 in "hello world": skip word chars "hello" (to 5), then space (to 6)
    assertEquals(textarea.findWordBoundary("hello world", 0, "right"), 6);
  });

  it("should find left boundary", () => {
    // From col 11 in "hello world": skip word chars "world" backwards to 6
    assertEquals(textarea.findWordBoundary("hello world", 11, "left"), 6);
  });

  it("should handle punctuation", () => {
    // "foo.bar" at col 0 going right: skip word "foo" (to 3), skip "." (to 4)
    assertEquals(textarea.findWordBoundary("foo.bar", 0, "right"), 4);
  });

  it("should handle start/end of string", () => {
    assertEquals(textarea.findWordBoundary("hello", 0, "left"), 0);
    assertEquals(textarea.findWordBoundary("hello", 5, "right"), 5);
  });
});

// ---------------------------------------------------------------------------
// renderTextarea
// ---------------------------------------------------------------------------

describe("renderTextarea", () => {
  const panel: layoutTypes.ComputedPanel = {
    x: 0,
    y: 0,
    width: 40,
    height: 10,
  };

  it("should render lines within panel", () => {
    const state = textarea.createTextareaState("hello\nworld");
    const output = textarea.renderTextarea(state, { panel });
    // Cursor is at 0,0 so "h" is ANSI-wrapped; check for the rest of the text
    assertEquals(output.includes("ello"), true);
    assertEquals(output.includes("world"), true);
  });

  it("should show placeholder when empty", () => {
    const state = textarea.createTextareaState();
    const output = textarea.renderTextarea(state, {
      panel,
      placeholder: "Type here...",
    });
    assertEquals(output.includes("Type here..."), true);
  });

  it("should contain ANSI sequences", () => {
    const state = textarea.createTextareaState("hello");
    const output = textarea.renderTextarea(state, { panel });
    // Must contain escape sequences for cursor positioning
    assertEquals(output.includes("\x1b["), true);
  });
});
