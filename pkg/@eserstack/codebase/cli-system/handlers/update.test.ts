// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals, assertStringIncludes } from "@std/assert";

import * as results from "@eserstack/primitives/results";

import { findExpectedChecksum, verifyArchiveChecksum } from "./update.ts";

const BASE_URL = "https://github.com/eser/stack/releases/download/v1.2.3";
const ARCHIVE = "eser-v1.2.3-aarch64-apple-darwin.tar.gz";

const PAYLOAD = new TextEncoder().encode("archive-bytes");

// sha256 of the literal bytes above, taken from `shasum -a 256`, not from the
// code under test -- a digest computed by the same helper it verifies would
// agree with a broken helper.
const PAYLOAD_SHA256 =
  "0c982986710a026635603031674053ca851fc0e3ea760094a34f59b84f7f6da6";
const OTHER_SHA256 =
  "fbf22ec45a215e0d4711bfe2dde37292707edaf098c15bd5b204cb3ca72e6ca3";

const servingText = (body: string, status = 200): typeof fetch => () =>
  Promise.resolve(new Response(body, { status }));

const failingFetch: typeof fetch = () =>
  Promise.reject(new TypeError("error sending request for url"));

const expectFail = (result: results.Result<void, string>): string => {
  if (results.isOk(result)) {
    throw new Error("expected verification to fail, but it succeeded");
  }

  return result.error;
};

// The defect this file exists for: verification used to be opportunistic. Both
// of the next two tests describe a download nobody checked, which the updater
// then wrote over the running binary.
Deno.test("an unreachable SHA256SUMS.txt aborts the update", async () => {
  const message = expectFail(
    await verifyArchiveChecksum(BASE_URL, ARCHIVE, PAYLOAD, failingFetch),
  );

  assertStringIncludes(message, "SHA256SUMS.txt");
  assertStringIncludes(message, "Refusing to install");
});

Deno.test("a non-200 SHA256SUMS.txt aborts the update", async () => {
  const message = expectFail(
    await verifyArchiveChecksum(
      BASE_URL,
      ARCHIVE,
      PAYLOAD,
      servingText("Not Found", 404),
    ),
  );

  assertStringIncludes(message, "HTTP 404");
  assertStringIncludes(message, "Refusing to install");
});

Deno.test("a checksums file with no entry for the archive aborts the update", async () => {
  const sums = [
    `${OTHER_SHA256}  noskills-v1.2.3-aarch64-apple-darwin.tar.gz`,
    `${OTHER_SHA256}  laroux-v1.2.3-aarch64-apple-darwin.tar.gz`,
  ].join("\n");

  const message = expectFail(
    await verifyArchiveChecksum(BASE_URL, ARCHIVE, PAYLOAD, servingText(sums)),
  );

  assertStringIncludes(message, `No checksum listed for ${ARCHIVE}`);
});

// The sharpest form of the substring bug: the decoy line carries the CORRECT
// hash of the payload, so a `line.includes(archiveName)` matcher would report
// "Checksum verified" for an archive that SHA256SUMS.txt never listed.
Deno.test("a substring match is not an entry", async () => {
  const sums = [
    `${PAYLOAD_SHA256}  ${ARCHIVE}.sig`,
    `${PAYLOAD_SHA256}  prefixed-${ARCHIVE}`,
  ].join("\n");

  assertEquals(findExpectedChecksum(sums, ARCHIVE), undefined);

  const message = expectFail(
    await verifyArchiveChecksum(BASE_URL, ARCHIVE, PAYLOAD, servingText(sums)),
  );

  assertStringIncludes(message, `No checksum listed for ${ARCHIVE}`);
});

Deno.test("a mismatched checksum aborts the update", async () => {
  const sums = `${OTHER_SHA256}  ${ARCHIVE}\n`;

  const message = expectFail(
    await verifyArchiveChecksum(BASE_URL, ARCHIVE, PAYLOAD, servingText(sums)),
  );

  assertStringIncludes(message, "checksum verification failed");
  assertStringIncludes(message, OTHER_SHA256);
  assertStringIncludes(message, PAYLOAD_SHA256);
});

Deno.test("a correct checksum lets the update proceed", async () => {
  const sums = [
    `${OTHER_SHA256}  noskills-v1.2.3-aarch64-apple-darwin.tar.gz`,
    `${PAYLOAD_SHA256}  ${ARCHIVE}`,
    `${OTHER_SHA256}  ${ARCHIVE}.sig`,
  ].join("\n");

  const result = await verifyArchiveChecksum(
    BASE_URL,
    ARCHIVE,
    PAYLOAD,
    servingText(sums),
  );

  assertEquals(results.isOk(result), true);
});

// GoReleaser writes `<hash>  <name>` with two spaces, but the file has arrived
// with CRLF endings and with a leading-blank first line before now. awk ignores
// leading whitespace; the trim here is what keeps this equivalent.
Deno.test("field matching survives surrounding whitespace", () => {
  const sums = `\r\n   ${PAYLOAD_SHA256}   ${ARCHIVE}  \r\n\r\n`;

  assertEquals(findExpectedChecksum(sums, ARCHIVE), PAYLOAD_SHA256);
});
