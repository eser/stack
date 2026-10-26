// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The Content-Type of the static files a laroux server sends: build output
 * and the files under `public/`. The values match what the server sent with
 * `@std/media-types`, a charset on the text types included. An extension the
 * table does not hold gets no type, and the server falls back to
 * `application/octet-stream`.
 *
 * @module
 */

const UTF8 = "; charset=UTF-8";

/** Content-Type by lower-case file extension, without the dot. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  // Documents, scripts and styles
  html: `text/html${UTF8}`,
  htm: `text/html${UTF8}`,
  css: `text/css${UTF8}`,
  js: `text/javascript${UTF8}`,
  mjs: `text/javascript${UTF8}`,
  json: `application/json${UTF8}`,
  map: `application/json${UTF8}`,
  webmanifest: `application/manifest+json${UTF8}`,
  jsonld: "application/ld+json",
  txt: `text/plain${UTF8}`,
  md: `text/markdown${UTF8}`,
  csv: `text/csv${UTF8}`,
  xml: "application/xml",
  rss: "application/rss+xml",
  atom: "application/atom+xml",
  vtt: `text/vtt${UTF8}`,
  wasm: "application/wasm",
  pdf: "application/pdf",
  zip: "application/zip",
  gz: "application/gzip",

  // Images
  svg: "image/svg+xml",
  png: "image/png",
  apng: "image/apng",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/vnd.microsoft.icon",
  bmp: "image/bmp",

  // Fonts
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",

  // Audio and video
  mp3: "audio/mpeg",
  wav: "audio/wave",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  weba: "audio/webm",
  mp4: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  mov: "video/quicktime",
};

/**
 * The Content-Type for a file extension, with or without its leading dot, in
 * any case; null when the extension is not in the table.
 *
 * @example
 * ```ts
 * import * as mediaTypes from "./media-types.ts";
 *
 * mediaTypes.contentType(".js"); // "text/javascript; charset=UTF-8"
 * mediaTypes.contentType(".unknown"); // null
 * ```
 */
export const contentType = (extension: string): string | null => {
  const key = extension.replace(/^\./, "").toLowerCase();

  return Object.hasOwn(CONTENT_TYPES, key)
    ? (CONTENT_TYPES[key] ?? null)
    : null;
};
