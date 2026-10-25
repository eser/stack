// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as frames from "./websocket-frames.ts";

const encoder = new TextEncoder();
const MASK = [0x12, 0x34, 0x56, 0x78] as const;

type ClientFrameOptions = {
  readonly fin?: boolean;
  readonly masked?: boolean;
  readonly reservedBits?: number;
};

/** Encodes a frame the way a client sends it: masked unless told otherwise. */
const clientFrame = (
  opcode: number,
  payload: Uint8Array,
  options: ClientFrameOptions = {},
): Uint8Array => {
  const fin = options.fin ?? true;
  const masked = options.masked ?? true;
  const length = payload.byteLength;

  let lengthBytes: number[] = [length];
  if (length >= 0x10000) {
    lengthBytes = [127, 0, 0, 0, 0, ...toBytes(length, 4)];
  } else if (length >= 126) {
    lengthBytes = [126, ...toBytes(length, 2)];
  }

  const head = [
    (fin ? 0x80 : 0) | (options.reservedBits ?? 0) | opcode,
    (masked ? 0x80 : 0) | lengthBytes[0]!,
    ...lengthBytes.slice(1),
    ...(masked ? MASK : []),
  ];
  const body = masked ? payload.map((byte, i) => byte ^ MASK[i % 4]!) : payload;

  const frame = new Uint8Array(head.length + body.byteLength);
  frame.set(head, 0);
  frame.set(body, head.length);

  return frame;
};

const toBytes = (value: number, count: number): number[] =>
  Array.from(
    { length: count },
    (_, i) => (value >> (8 * (count - 1 - i))) & 0xff,
  );

const text = (value: string): Uint8Array => encoder.encode(value);

const assertProtocolError = (fn: () => unknown, code: number): void => {
  const error = assert.assertThrows(fn, frames.WebSocketProtocolError);
  assert.assertEquals(error.code, code);
};

// =============================================================================
// encodeFrame, encodeMessage, encodeClose
// =============================================================================

const lengthCases = [
  { name: "an empty payload", length: 0, header: [0x82, 0] },
  { name: "125 bytes in the 7-bit length", length: 125, header: [0x82, 125] },
  {
    name: "126 bytes in a 16-bit length",
    length: 126,
    header: [0x82, 126, 0, 126],
  },
  {
    name: "65535 bytes in a 16-bit length",
    length: 65535,
    header: [0x82, 126, 0xff, 0xff],
  },
  {
    name: "65536 bytes in a 64-bit length",
    length: 65536,
    header: [0x82, 127, 0, 0, 0, 0, 0, 1, 0, 0],
  },
];

for (const { name, length, header } of lengthCases) {
  Deno.test(`encodeFrame writes an unmasked final frame with ${name}`, () => {
    const payload = new Uint8Array(length).fill(7);
    const frame = frames.encodeFrame(frames.OPCODES.binary, payload);

    assert.assertEquals([...frame.subarray(0, header.length)], header);
    assert.assertEquals(frame.byteLength, header.length + length);
    assert.assertEquals(frame.subarray(header.length), payload);
  });
}

Deno.test("encodeMessage sends a string as text and bytes as binary", () => {
  assert.assertEquals([...frames.encodeMessage("hi")], [0x81, 2, 0x68, 0x69]);
  assert.assertEquals(
    [...frames.encodeMessage(new Uint8Array([1, 2]))],
    [0x82, 2, 1, 2],
  );
});

Deno.test("encodeClose puts the code before the reason, or sends no payload", () => {
  assert.assertEquals(
    [...frames.encodeClose(1000, "ok")],
    [0x88, 4, 0x03, 0xe8, 0x6f, 0x6b],
  );
  assert.assertEquals([...frames.encodeClose(null, "ignored")], [0x88, 0]);
});

// =============================================================================
// decodeClose
// =============================================================================

Deno.test("decodeClose reads the code and the reason", () => {
  const payload = new Uint8Array([0x0f, 0xa0, ...text("going")]);

  assert.assertEquals(frames.decodeClose(payload), {
    code: 4000,
    reason: "going",
  });
});

Deno.test("decodeClose reports 1005 for an empty payload", () => {
  assert.assertEquals(frames.decodeClose(new Uint8Array(0)), {
    code: 1005,
    reason: "",
  });
});

const invalidCloseCases = [
  { name: "a 1-byte payload", payload: [0x03], code: 1002 },
  {
    name: "code 1005, which only reports a missing code",
    payload: [0x03, 0xed],
    code: 1002,
  },
  {
    name: "code 999, below the defined range",
    payload: [0x03, 0xe7],
    code: 1002,
  },
  {
    name: "a reason that is not UTF-8",
    payload: [0x03, 0xe8, 0xff, 0xfe],
    code: 1007,
  },
];

for (const { name, payload, code } of invalidCloseCases) {
  Deno.test(`decodeClose refuses ${name}`, () => {
    assertProtocolError(
      () => frames.decodeClose(new Uint8Array(payload)),
      code,
    );
  });
}

// =============================================================================
// createFrameReader
// =============================================================================

Deno.test("createFrameReader unmasks a client frame", () => {
  const reader = frames.createFrameReader(1024);

  const [frame] = reader.push(clientFrame(frames.OPCODES.text, text("hello")));

  assert.assertEquals(frame?.fin, true);
  assert.assertEquals(frame?.opcode, frames.OPCODES.text);
  assert.assertEquals(new TextDecoder().decode(frame?.payload), "hello");
});

Deno.test("createFrameReader assembles a frame delivered one byte at a time", () => {
  const reader = frames.createFrameReader(1024);
  const payload = new Uint8Array(300).map((_, i) => i % 256);
  const bytes = clientFrame(frames.OPCODES.binary, payload);

  const received: frames.Frame[] = [];
  for (const byte of bytes) {
    received.push(...reader.push(new Uint8Array([byte])));
  }

  assert.assertEquals(received.length, 1);
  assert.assertEquals(received[0]?.payload, payload);
});

Deno.test("createFrameReader returns every frame of a chunk, in order", () => {
  const reader = frames.createFrameReader(1024);
  const chunk = new Uint8Array([
    ...clientFrame(frames.OPCODES.text, text("one")),
    ...clientFrame(frames.OPCODES.ping, new Uint8Array(0)),
    ...clientFrame(frames.OPCODES.text, text("two")),
  ]);

  const received = reader.push(chunk);

  assert.assertEquals(
    received.map((frame) => frame.opcode),
    [frames.OPCODES.text, frames.OPCODES.ping, frames.OPCODES.text],
  );
  assert.assertEquals(new TextDecoder().decode(received[2]?.payload), "two");
});

Deno.test("createFrameReader reads a 64-bit length", () => {
  const reader = frames.createFrameReader(100_000);
  const payload = new Uint8Array(70_000).fill(1);

  const [frame] = reader.push(clientFrame(frames.OPCODES.binary, payload));

  assert.assertEquals(frame?.payload.byteLength, 70_000);
});

const invalidFrameCases = [
  {
    name: "an unmasked frame",
    bytes: clientFrame(frames.OPCODES.text, text("x"), { masked: false }),
    code: 1002,
  },
  {
    name: "a frame with a reserved bit set",
    bytes: clientFrame(frames.OPCODES.text, text("x"), { reservedBits: 0x40 }),
    code: 1002,
  },
  {
    name: "an unknown opcode",
    bytes: clientFrame(0x3, text("x")),
    code: 1002,
  },
  {
    name: "a control frame over 125 bytes",
    bytes: clientFrame(frames.OPCODES.ping, new Uint8Array(126)),
    code: 1002,
  },
  {
    name: "a fragmented control frame",
    bytes: clientFrame(frames.OPCODES.ping, new Uint8Array(0), { fin: false }),
    code: 1002,
  },
  {
    name: "a 16-bit length over the limit",
    bytes: clientFrame(frames.OPCODES.binary, new Uint8Array(200)),
    code: 1009,
  },
  {
    name: "a 64-bit length over the limit",
    bytes: clientFrame(frames.OPCODES.binary, new Uint8Array(0x10000)),
    code: 1009,
  },
];

for (const { name, bytes, code } of invalidFrameCases) {
  Deno.test(`createFrameReader refuses ${name} with ${code}`, () => {
    const reader = frames.createFrameReader(150);

    assertProtocolError(() => reader.push(bytes), code);
  });
}

// =============================================================================
// createMessageAssembler
// =============================================================================

const frame = (
  opcode: number,
  payload: Uint8Array,
  fin = true,
): frames.Frame => ({ fin, opcode, payload });

Deno.test("createMessageAssembler returns an unfragmented message at once", () => {
  const assembler = frames.createMessageAssembler(1024);

  assert.assertEquals(
    assembler.push(frame(frames.OPCODES.text, text("whole"))),
    "whole",
  );
  assert.assertEquals(
    assembler.push(frame(frames.OPCODES.binary, new Uint8Array([1, 2]))),
    new Uint8Array([1, 2]),
  );
});

Deno.test("createMessageAssembler joins the fragments of a message", () => {
  const assembler = frames.createMessageAssembler(1024);

  assert.assertEquals(
    assembler.push(frame(frames.OPCODES.text, text("frag"), false)),
    null,
  );
  assert.assertEquals(
    assembler.push(frame(frames.OPCODES.continuation, text("men"), false)),
    null,
  );
  assert.assertEquals(
    assembler.push(frame(frames.OPCODES.continuation, text("ted"))),
    "fragmented",
  );
  // The next message starts from scratch.
  assert.assertEquals(
    assembler.push(frame(frames.OPCODES.text, text("next"))),
    "next",
  );
});

Deno.test("createMessageAssembler refuses a continuation with no message to continue", () => {
  const assembler = frames.createMessageAssembler(1024);

  assertProtocolError(
    () => assembler.push(frame(frames.OPCODES.continuation, text("x"))),
    1002,
  );
});

Deno.test("createMessageAssembler refuses a new message inside a fragmented one", () => {
  const assembler = frames.createMessageAssembler(1024);
  assembler.push(frame(frames.OPCODES.text, text("a"), false));

  assertProtocolError(
    () => assembler.push(frame(frames.OPCODES.text, text("b"))),
    1002,
  );
});

Deno.test("createMessageAssembler refuses a message over the limit across fragments", () => {
  const assembler = frames.createMessageAssembler(4);
  assembler.push(frame(frames.OPCODES.binary, new Uint8Array(3), false));

  assertProtocolError(
    () => assembler.push(frame(frames.OPCODES.continuation, new Uint8Array(3))),
    1009,
  );
});

Deno.test("createMessageAssembler refuses text that is not UTF-8 with 1007", () => {
  const assembler = frames.createMessageAssembler(1024);

  assertProtocolError(
    () => assembler.push(frame(frames.OPCODES.text, new Uint8Array([0xc3]))),
    1007,
  );
});
