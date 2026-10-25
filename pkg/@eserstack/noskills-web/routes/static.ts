// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Static file route: the browser scripts, the stylesheet, the icons and the
 * PWA files.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css",
  ".js": "application/javascript",
  ".html": "text/html",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const notFound = (): Response => new Response("Not found", { status: 404 });

/**
 * Answer with the file at `path` under `staticDir`, byte for byte, or 404
 * when there is no such file, the path leaves the directory, or there is no
 * directory (`null`: the module was loaded from a remote URL).
 *
 * @param staticDir - The directory the files are served from
 * @param path - The file's path relative to `staticDir`
 * @returns The file, or a 404
 */
export const serveStatic = async (
  staticDir: string | null,
  path: string,
): Promise<Response> => {
  if (staticDir === null) {
    return notFound();
  }

  // Join against the static dir, then guard against path traversal in a
  // separator-agnostic way: the resolved file must stay inside staticDir.
  const filePath = runtime.path.join(staticDir, path);
  const rel = runtime.path.relative(staticDir, filePath);
  if (rel.startsWith("..") || runtime.path.isAbsolute(rel)) {
    return notFound();
  }

  let content: Uint8Array;
  try {
    // Bytes, not text: decoding as UTF-8 would corrupt an image.
    content = await runtime.fs.readFile(filePath);
  } catch {
    return notFound();
  }

  const contentType = MIME_TYPES[runtime.path.extname(filePath)] ??
    "application/octet-stream";

  // readFile's type allows any ArrayBufferLike, a Response body only an
  // ArrayBuffer-backed view: the copy is one.
  return new Response(new Uint8Array(content), {
    headers: { "content-type": contentType },
  });
};
