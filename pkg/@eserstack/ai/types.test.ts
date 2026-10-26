// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import type * as types from "./types.ts";

bdd.describe("ContentBlock discriminated union", () => {
  bdd.it("should create text blocks", () => {
    const block: types.ContentBlock = { kind: "text", text: "hello" };
    assert.assertEquals(block.kind, "text");
    assert.assertEquals(block.text, "hello");
  });

  bdd.it("should create image blocks", () => {
    const block: types.ContentBlock = {
      kind: "image",
      image: { url: "https://example.com/image.png", detail: "high" },
    };
    assert.assertEquals(block.kind, "image");
    assert.assertEquals(block.image.url, "https://example.com/image.png");
    assert.assertEquals(block.image.detail, "high");
  });

  bdd.it("should create audio blocks", () => {
    const block: types.ContentBlock = {
      kind: "audio",
      audio: { url: "https://example.com/audio.mp3", mimeType: "audio/mpeg" },
    };
    assert.assertEquals(block.kind, "audio");
    assert.assertEquals(block.audio.mimeType, "audio/mpeg");
  });

  bdd.it("should create file blocks", () => {
    const block: types.ContentBlock = {
      kind: "file",
      file: { uri: "gs://bucket/file.pdf", mimeType: "application/pdf" },
    };
    assert.assertEquals(block.kind, "file");
    assert.assertEquals(block.file.uri, "gs://bucket/file.pdf");
  });

  bdd.it("should create tool call blocks", () => {
    const block: types.ContentBlock = {
      kind: "tool_call",
      toolCall: {
        id: "call_1",
        name: "get_weather",
        arguments: { city: "Istanbul" },
      },
    };
    assert.assertEquals(block.kind, "tool_call");
    assert.assertEquals(block.toolCall.name, "get_weather");
    assert.assertEquals(block.toolCall.arguments["city"], "Istanbul");
  });

  bdd.it("should create tool result blocks", () => {
    const block: types.ContentBlock = {
      kind: "tool_result",
      toolResult: { toolCallId: "call_1", content: "25°C", isError: false },
    };
    assert.assertEquals(block.kind, "tool_result");
    assert.assertEquals(block.toolResult.content, "25°C");
    assert.assertEquals(block.toolResult.isError, false);
  });

  bdd.it("should support all content block kinds via switch", () => {
    const getKindLabel = (block: types.ContentBlock): string => {
      switch (block.kind) {
        case "text":
          return "text";
        case "image":
          return "image";
        case "audio":
          return "audio";
        case "file":
          return "file";
        case "tool_call":
          return "tool_call";
        case "tool_result":
          return "tool_result";
        case "thinking":
          return "thinking";
      }
    };

    assert.assertEquals(getKindLabel({ kind: "text", text: "test" }), "text");
    assert.assertEquals(
      getKindLabel({ kind: "image", image: { url: "x" } }),
      "image",
    );
    assert.assertEquals(
      getKindLabel({ kind: "audio", audio: { url: "x" } }),
      "audio",
    );
    assert.assertEquals(
      getKindLabel({ kind: "file", file: { uri: "x" } }),
      "file",
    );
    assert.assertEquals(
      getKindLabel({
        kind: "tool_call",
        toolCall: { id: "1", name: "fn", arguments: {} },
      }),
      "tool_call",
    );
    assert.assertEquals(
      getKindLabel({
        kind: "tool_result",
        toolResult: { toolCallId: "1", content: "", isError: false },
      }),
      "tool_result",
    );
    assert.assertEquals(
      getKindLabel({
        kind: "thinking",
        thinking: { text: "plan", signature: "sig" },
      }),
      "thinking",
    );
  });
});

bdd.describe("Message", () => {
  bdd.it("should create a message with multiple content blocks", () => {
    const message: types.Message = {
      role: "user",
      content: [
        { kind: "text", text: "Look at this image:" },
        { kind: "image", image: { url: "https://example.com/cat.png" } },
      ],
    };

    assert.assertEquals(message.role, "user");
    assert.assertEquals(message.content.length, 2);
    assert.assertEquals(message.content[0]?.kind, "text");
    assert.assertEquals(message.content[1]?.kind, "image");
  });
});
