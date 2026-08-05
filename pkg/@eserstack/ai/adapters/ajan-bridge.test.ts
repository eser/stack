// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, assertEquals } from "@std/assert";
import * as results from "@eserstack/primitives/results";
import type * as ffiTypes from "@eserstack/ajan/ffi";
import { AjanBridgeModel, createBridgeFactories } from "./ajan-bridge.ts";

// The bridge's wire contract is a set of JSON key names shared with Go, and it
// is minted in exactly one place: this file. Nothing checked it, which is how
// two keys stayed wrong indefinitely -- `requests` where Go reads `items`, so
// every batch submit carried zero items, and `afterId` where Go reads `after`,
// so pagination was silently ignored. Neither failed loudly: encoding/json
// discards an unknown key, leaving a well-formed request that means something
// different from what the caller asked for.
//
// A stub library pins the contract without needing FFI, a native build, or a
// provider.

type Captured = { name: string; payload: string };

const stubLib = (captured: Captured[]): ffiTypes.FFILibrary => {
  const record = (name: string, reply: string) => (requestJSON: string) => {
    captured.push({ name, payload: requestJSON });

    return reply;
  };

  const job = JSON.stringify({
    job: { id: "job-1", status: "in_progress", requestCounts: {} },
  });

  return {
    symbols: {
      EserAjanAiBatchCreate: record("create", job),
      EserAjanAiBatchList: record("list", JSON.stringify({ jobs: [] })),
    },
  } as unknown as ffiTypes.FFILibrary;
};

const model = (captured: Captured[]) =>
  new AjanBridgeModel(
    stubLib(captured),
    "handle-1",
    "anthropic",
    "claude-x",
    ["batch_processing"],
  );

Deno.test("submitBatch sends its items under the key Go reads", async () => {
  const captured: Captured[] = [];

  await model(captured).submitBatch({
    items: [
      { customId: "a", options: { messages: [] } },
      { customId: "b", options: { messages: [] } },
    ],
  });

  assertEquals(captured.length, 1);

  const sent = JSON.parse(captured[0]!.payload) as Record<string, unknown>;

  // `items` is what pkg/@eserstack/ajan/bridge.go's aiBatchSubmitRequest tags.
  assert(Array.isArray(sent["items"]), `no items key: ${captured[0]!.payload}`);
  assertEquals((sent["items"] as unknown[]).length, 2);

  // The old name must not reappear: Go would ignore it and submit nothing.
  assertEquals(sent["requests"], undefined);
});

Deno.test("listBatchJobs sends its cursor under the key Go reads", async () => {
  const captured: Captured[] = [];

  await model(captured).listBatchJobs({ after: "cursor-1", limit: 10 });

  const sent = JSON.parse(captured[0]!.payload) as Record<string, unknown>;

  assertEquals(sent["after"], "cursor-1");
  assertEquals(sent["afterId"], undefined);
  assertEquals(sent["limit"], 10);
});

// ── Generation wire contract ─────────────────────────────────────────────────
//
// The Go half of this contract is pinned in
// pkg/@eserstack/ajan/bridge_ai_wire_test.go against literal JSON. These tests
// pin the producing half: that this file emits the keys and shapes that test
// decodes. Together they close the loop without needing FFI or a native build.

const captureGenerate = async (
  options: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const captured: Captured[] = [];

  const lib = {
    symbols: {
      EserAjanAiGenerateText: (_handle: string, optionsJSON: string) => {
        captured.push({ name: "generate", payload: optionsJSON });

        return JSON.stringify({
          content: [],
          usage: {},
          stopReason: "end_turn",
        });
      },
    },
  } as unknown as ffiTypes.FFILibrary;

  const m = new AjanBridgeModel(lib, "h", "anthropic", "x", [
    "text_generation",
  ]);

  await m.generateText(
    options as unknown as Parameters<typeof m.generateText>[0],
  );

  return JSON.parse(captured[0]!.payload) as Record<string, unknown>;
};

Deno.test("generation options all reach the wire", async () => {
  const sent = await captureGenerate({
    messages: [],
    system: "be brief",
    maxTokens: 512,
    toolChoice: "required",
    tools: [{ name: "t", description: "d", parameters: { type: "object" } }],
    temperature: 0,
    topP: 0.9,
    stopWords: ["END"],
    thinkingBudget: 2048,
    safetySettings: [{ category: "C", threshold: "T" }],
    extensions: { vendorFlag: true },
  });

  // Temperature 0 must survive as 0, not be defaulted away: it is a real
  // setting and distinct from "unspecified".
  assertEquals(sent["temperature"], 0);
  assertEquals(sent["topP"], 0.9);
  assertEquals(sent["thinkingBudget"], 2048);
  assertEquals(sent["stopWords"], ["END"]);
  assert(Array.isArray(sent["tools"]), "tools were dropped");
  assert(Array.isArray(sent["safetySettings"]), "safetySettings were dropped");
  assertEquals(sent["extensions"], { vendorFlag: true });
});

Deno.test("unset options are absent rather than zeroed", async () => {
  const sent = await captureGenerate({ messages: [] });

  // Absent, not 0. Go decodes these into pointers, so a literal 0 here would
  // pin every unspecified request to temperature 0.
  assert(!("temperature" in sent), "temperature was defaulted");
  assert(!("topP" in sent), "topP was defaulted");
  assert(!("thinkingBudget" in sent), "thinkingBudget was defaulted");
});

Deno.test("content block payloads all reach the wire", async () => {
  const sent = await captureGenerate({
    messages: [{
      role: "user",
      content: [
        { kind: "text", text: "hi" },
        {
          kind: "image",
          image: { mimeType: "image/png", data: new Uint8Array([104, 105]) },
        },
        { kind: "file", file: { uri: "gs://b/x", mimeType: "text/plain" } },
        {
          kind: "tool_call",
          toolCall: { id: "tc-1", name: "f", arguments: { a: 1 } },
        },
        {
          kind: "tool_result",
          toolResult: { toolCallId: "tc-1", content: "ok", isError: false },
        },
      ],
    }],
  });

  const blocks =
    (sent["messages"] as Array<{ content: Array<Record<string, unknown>> }>)[0]!
      .content;

  // "aGk=" is base64("hi"). A Uint8Array does not survive JSON.stringify -- it
  // becomes {"0":104,"1":105} -- so this is what proves it was encoded.
  assertEquals(
    (blocks[1]!["image"] as Record<string, unknown>)["data"],
    "aGk=",
  );
  assertEquals(
    (blocks[2]!["file"] as Record<string, unknown>)["uri"],
    "gs://b/x",
  );
  assertEquals(
    (blocks[3]!["toolCall"] as Record<string, unknown>)["id"],
    "tc-1",
  );
  assertEquals(
    (blocks[4]!["toolResult"] as Record<string, unknown>)["content"],
    "ok",
  );
});

Deno.test("tool calls in a response are decoded, not dropped", () => {
  const lib = {
    symbols: {
      EserAjanAiGenerateText: () =>
        JSON.stringify({
          content: [{
            type: "tool_call",
            id: "tc-7",
            name: "get_weather",
            arguments: { city: "Ankara" },
          }],
          usage: {},
          stopReason: "tool_use",
        }),
    },
  } as unknown as ffiTypes.FFILibrary;

  const m = new AjanBridgeModel(lib, "h", "anthropic", "x", ["tool_calling"]);

  return m.generateText(
    { messages: [] } as unknown as Parameters<
      typeof m.generateText
    >[0],
  ).then((result) => {
    assert(results.isOk(result), "generateText failed");

    const blocks = result.value.content as unknown as Array<
      Record<string, unknown>
    >;

    assertEquals(blocks.length, 1, "the tool call was dropped");
    assertEquals(blocks[0]!["kind"], "tool_call");

    const call = blocks[0]!["toolCall"] as Record<string, unknown>;
    assertEquals(call["id"], "tc-7");
    assertEquals(call["name"], "get_weather");
    assertEquals(call["arguments"], { city: "Ankara" });
  });
});

// ── AbortSignal ──────────────────────────────────────────────────────────────
//
// The Go half of the cancellation contract is pinned in
// pkg/@eserstack/ajan/bridge_ai_cancel_test.go. These pin the producing half:
// that a signal actually reaches the cancel symbol, that the request carries an
// id for it to name, and that the listener is always detached afterwards.

type CancelSpy = {
  readonly lib: ffiTypes.FFILibrary;
  readonly cancels: string[];
  readonly sent: string[];
  resolveGenerate?: (raw: string) => void;
};

const cancelSpy = (): CancelSpy => {
  const cancels: string[] = [];
  const sent: string[] = [];
  const spy: CancelSpy = {
    cancels,
    sent,
    lib: {
      symbols: {
        // Deliberately async, mirroring the nonblocking Deno symbol: the whole
        // point is that JS keeps running while the model call is in flight.
        EserAjanAiGenerateText: (_h: string, optionsJSON: string) => {
          sent.push(optionsJSON);

          return new Promise<string>((resolve) => {
            spy.resolveGenerate = resolve;
          });
        },
        EserAjanAiCancelRequest: (requestJSON: string) => {
          cancels.push(requestJSON);

          return "{}";
        },
      },
    } as unknown as ffiTypes.FFILibrary,
  };

  return spy;
};

const spyModel = (spy: CancelSpy) =>
  new AjanBridgeModel(spy.lib, "h", "anthropic", "x", ["text_generation"]);

Deno.test("aborting mid-flight reaches the cancel symbol with the request's id", async () => {
  const spy = cancelSpy();
  const controller = new AbortController();

  const pending = spyModel(spy).generateText(
    { messages: [] } as unknown as Parameters<
      ReturnType<typeof spyModel>["generateText"]
    >[0],
    controller.signal,
  );

  // The call is in flight and has not resolved. That JS reached this line at
  // all is the nonblocking property: a blocking symbol would have frozen the
  // isolate here and abort could never fire.
  assertEquals(spy.cancels.length, 0);

  controller.abort();

  assertEquals(spy.cancels.length, 1, "abort did not reach the cancel symbol");

  const sentId = (JSON.parse(spy.sent[0]!) as { requestId: string }).requestId;
  const cancelledId =
    (JSON.parse(spy.cancels[0]!) as { requestId: string }).requestId;

  // Cancelling a different id than the request carries would be a silent no-op.
  assertEquals(cancelledId, sentId);

  spy.resolveGenerate!(JSON.stringify({ error: "context canceled" }));

  const result = await pending;

  assert(results.isFail(result), "an aborted call reported success");
  // The caller's own intent, not the Go plumbing that carried it out.
  assertEquals(result.error.message, "request aborted");
});

Deno.test("an already-aborted signal cancels without waiting", async () => {
  const spy = cancelSpy();

  const result = spyModel(spy).generateText(
    { messages: [] } as unknown as Parameters<
      ReturnType<typeof spyModel>["generateText"]
    >[0],
    AbortSignal.abort(),
  );

  // Sent immediately. Go records it against the id, so the request stops the
  // instant it registers rather than running to completion first.
  assertEquals(spy.cancels.length, 1);

  spy.resolveGenerate!(JSON.stringify({ error: "context canceled" }));
  await result;
});

Deno.test("the abort listener is detached when the call completes", async () => {
  const spy = cancelSpy();
  const controller = new AbortController();

  const pending = spyModel(spy).generateText(
    { messages: [] } as unknown as Parameters<
      ReturnType<typeof spyModel>["generateText"]
    >[0],
    controller.signal,
  );

  spy.resolveGenerate!(
    JSON.stringify({ content: [], usage: {}, stopReason: "end_turn" }),
  );

  await pending;

  // Aborting a finished call must do nothing. A listener left attached keeps
  // the signal -- and through it this model -- alive for as long as the caller
  // holds the controller, and fires a pointless cancel into the library.
  controller.abort();

  assertEquals(
    spy.cancels.length,
    0,
    "the listener outlived the call it belonged to",
  );
});

Deno.test("a call without a signal still carries a request id", async () => {
  const spy = cancelSpy();

  const pending = spyModel(spy).generateText(
    { messages: [] } as unknown as Parameters<
      ReturnType<typeof spyModel>["generateText"]
    >[0],
  );

  const sent = JSON.parse(spy.sent[0]!) as { requestId?: string };

  // Always present, so a caller can cancel out of band and so the id never
  // silently becomes the empty string -- which Go treats as untracked.
  assert(
    sent.requestId !== undefined && sent.requestId.length > 0,
    "no requestId was sent",
  );

  spy.resolveGenerate!(
    JSON.stringify({ content: [], usage: {}, stopReason: "end_turn" }),
  );
  await pending;
});

Deno.test("batch calls are cancellable and carry a request id", async () => {
  const cancels: string[] = [];
  const sent: string[] = [];
  let resolveCall: ((raw: string) => void) | undefined;

  const lib = {
    symbols: {
      EserAjanAiBatchGet: (requestJSON: string) => {
        sent.push(requestJSON);

        return new Promise<string>((resolve) => {
          resolveCall = resolve;
        });
      },
      EserAjanAiCancelRequest: (requestJSON: string) => {
        cancels.push(requestJSON);

        return "{}";
      },
    },
  } as unknown as ffiTypes.FFILibrary;

  const m = new AjanBridgeModel(lib, "h", "anthropic", "x", [
    "batch_processing",
  ]);

  const controller = new AbortController();
  const pending = m.getBatchJob("job-1", controller.signal);

  // Reaching here proves the batch symbol no longer blocks the isolate.
  controller.abort();

  assertEquals(cancels.length, 1, "abort did not reach the cancel symbol");

  const sentId = (JSON.parse(sent[0]!) as { requestId: string }).requestId;
  const cancelledId =
    (JSON.parse(cancels[0]!) as { requestId: string }).requestId;

  assertEquals(cancelledId, sentId);

  resolveCall!(JSON.stringify({ error: "context canceled" }));

  await pending.then(
    () => {
      throw new Error("an aborted batch call reported success");
    },
    (err: Error) => {
      assertEquals(err.message, "request aborted");
    },
  );
});

Deno.test("a classified bridge error rebuilds its typed class", async () => {
  const lib = {
    symbols: {
      EserAjanAiGenerateText: () =>
        Promise.resolve(JSON.stringify({
          error: "rate limited",
          errorKind: "rate_limited",
          errorStatus: 429,
        })),
    },
  } as unknown as ffiTypes.FFILibrary;

  const m = new AjanBridgeModel(lib, "h", "anthropic", "x", [
    "text_generation",
  ]);

  const result = await m.generateText(
    { messages: [] } as unknown as Parameters<typeof m.generateText>[0],
  );

  assert(results.isFail(result), "a classified error reported success");
  // Not a bare AiError: a caller has to be able to branch on this to back off.
  assertEquals(result.error.constructor.name, "RateLimitedError");
  assertEquals(result.error.statusCode, 429);
});

// ── ACP-backed providers ─────────────────────────────────────────────────────

// These three used to be gated on an `eser-acp` binary being on PATH, because
// aifx reached its own shim through a subprocess. The shim is now linked into
// the library, so the library loading IS the availability check — there is
// nothing left that can be absent independently.
Deno.test("every bridge provider is advertised once the library loads", () => {
  const lib = { symbols: {} } as unknown as ffiTypes.FFILibrary;

  const providers = createBridgeFactories(lib).map((factory) =>
    factory.provider
  );

  for (
    const provider of [
      "claude-code",
      "opencode",
      "kiro",
      "anthropic",
      "openai",
      "gemini",
    ]
  ) {
    assert(providers.includes(provider), `${provider} was withheld`);
  }
});
