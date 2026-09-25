// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Base HTML layout — wraps all pages.
 *
 * @module
 */

import { escHtml } from "./escape.ts";

// The dashboard page carries the mux token, which can spawn PTYs, so every
// third-party file it loads is pinned by content. The digests are SHA-384 of
// the exact npm release bytes (xterm@5.3.0, xterm-addon-web-links@0.9.0),
// which jsDelivr serves unchanged; a changed file fails to load instead of
// running. To upgrade, recompute with:
//   openssl dgst -sha384 -binary <file> | openssl base64 -A
const XTERM_CDN = "https://cdn.jsdelivr.net/npm";
const XTERM_CSS = {
  href: `${XTERM_CDN}/xterm@5.3.0/css/xterm.css`,
  integrity:
    "sha384-LJcOxlx9IMbNXDqJ2axpfEQKkAYbFjJfhXexLfiRJhjDU81mzgkiQq8rkV0j6dVh",
};
const XTERM_SCRIPTS = [
  {
    src: `${XTERM_CDN}/xterm@5.3.0/lib/xterm.js`,
    integrity:
      "sha384-/nfmYPUzWMS6v2atn8hbljz7NE0EI1iGx34lJaNzyVjWGDzMv+ciUZUeJpKA3Glc",
  },
  {
    src:
      `${XTERM_CDN}/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.js`,
    integrity:
      "sha384-U4fBROT3kCM582gaYiNaOSQiJbXPzd9SfR1598Y7yeGSYVBzikXrNg0XyuU+mOnl",
  },
];

/**
 * Content-Security-Policy for every HTML page. Scripts run only from this
 * origin and the pinned CDN files above; there are no inline scripts. Inline
 * styles stay allowed because components and xterm set them.
 */
export const PAGE_CSP = [
  "default-src 'self'",
  `script-src 'self' ${XTERM_CDN}/`,
  `style-src 'self' 'unsafe-inline' ${XTERM_CDN}/`,
  "img-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

/** Response headers for an HTML page. */
export const htmlHeaders = (): Record<string, string> => ({
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": PAGE_CSP,
});

export const layout = (
  title: string,
  body: string,
  opts?: { includeTerminal?: boolean; token?: string },
): string => {
  // The per-process token, handed to the browser the only way it can legally
  // obtain one: by loading a page from an allowed origin. client.js reads it
  // from here for the /mux upgrade and for every mutating fetch.
  const tokenMeta = opts?.token === undefined
    ? ""
    : `\n  <meta name="noskills-token" content="${escHtml(opts.token)}" />`;

  const terminalScripts = opts?.includeTerminal
    ? `
    <link rel="stylesheet" href="${XTERM_CSS.href}" integrity="${XTERM_CSS.integrity}" crossorigin="anonymous" />${
      XTERM_SCRIPTS.map((s) =>
        `\n    <script src="${s.src}" integrity="${s.integrity}" crossorigin="anonymous"></script>`
      ).join("")
    }`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#7c3aed" />${tokenMeta}
  <title>${escHtml(title)}</title>
  <link rel="manifest" href="/manifest.json" />
  <link rel="stylesheet" href="/static/style.css" />
  ${terminalScripts}
</head>
<body>
  <header class="top-bar">
    <a href="/" class="logo">noskills</a>
    <span class="user-info" id="user-info"></span>
  </header>
  ${body}
  <script src="/static/mux-render.js"></script>
  <script src="/static/client.js"></script>
  <script src="/static/sw-register.js"></script>
</body>
</html>`;
};
