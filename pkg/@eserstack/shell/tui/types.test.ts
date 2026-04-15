// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as types from "./types.ts";
import * as symbols from "./symbols.ts";
import * as keypress from "./keypress.ts";

// =============================================================================
// Helper
// =============================================================================

const streamFromBytes = (
  ...chunks: Uint8Array[]
): ReadableStream<Uint8Array> => {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
};

const collectKeypress = async (
  stream: ReadableStream<Uint8Array>,
): Promise<keypress.KeypressEvent[]> => {
  const events: keypress.KeypressEvent[] = [];
  for await (const event of keypress.readKeypress(stream)) {
    events.push(event);
  }
  return events;
};

// =============================================================================
// types.ts — CANCEL and isCancel
// =============================================================================

Deno.test("CANCEL is a unique symbol", () => {
  assert.assertStrictEquals(typeof types.CANCEL, "symbol");
  assert.assertNotStrictEquals(types.CANCEL, Symbol("tui.cancel"));
});

Deno.test("isCancel(CANCEL) returns true", () => {
  assert.assertStrictEquals(types.isCancel(types.CANCEL), true);
});

Deno.test('isCancel("string") returns false', () => {
  assert.assertStrictEquals(types.isCancel("string"), false);
});

Deno.test("isCancel(null) returns false", () => {
  assert.assertStrictEquals(types.isCancel(null), false);
});

Deno.test("isCancel(undefined) returns false", () => {
  assert.assertStrictEquals(types.isCancel(undefined), false);
});

Deno.test("isCancel(Symbol()) returns false for a different symbol", () => {
  assert.assertStrictEquals(types.isCancel(Symbol()), false);
  assert.assertStrictEquals(types.isCancel(Symbol("tui.cancel")), false);
});

// =============================================================================
// types.ts — createTuiContext
// =============================================================================

Deno.test("createTuiContext() returns an object with output and input", () => {
  const ctx = types.createTuiContext();
  assert.assertExists(ctx.output);
  assert.assertExists(ctx.input);
  assert.assertStrictEquals(ctx.input instanceof ReadableStream, true);
});

// =============================================================================
// types.ts — createTestContext
// =============================================================================

Deno.test("createTestContext() returns ctx, getOutput, pushInput, pushKey", () => {
  const result = types.createTestContext();
  assert.assertExists(result.ctx);
  assert.assertStrictEquals(typeof result.getOutput, "function");
  assert.assertStrictEquals(typeof result.pushInput, "function");
  assert.assertStrictEquals(typeof result.pushKey, "function");
});

Deno.test("createTestContext().getOutput() returns empty string initially", () => {
  const { getOutput } = types.createTestContext();
  assert.assertStrictEquals(getOutput(), "");
});

Deno.test('createTestContext().pushKey("enter") does not throw', () => {
  const { pushKey } = types.createTestContext();
  // If pushKey throws, the test will fail automatically
  pushKey("enter");
});

// =============================================================================
// symbols.ts — All exports are non-empty strings
// =============================================================================

Deno.test("all exported symbols are non-empty strings", () => {
  const exportedSymbols: Record<string, string> = {
    BAR: symbols.BAR,
    BAR_START: symbols.BAR_START,
    BAR_END: symbols.BAR_END,
    BAR_H: symbols.BAR_H,
    RADIO_ACTIVE: symbols.RADIO_ACTIVE,
    RADIO_INACTIVE: symbols.RADIO_INACTIVE,
    CHECKBOX_ACTIVE: symbols.CHECKBOX_ACTIVE,
    CHECKBOX_INACTIVE: symbols.CHECKBOX_INACTIVE,
    PROMPT_ACTIVE: symbols.PROMPT_ACTIVE,
    PROMPT_DONE: symbols.PROMPT_DONE,
    PROMPT_CANCEL: symbols.PROMPT_CANCEL,
    S_INFO: symbols.S_INFO,
    S_SUCCESS: symbols.S_SUCCESS,
    S_WARN: symbols.S_WARN,
    S_ERROR: symbols.S_ERROR,
    S_STEP: symbols.S_STEP,
  };

  for (const [name, value] of Object.entries(exportedSymbols)) {
    assert.assertStrictEquals(
      typeof value,
      "string",
      `${name} should be a string`,
    );
    assert.assert(value.length > 0, `${name} should be non-empty`);
  }
});

Deno.test("key symbols exist with expected names", () => {
  assert.assertStrictEquals(symbols.BAR, "\u2502");
  assert.assertStrictEquals(symbols.BAR_START, "\u250c");
  assert.assertStrictEquals(symbols.BAR_END, "\u2514");
  assert.assertStrictEquals(symbols.RADIO_ACTIVE, "\u25cf");
  assert.assertStrictEquals(symbols.RADIO_INACTIVE, "\u25cb");
  assert.assertStrictEquals(symbols.CHECKBOX_ACTIVE, "\u25fc");
  assert.assertStrictEquals(symbols.CHECKBOX_INACTIVE, "\u25fb");
  assert.assertStrictEquals(symbols.PROMPT_ACTIVE, "\u25c6");
  assert.assertStrictEquals(symbols.PROMPT_DONE, "\u25c7");
  assert.assertStrictEquals(symbols.PROMPT_CANCEL, "\u25a0");
});

// =============================================================================
// keypress.ts — readKeypress + parseBytes
// =============================================================================

Deno.test("keypress: Enter (0x0d) yields name 'return'", async () => {
  const stream = streamFromBytes(new Uint8Array([0x0d]));
  const events = await collectKeypress(stream);
  assert.assertStrictEquals(events.length, 1);
  assert.assertStrictEquals(events[0]!.name, "return");
  assert.assertStrictEquals(events[0]!.ctrl, false);
});

Deno.test("keypress: Escape (0x1b) yields name 'escape'", async () => {
  const stream = streamFromBytes(new Uint8Array([0x1b]));
  const events = await collectKeypress(stream);
  assert.assertStrictEquals(events.length, 1);
  assert.assertStrictEquals(events[0]!.name, "escape");
  assert.assertStrictEquals(events[0]!.ctrl, false);
});

Deno.test("keypress: Ctrl+C (0x03) yields name 'c' with ctrl true", async () => {
  const stream = streamFromBytes(new Uint8Array([0x03]));
  const events = await collectKeypress(stream);
  assert.assertStrictEquals(events.length, 1);
  assert.assertStrictEquals(events[0]!.name, "c");
  assert.assertStrictEquals(events[0]!.ctrl, true);
});

Deno.test("keypress: Backspace (0x7f) yields name 'backspace'", async () => {
  const stream = streamFromBytes(new Uint8Array([0x7f]));
  const events = await collectKeypress(stream);
  assert.assertStrictEquals(events.length, 1);
  assert.assertStrictEquals(events[0]!.name, "backspace");
  assert.assertStrictEquals(events[0]!.ctrl, false);
});

Deno.test("keypress: Up arrow (ESC [ A) yields name 'up'", async () => {
  const stream = streamFromBytes(new Uint8Array([0x1b, 0x5b, 0x41]));
  const events = await collectKeypress(stream);
  assert.assertStrictEquals(events.length, 1);
  assert.assertStrictEquals(events[0]!.name, "up");
  assert.assertStrictEquals(events[0]!.ctrl, false);
});

Deno.test("keypress: Down arrow (ESC [ B) yields name 'down'", async () => {
  const stream = streamFromBytes(new Uint8Array([0x1b, 0x5b, 0x42]));
  const events = await collectKeypress(stream);
  assert.assertStrictEquals(events.length, 1);
  assert.assertStrictEquals(events[0]!.name, "down");
  assert.assertStrictEquals(events[0]!.ctrl, false);
});

Deno.test("keypress: Left arrow (ESC [ D) yields name 'left'", async () => {
  const stream = streamFromBytes(new Uint8Array([0x1b, 0x5b, 0x44]));
  const events = await collectKeypress(stream);
  assert.assertStrictEquals(events.length, 1);
  assert.assertStrictEquals(events[0]!.name, "left");
  assert.assertStrictEquals(events[0]!.ctrl, false);
});

Deno.test("keypress: Right arrow (ESC [ C) yields name 'right'", async () => {
  const stream = streamFromBytes(new Uint8Array([0x1b, 0x5b, 0x43]));
  const events = await collectKeypress(stream);
  assert.assertStrictEquals(events.length, 1);
  assert.assertStrictEquals(events[0]!.name, "right");
  assert.assertStrictEquals(events[0]!.ctrl, false);
});

Deno.test("keypress: Space (0x20) yields name 'space' with char ' '", async () => {
  const stream = streamFromBytes(new Uint8Array([0x20]));
  const events = await collectKeypress(stream);
  assert.assertStrictEquals(events.length, 1);
  assert.assertStrictEquals(events[0]!.name, "space");
  assert.assertStrictEquals(events[0]!.char, " ");
  assert.assertStrictEquals(events[0]!.ctrl, false);
});

Deno.test("keypress: Printable 'a' (0x61) yields name 'a' with char 'a'", async () => {
  const stream = streamFromBytes(new Uint8Array([0x61]));
  const events = await collectKeypress(stream);
  assert.assertStrictEquals(events.length, 1);
  assert.assertStrictEquals(events[0]!.name, "a");
  assert.assertStrictEquals(events[0]!.char, "a");
  assert.assertStrictEquals(events[0]!.ctrl, false);
});

Deno.test("keypress: Tab (0x09) yields name 'tab'", async () => {
  const stream = streamFromBytes(new Uint8Array([0x09]));
  const events = await collectKeypress(stream);
  assert.assertStrictEquals(events.length, 1);
  assert.assertStrictEquals(events[0]!.name, "tab");
  assert.assertStrictEquals(events[0]!.ctrl, false);
});

Deno.test("keypress: multiple chunks yield multiple events", async () => {
  const stream = streamFromBytes(
    new Uint8Array([0x61]),
    new Uint8Array([0x62]),
    new Uint8Array([0x0d]),
  );
  const events = await collectKeypress(stream);
  assert.assertStrictEquals(events.length, 3);
  assert.assertStrictEquals(events[0]!.name, "a");
  assert.assertStrictEquals(events[1]!.name, "b");
  assert.assertStrictEquals(events[2]!.name, "return");
});

Deno.test("keypress: all events have meta and shift fields", async () => {
  const stream = streamFromBytes(
    new Uint8Array([0x61]),
    new Uint8Array([0x1b, 0x5b, 0x41]),
    new Uint8Array([0x03]),
  );
  const events = await collectKeypress(stream);
  for (const event of events) {
    assert.assertStrictEquals(typeof event.meta, "boolean");
    assert.assertStrictEquals(typeof event.shift, "boolean");
    assert.assertStrictEquals(event.meta, false);
    assert.assertStrictEquals(event.shift, false);
  }
});
