// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as mediaTypes from "./media-types.ts";

// The Content-Type values @std/media-types gave these extensions, which the
// server sent before the table replaced it.
const EXPECTED: ReadonlyArray<readonly [string, string]> = [
  [".html", "text/html; charset=UTF-8"],
  [".css", "text/css; charset=UTF-8"],
  [".js", "text/javascript; charset=UTF-8"],
  [".mjs", "text/javascript; charset=UTF-8"],
  [".map", "application/json; charset=UTF-8"],
  [".json", "application/json; charset=UTF-8"],
  [".webmanifest", "application/manifest+json; charset=UTF-8"],
  [".txt", "text/plain; charset=UTF-8"],
  [".xml", "application/xml"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".ico", "image/vnd.microsoft.icon"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".mp4", "video/mp4"],
  [".mp3", "audio/mpeg"],
  [".wasm", "application/wasm"],
  [".pdf", "application/pdf"],
];

nodeTest.describe("mediaTypes.contentType", () => {
  for (const [extension, expected] of EXPECTED) {
    nodeTest.it(`gives ${extension} the type the server sent before`, () => {
      assert.assertEquals(mediaTypes.contentType(extension), expected);
    });
  }

  nodeTest.it("accepts an extension without its dot and in upper case", () => {
    assert.assertEquals(mediaTypes.contentType("PNG"), "image/png");
    assert.assertEquals(
      mediaTypes.contentType(".JS"),
      "text/javascript; charset=UTF-8",
    );
  });

  nodeTest.it("returns null for an unknown or empty extension", () => {
    assert.assertEquals(mediaTypes.contentType(".unknown"), null);
    assert.assertEquals(mediaTypes.contentType(""), null);
    assert.assertEquals(mediaTypes.contentType(".constructor"), null);
  });
});
