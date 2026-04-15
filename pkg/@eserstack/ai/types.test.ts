// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import type * as types from "./types.ts";

describe("ContentBlock discriminated union", () => {
  it("should create text blocks", () => {
    const block: types.ContentBlock = { kind: "text", text: "hello" };
    assertEquals(block.kind, "text");
    assertEquals(block.text, "hello");
  });

  it("should create image blocks", () => {
    const block: types.ContentBlock = {
      kind: "image",
      image: { url: "https://example.com/image.png", detail: "high" },
    };
    assertEquals(block.kind, "image");
    assertEquals(block.image.url, "https://example.com/image.png");
    assertEquals(block.image.detail, "high");
  });

  it("should create audio blocks", () => {
    const block: types.ContentBlock = {
      kind: "audio",
      audio: { url: "https://example.com/audio.mp3", mimeType: "audio/mpeg" },
    };
    assertEquals(block.kind, "audio");
    assertEquals(block.audio.mimeType, "audio/mpeg");
  });

  it("should create file blocks", () => {
    const block: types.ContentBlock = {
      kind: "file",
      file: { uri: "gs://bucket/file.pdf", mimeType: "application/pdf" },
    };
    assertEquals(block.kind, "file");
    assertEquals(block.file.uri, "gs://bucket/file.pdf");
  });

  it("should create tool call blocks", () => {
    const block: types.ContentBlock = {
      kind: "tool_call",
      toolCall: {
        id: "call_1",
        name: "get_weather",
        arguments: { city: "Istanbul" },
      },
    };
    assertEquals(block.kind, "tool_call");
    assertEquals(block.toolCall.name, "get_weather");
    assertEquals(block.toolCall.arguments["city"], "Istanbul");
  });

  it("should create tool result blocks", () => {
    const block: types.ContentBlock = {
      kind: "tool_result",
      toolResult: { toolCallId: "call_1", content: "25°C", isError: false },
    };
    assertEquals(block.kind, "tool_result");
    assertEquals(block.toolResult.content, "25°C");
    assertEquals(block.toolResult.isError, false);
  });

  it("should support all content block kinds via switch", () => {
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
      }
    };

    assertEquals(getKindLabel({ kind: "text", text: "test" }), "text");
    assertEquals(getKindLabel({ kind: "image", image: { url: "x" } }), "image");
    assertEquals(getKindLabel({ kind: "audio", audio: { url: "x" } }), "audio");
    assertEquals(getKindLabel({ kind: "file", file: { uri: "x" } }), "file");
    assertEquals(
      getKindLabel({
        kind: "tool_call",
        toolCall: { id: "1", name: "fn", arguments: {} },
      }),
      "tool_call",
    );
    assertEquals(
      getKindLabel({
        kind: "tool_result",
        toolResult: { toolCallId: "1", content: "", isError: false },
      }),
      "tool_result",
    );
  });
});

describe("Message", () => {
  it("should create a message with multiple content blocks", () => {
    const message: types.Message = {
      role: "user",
      content: [
        { kind: "text", text: "Look at this image:" },
        { kind: "image", image: { url: "https://example.com/cat.png" } },
      ],
    };

    assertEquals(message.role, "user");
    assertEquals(message.content.length, 2);
    assertEquals(message.content[0]?.kind, "text");
    assertEquals(message.content[1]?.kind, "image");
  });
});
