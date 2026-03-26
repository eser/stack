// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertNotEquals } from "@std/assert";
import * as contentModule from "./content.ts";

describe("textMessage", () => {
  it("should create a user text message", () => {
    const msg = contentModule.textMessage("user", "Hello!");
    assertEquals(msg.role, "user");
    assertEquals(msg.content.length, 1);
    assertEquals(msg.content[0]?.kind, "text");
    if (msg.content[0]?.kind === "text") {
      assertEquals(msg.content[0].text, "Hello!");
    }
  });

  it("should create an assistant text message", () => {
    const msg = contentModule.textMessage("assistant", "Hi there!");
    assertEquals(msg.role, "assistant");
  });
});

describe("imageMessage", () => {
  it("should create an image message with detail", () => {
    const msg = contentModule.imageMessage(
      "user",
      "https://example.com/photo.jpg",
      "high",
    );
    assertEquals(msg.role, "user");
    assertEquals(msg.content[0]?.kind, "image");
    if (msg.content[0]?.kind === "image") {
      assertEquals(msg.content[0].image.url, "https://example.com/photo.jpg");
      assertEquals(msg.content[0].image.detail, "high");
    }
  });
});

describe("toolResultMessage", () => {
  it("should create a tool result message", () => {
    const msg = contentModule.toolResultMessage("call_1", "result data");
    assertEquals(msg.role, "tool");
    assertEquals(msg.content[0]?.kind, "tool_result");
    if (msg.content[0]?.kind === "tool_result") {
      assertEquals(msg.content[0].toolResult.toolCallId, "call_1");
      assertEquals(msg.content[0].toolResult.content, "result data");
      assertEquals(msg.content[0].toolResult.isError, false);
    }
  });

  it("should create an error tool result", () => {
    const msg = contentModule.toolResultMessage(
      "call_2",
      "error message",
      true,
    );
    if (msg.content[0]?.kind === "tool_result") {
      assertEquals(msg.content[0].toolResult.isError, true);
    }
  });
});

describe("isDataUrl", () => {
  it("should detect data URLs", () => {
    assertEquals(contentModule.isDataUrl("data:image/png;base64,abc123"), true);
    assertEquals(contentModule.isDataUrl("https://example.com"), false);
    assertEquals(contentModule.isDataUrl(""), false);
  });
});

describe("decodeDataUrl", () => {
  it("should decode a base64 data URL", () => {
    const dataUrl = "data:text/plain;base64,SGVsbG8=";
    const result = contentModule.decodeDataUrl(dataUrl);
    assertNotEquals(result, null);
    assertEquals(result?.mimeType, "text/plain");
    assertEquals(new TextDecoder().decode(result?.data), "Hello");
  });

  it("should return null for non-data URLs", () => {
    assertEquals(contentModule.decodeDataUrl("https://example.com"), null);
  });

  it("should return null for data URLs without base64", () => {
    assertEquals(contentModule.decodeDataUrl("data:text/plain,Hello"), null);
  });
});

describe("detectMimeFromUrl", () => {
  it("should detect common image MIME types", () => {
    assertEquals(contentModule.detectMimeFromUrl("photo.png"), "image/png");
    assertEquals(contentModule.detectMimeFromUrl("photo.jpg"), "image/jpeg");
    assertEquals(contentModule.detectMimeFromUrl("photo.jpeg"), "image/jpeg");
    assertEquals(contentModule.detectMimeFromUrl("photo.gif"), "image/gif");
    assertEquals(contentModule.detectMimeFromUrl("photo.webp"), "image/webp");
  });

  it("should detect audio MIME types", () => {
    assertEquals(contentModule.detectMimeFromUrl("track.mp3"), "audio/mpeg");
    assertEquals(contentModule.detectMimeFromUrl("track.wav"), "audio/wav");
    assertEquals(contentModule.detectMimeFromUrl("track.ogg"), "audio/ogg");
  });

  it("should handle URLs with query strings", () => {
    assertEquals(contentModule.detectMimeFromUrl("photo.png?v=1"), "image/png");
  });

  it("should return null for unknown extensions", () => {
    assertEquals(contentModule.detectMimeFromUrl("file.xyz"), null);
  });

  it("should return null for URLs without extensions", () => {
    assertEquals(
      contentModule.detectMimeFromUrl("https://example.com/file"),
      null,
    );
  });

  it("should be case-insensitive", () => {
    assertEquals(contentModule.detectMimeFromUrl("photo.PNG"), "image/png");
    assertEquals(contentModule.detectMimeFromUrl("track.MP3"), "audio/mpeg");
  });
});
