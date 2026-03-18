// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "jsr:@std/assert@^1.0.16";
import { computeSha256, hexToSri, parseSha256Sums } from "./dist-utils.ts";

// --- parseSha256Sums ---

Deno.test("parseSha256Sums: parses valid SHA256SUMS.txt", () => {
  const text = [
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  eser-v4.1.8-x86_64-unknown-linux-gnu.tar.gz",
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2  eser-v4.1.8-aarch64-apple-darwin.tar.gz",
  ].join("\n");

  const result = parseSha256Sums(text);

  assert.assertEquals(result.size, 2);
  assert.assertEquals(
    result.get("eser-v4.1.8-x86_64-unknown-linux-gnu.tar.gz"),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.assertEquals(
    result.get("eser-v4.1.8-aarch64-apple-darwin.tar.gz"),
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  );
});

Deno.test("parseSha256Sums: handles empty input", () => {
  assert.assertEquals(parseSha256Sums("").size, 0);
  assert.assertEquals(parseSha256Sums("\n\n").size, 0);
});

Deno.test("parseSha256Sums: skips malformed lines", () => {
  const text = [
    "valid-but-short  file.tar.gz",
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  good.tar.gz",
    "not a hash line",
    "",
  ].join("\n");

  const result = parseSha256Sums(text);

  assert.assertEquals(result.size, 1);
  assert.assertEquals(
    result.get("good.tar.gz"),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

Deno.test("parseSha256Sums: handles single-space separator", () => {
  const text =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 file.tar.gz";
  const result = parseSha256Sums(text);

  assert.assertEquals(result.size, 1);
  assert.assertEquals(
    result.get("file.tar.gz"),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

// --- hexToSri ---

Deno.test("hexToSri: converts known hash to SRI format", () => {
  // SHA256 of empty string
  const hex =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const sri = hexToSri(hex);

  assert.assertEquals(
    sri,
    "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
  );
});

Deno.test("hexToSri: throws on invalid hex length", () => {
  assert.assertThrows(
    () => hexToSri("abc123"),
    Error,
    "Invalid SHA256 hex hash",
  );
});

Deno.test("hexToSri: throws on non-hex characters", () => {
  assert.assertThrows(
    () =>
      hexToSri(
        "g3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      ),
    Error,
    "Invalid SHA256 hex hash",
  );
});

// --- computeSha256 ---

Deno.test("computeSha256: known test vector (empty data)", async () => {
  const hash = await computeSha256(new Uint8Array(0));

  assert.assertEquals(
    hash,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

Deno.test("computeSha256: known test vector (hello)", async () => {
  const data = new TextEncoder().encode("hello");
  const hash = await computeSha256(data);

  assert.assertEquals(
    hash,
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
});
