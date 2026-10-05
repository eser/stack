// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as textarea from "./textarea.ts";
import type * as layoutTypes from "./layout-types.ts";

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

bdd.describe("createTextareaState", () => {
  bdd.it("should create empty state", () => {
    const state = textarea.createTextareaState();
    assert.assertEquals(state.lines, [""]);
    assert.assertEquals(state.cursorRow, 0);
    assert.assertEquals(state.cursorCol, 0);
  });

  bdd.it("should split initial text by newlines", () => {
    const state = textarea.createTextareaState("hello\nworld");
    assert.assertEquals(state.lines, ["hello", "world"]);
  });

  bdd.it("should handle text with no newlines", () => {
    const state = textarea.createTextareaState("hello");
    assert.assertEquals(state.lines, ["hello"]);
  });
});

// ---------------------------------------------------------------------------
// createUndoStack
// ---------------------------------------------------------------------------

bdd.describe("createUndoStack", () => {
  bdd.it("should create empty stacks", () => {
    const undo = textarea.createUndoStack();
    assert.assertEquals(undo.past.length, 0);
    assert.assertEquals(undo.future.length, 0);
  });
});

// ---------------------------------------------------------------------------
// textareaReducer
// ---------------------------------------------------------------------------

bdd.describe("textareaReducer", () => {
  // -----------------------------------------------------------------------
  // insert
  // -----------------------------------------------------------------------

  bdd.describe("insert", () => {
    bdd.it("should insert character at cursor", () => {
      const state = stateWith(["hello"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "insert", text: "!" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.lines[0], "hello!");
      assert.assertEquals(result.state.cursorCol, 6);
    });

    bdd.it("should insert in middle of line", () => {
      const state = stateWith(["hello"], 0, 2);
      const result = textarea.textareaReducer(
        state,
        { type: "insert", text: "X" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.lines[0], "heXllo");
      assert.assertEquals(result.state.cursorCol, 3);
    });

    bdd.it("should push to undo stack on insert", () => {
      const state = stateWith(["hello"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "insert", text: "!" },
        emptyUndo(),
      );
      assert.assertEquals(result.undoStack.past.length, 1);
      assert.assertEquals(result.undoStack.past[0]!.type, "insert");
    });

    bdd.it("should clear redo stack on new insert", () => {
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
      assert.assertEquals(result.undoStack.future.length, 0);
    });
  });

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------

  bdd.describe("delete", () => {
    bdd.it("should delete backward", () => {
      const state = stateWith(["hello"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "delete", direction: "backward" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.lines[0], "hell");
      assert.assertEquals(result.state.cursorCol, 4);
    });

    bdd.it("should delete forward", () => {
      const state = stateWith(["hello"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "delete", direction: "forward" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.lines[0], "ello");
      assert.assertEquals(result.state.cursorCol, 0);
    });

    bdd.it("should merge lines on backward delete at line start", () => {
      const state = stateWith(["hello", "world"], 1, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "delete", direction: "backward" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.lines.length, 1);
      assert.assertEquals(result.state.lines[0], "helloworld");
      assert.assertEquals(result.state.cursorRow, 0);
      assert.assertEquals(result.state.cursorCol, 5);
    });

    bdd.it("should merge lines on forward delete at line end", () => {
      const state = stateWith(["hello", "world"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "delete", direction: "forward" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.lines.length, 1);
      assert.assertEquals(result.state.lines[0], "helloworld");
      assert.assertEquals(result.state.cursorRow, 0);
      assert.assertEquals(result.state.cursorCol, 5);
    });

    bdd.it("should do nothing on backward at start of document", () => {
      const state = stateWith(["hello"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "delete", direction: "backward" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.lines[0], "hello");
      assert.assertEquals(result.state.cursorCol, 0);
    });

    bdd.it("should do nothing on forward at end of document", () => {
      const state = stateWith(["hello"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "delete", direction: "forward" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.lines[0], "hello");
      assert.assertEquals(result.state.cursorCol, 5);
    });
  });

  // -----------------------------------------------------------------------
  // moveCursor
  // -----------------------------------------------------------------------

  bdd.describe("moveCursor", () => {
    bdd.it("should move right", () => {
      const state = stateWith(["hello"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "right" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.cursorCol, 1);
    });

    bdd.it("should move left", () => {
      const state = stateWith(["hello"], 0, 3);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "left" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.cursorCol, 2);
    });

    bdd.it("should move down", () => {
      const state = stateWith(["hello", "world"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "down" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.cursorRow, 1);
    });

    bdd.it("should move up", () => {
      const state = stateWith(["hello", "world"], 1, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "up" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.cursorRow, 0);
    });

    bdd.it("should wrap to previous line end on left at col 0", () => {
      const state = stateWith(["hello", "world"], 1, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "left" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.cursorRow, 0);
      assert.assertEquals(result.state.cursorCol, 5);
    });

    bdd.it("should wrap to next line start on right at end of line", () => {
      const state = stateWith(["hello", "world"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "right" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.cursorRow, 1);
      assert.assertEquals(result.state.cursorCol, 0);
    });

    bdd.it("should clamp col to line length on vertical move", () => {
      const state = stateWith(["hello world", "hi"], 0, 10);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "down" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.cursorRow, 1);
      assert.assertEquals(result.state.cursorCol, 2);
    });

    bdd.it("should not move up past row 0", () => {
      const state = stateWith(["hello"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "up" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.cursorRow, 0);
    });

    bdd.it("should not move down past last row", () => {
      const state = stateWith(["hello"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "down" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.cursorRow, 0);
    });

    bdd.it("should clear selection on move", () => {
      const state = stateWith(["hello"], 0, 0, {
        selectionAnchor: { row: 0, col: 0 },
      });
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursor", direction: "right" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.selectionAnchor, undefined);
    });
  });

  // -----------------------------------------------------------------------
  // newline
  // -----------------------------------------------------------------------

  bdd.describe("newline", () => {
    bdd.it("should split line at cursor", () => {
      const state = stateWith(["hello"], 0, 2);
      const result = textarea.textareaReducer(
        state,
        { type: "newline" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.lines[0], "he");
      assert.assertEquals(result.state.lines[1], "llo");
    });

    bdd.it("should create empty line when at end", () => {
      const state = stateWith(["hello"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "newline" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.lines[0], "hello");
      assert.assertEquals(result.state.lines[1], "");
    });

    bdd.it("should move cursor to start of new line", () => {
      const state = stateWith(["hello"], 0, 3);
      const result = textarea.textareaReducer(
        state,
        { type: "newline" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.cursorRow, 1);
      assert.assertEquals(result.state.cursorCol, 0);
    });
  });

  // -----------------------------------------------------------------------
  // undo/redo
  // -----------------------------------------------------------------------

  bdd.describe("undo/redo", () => {
    bdd.it("should undo last insert", () => {
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
      assert.assertEquals(undone.state.lines[0], "hello");
    });

    bdd.it("should redo after undo", () => {
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
      assert.assertEquals(redone.state.lines[0], "hellox");
    });

    bdd.it("should clear redo on new edit after undo", () => {
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
      assert.assertEquals(newEdit.undoStack.future.length, 0);
    });

    bdd.it("should do nothing when undo stack is empty", () => {
      const state = stateWith(["hello"], 0, 5);
      const result = textarea.textareaReducer(
        state,
        { type: "undo" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.lines[0], "hello");
      assert.assertEquals(result.undoStack.past.length, 0);
    });
  });

  // -----------------------------------------------------------------------
  // tab
  // -----------------------------------------------------------------------

  bdd.describe("tab", () => {
    bdd.it("should insert spaces", () => {
      const state = stateWith(["hello"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "tab" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.lines[0], "  hello");
      assert.assertEquals(result.state.cursorCol, 2);
    });
  });

  // -----------------------------------------------------------------------
  // moveCursorWord
  // -----------------------------------------------------------------------

  bdd.describe("moveCursorWord", () => {
    bdd.it("should jump to next word boundary right", () => {
      const state = stateWith(["hello world"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursorWord", direction: "right" },
        emptyUndo(),
      );
      // findWordBoundary skips word chars then non-word chars, so from 0 it goes to 6
      assert.assertEquals(result.state.cursorCol, 6);
    });

    bdd.it("should jump to previous word boundary left", () => {
      const state = stateWith(["hello world"], 0, 11);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursorWord", direction: "left" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.cursorCol, 6);
    });
  });

  // -----------------------------------------------------------------------
  // moveCursorLine
  // -----------------------------------------------------------------------

  bdd.describe("moveCursorLine", () => {
    bdd.it("should move to start of line on home", () => {
      const state = stateWith(["hello"], 0, 3);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursorLine", direction: "home" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.cursorCol, 0);
    });

    bdd.it("should move to end of line on end", () => {
      const state = stateWith(["hello"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursorLine", direction: "end" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.cursorCol, 5);
    });
  });

  // -----------------------------------------------------------------------
  // moveCursorDoc
  // -----------------------------------------------------------------------

  bdd.describe("moveCursorDoc", () => {
    bdd.it("should move to start of document on top", () => {
      const state = stateWith(["hello", "world", "foo"], 2, 3);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursorDoc", direction: "top" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.cursorRow, 0);
      assert.assertEquals(result.state.cursorCol, 0);
    });

    bdd.it("should move to end of document on bottom", () => {
      const state = stateWith(["hello", "world", "foo"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "moveCursorDoc", direction: "bottom" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.cursorRow, 2);
      assert.assertEquals(result.state.cursorCol, 3);
    });
  });
});

// ---------------------------------------------------------------------------
// selection
// ---------------------------------------------------------------------------

bdd.describe("selection", () => {
  bdd.describe("select actions", () => {
    bdd.it("should set anchor on first select", () => {
      const state = stateWith(["hello"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "select", direction: "right" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.selectionAnchor, { row: 0, col: 0 });
      assert.assertEquals(result.state.cursorCol, 1);
    });

    bdd.it("should extend selection on continued select", () => {
      const state = stateWith(["hello"], 0, 1, {
        selectionAnchor: { row: 0, col: 0 },
      });
      const result = textarea.textareaReducer(
        state,
        { type: "select", direction: "right" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.selectionAnchor, { row: 0, col: 0 });
      assert.assertEquals(result.state.cursorCol, 2);
    });
  });

  bdd.describe("selectAll", () => {
    bdd.it("should select entire document", () => {
      const state = stateWith(["hello", "world"], 0, 0);
      const result = textarea.textareaReducer(
        state,
        { type: "selectAll" },
        emptyUndo(),
      );
      assert.assertEquals(result.state.selectionAnchor, { row: 0, col: 0 });
      assert.assertEquals(result.state.cursorRow, 1);
      assert.assertEquals(result.state.cursorCol, 5);
    });
  });

  bdd.describe("getSelectedText", () => {
    bdd.it("should return empty for no selection", () => {
      const state = stateWith(["hello"], 0, 0);
      assert.assertEquals(textarea.getSelectedText(state), "");
    });

    bdd.it("should return selected text within one line", () => {
      const state = stateWith(["hello"], 0, 3, {
        selectionAnchor: { row: 0, col: 0 },
      });
      assert.assertEquals(textarea.getSelectedText(state), "hel");
    });

    bdd.it("should return multi-line selection", () => {
      const state = stateWith(["hello", "world"], 1, 3, {
        selectionAnchor: { row: 0, col: 2 },
      });
      assert.assertEquals(textarea.getSelectedText(state), "llo\nwor");
    });
  });

  bdd.describe("getSelectionRange", () => {
    bdd.it("should return undefined for no selection", () => {
      const state = stateWith(["hello"], 0, 0);
      assert.assertEquals(textarea.getSelectionRange(state), undefined);
    });

    bdd.it("should normalize start and end", () => {
      // Anchor is after cursor — should still return start < end
      const state = stateWith(["hello"], 0, 1, {
        selectionAnchor: { row: 0, col: 4 },
      });
      const range = textarea.getSelectionRange(state);
      assert.assertEquals(range!.start, { row: 0, col: 1 });
      assert.assertEquals(range!.end, { row: 0, col: 4 });
    });
  });
});

// ---------------------------------------------------------------------------
// findWordBoundary
// ---------------------------------------------------------------------------

bdd.describe("findWordBoundary", () => {
  bdd.it("should find right boundary", () => {
    // From col 0 in "hello world": skip word chars "hello" (to 5), then space (to 6)
    assert.assertEquals(
      textarea.findWordBoundary("hello world", 0, "right"),
      6,
    );
  });

  bdd.it("should find left boundary", () => {
    // From col 11 in "hello world": skip word chars "world" backwards to 6
    assert.assertEquals(
      textarea.findWordBoundary("hello world", 11, "left"),
      6,
    );
  });

  bdd.it("should handle punctuation", () => {
    // "foo.bar" at col 0 going right: skip word "foo" (to 3), skip "." (to 4)
    assert.assertEquals(textarea.findWordBoundary("foo.bar", 0, "right"), 4);
  });

  bdd.it("should handle start/end of string", () => {
    assert.assertEquals(textarea.findWordBoundary("hello", 0, "left"), 0);
    assert.assertEquals(textarea.findWordBoundary("hello", 5, "right"), 5);
  });
});

// ---------------------------------------------------------------------------
// renderTextarea
// ---------------------------------------------------------------------------

bdd.describe("renderTextarea", () => {
  const panel: layoutTypes.ComputedPanel = {
    x: 0,
    y: 0,
    width: 40,
    height: 10,
  };

  bdd.it("should render lines within panel", () => {
    const state = textarea.createTextareaState("hello\nworld");
    const output = textarea.renderTextarea(state, { panel });
    // Cursor is at 0,0 so "h" is ANSI-wrapped; check for the rest of the text
    assert.assertEquals(output.includes("ello"), true);
    assert.assertEquals(output.includes("world"), true);
  });

  bdd.it("should show placeholder when empty", () => {
    const state = textarea.createTextareaState();
    const output = textarea.renderTextarea(state, {
      panel,
      placeholder: "Type here...",
    });
    assert.assertEquals(output.includes("Type here..."), true);
  });

  bdd.it("should contain ANSI sequences", () => {
    const state = textarea.createTextareaState("hello");
    const output = textarea.renderTextarea(state, { panel });
    // Must contain escape sequences for cursor positioning
    assert.assertEquals(output.includes("\x1b["), true);
  });
});
