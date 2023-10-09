/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

export {
  assert,
  assertEquals,
  assertExists,
  assertMatch,
  assertNotMatch,
  assertRejects,
  assertStringIncludes,
} from "$std/assert/mod.ts";
export { assertSnapshot } from "$std/testing/snapshot.ts";
export { TextLineStream } from "$std/streams/text_line_stream.ts";
export { delay } from "$std/async/delay.ts";
export { retry } from "$std/async/retry.ts";
export {
  default as puppeteer,
  Page,
} from "https://deno.land/x/puppeteer@16.2.0/mod.ts";
export {
  Document,
  DOMParser,
  HTMLElement,
  HTMLMetaElement,
} from "npm:linkedom@0.15.1";
export * as fs from "$std/fs/mod.ts";
export { basename, dirname, fromFileUrl, join } from "$std/path/mod.ts";
