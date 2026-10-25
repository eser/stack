// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as contentModule from "./content.ts";

bdd.describe("textMessage", () => {
  bdd.it("should create a user text message", () => {
    const msg = contentModule.textMessage("user", "Hello!");
    assert.assertEquals(msg.role, "user");
    assert.assertEquals(msg.content.length, 1);
    assert.assertEquals(msg.content[0]?.kind, "text");
    if (msg.content[0]?.kind === "text") {
      assert.assertEquals(msg.content[0].text, "Hello!");
    }
  });

  bdd.it("should create an assistant text message", () => {
    const msg = contentModule.textMessage("assistant", "Hi there!");
    assert.assertEquals(msg.role, "assistant");
  });
});

bdd.describe("imageMessage", () => {
  bdd.it("should create an image message with detail", () => {
    const msg = contentModule.imageMessage(
      "user",
      "https://example.com/photo.jpg",
      "high",
    );
    assert.assertEquals(msg.role, "user");
    assert.assertEquals(msg.content[0]?.kind, "image");
    if (msg.content[0]?.kind === "image") {
      assert.assertEquals(
        msg.content[0].image.url,
        "https://example.com/photo.jpg",
      );
      assert.assertEquals(msg.content[0].image.detail, "high");
    }
  });
});

bdd.describe("toolResultMessage", () => {
  bdd.it("should create a tool result message", () => {
    const msg = contentModule.toolResultMessage("call_1", "result data");
    assert.assertEquals(msg.role, "tool");
    assert.assertEquals(msg.content[0]?.kind, "tool_result");
    if (msg.content[0]?.kind === "tool_result") {
      assert.assertEquals(msg.content[0].toolResult.toolCallId, "call_1");
      assert.assertEquals(msg.content[0].toolResult.content, "result data");
      assert.assertEquals(msg.content[0].toolResult.isError, false);
    }
  });

  bdd.it("should create an error tool result", () => {
    const msg = contentModule.toolResultMessage(
      "call_2",
      "error message",
      true,
    );
    if (msg.content[0]?.kind === "tool_result") {
      assert.assertEquals(msg.content[0].toolResult.isError, true);
    }
  });
});

bdd.describe("isDataUrl", () => {
  bdd.it("should detect data URLs", () => {
    assert.assertEquals(
      contentModule.isDataUrl("data:image/png;base64,abc123"),
      true,
    );
    assert.assertEquals(contentModule.isDataUrl("https://example.com"), false);
    assert.assertEquals(contentModule.isDataUrl(""), false);
  });
});

bdd.describe("decodeDataUrl", () => {
  bdd.it("should decode a base64 data URL", () => {
    const dataUrl = "data:text/plain;base64,SGVsbG8=";
    const result = contentModule.decodeDataUrl(dataUrl);
    assert.assertNotEquals(result, null);
    assert.assertEquals(result?.mimeType, "text/plain");
    assert.assertEquals(new TextDecoder().decode(result?.data), "Hello");
  });

  bdd.it("should return null for non-data URLs", () => {
    assert.assertEquals(
      contentModule.decodeDataUrl("https://example.com"),
      null,
    );
  });

  bdd.it("should return null for data URLs without base64", () => {
    assert.assertEquals(
      contentModule.decodeDataUrl("data:text/plain,Hello"),
      null,
    );
  });
});

bdd.describe("detectMimeFromUrl", () => {
  bdd.it("should detect common image MIME types", () => {
    assert.assertEquals(
      contentModule.detectMimeFromUrl("photo.png"),
      "image/png",
    );
    assert.assertEquals(
      contentModule.detectMimeFromUrl("photo.jpg"),
      "image/jpeg",
    );
    assert.assertEquals(
      contentModule.detectMimeFromUrl("photo.jpeg"),
      "image/jpeg",
    );
    assert.assertEquals(
      contentModule.detectMimeFromUrl("photo.gif"),
      "image/gif",
    );
    assert.assertEquals(
      contentModule.detectMimeFromUrl("photo.webp"),
      "image/webp",
    );
  });

  bdd.it("should detect audio MIME types", () => {
    assert.assertEquals(
      contentModule.detectMimeFromUrl("track.mp3"),
      "audio/mpeg",
    );
    assert.assertEquals(
      contentModule.detectMimeFromUrl("track.wav"),
      "audio/wav",
    );
    assert.assertEquals(
      contentModule.detectMimeFromUrl("track.ogg"),
      "audio/ogg",
    );
  });

  bdd.it("should handle URLs with query strings", () => {
    assert.assertEquals(
      contentModule.detectMimeFromUrl("photo.png?v=1"),
      "image/png",
    );
  });

  bdd.it("should return null for unknown extensions", () => {
    assert.assertEquals(contentModule.detectMimeFromUrl("file.xyz"), null);
  });

  bdd.it(
    "should return null for extensions named after Object.prototype members",
    () => {
      for (
        const url of ["file.constructor", "file.__proto__", "file.valueOf"]
      ) {
        assert.assertEquals(contentModule.detectMimeFromUrl(url), null, url);
      }
    },
  );

  bdd.it("should return null for URLs without extensions", () => {
    assert.assertEquals(
      contentModule.detectMimeFromUrl("https://example.com/file"),
      null,
    );
  });

  bdd.it("should be case-insensitive", () => {
    assert.assertEquals(
      contentModule.detectMimeFromUrl("photo.PNG"),
      "image/png",
    );
    assert.assertEquals(
      contentModule.detectMimeFromUrl("track.MP3"),
      "audio/mpeg",
    );
  });
});
