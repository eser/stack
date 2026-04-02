// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Base HTML layout — wraps all pages.
 *
 * @module
 */

const escHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const layout = (
  title: string,
  body: string,
  opts?: { includeTerminal?: boolean },
): string => {
  const terminalScripts = opts?.includeTerminal
    ? `
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/xterm.min.css" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/xterm.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/xterm-addon-fit.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/xterm-addon-web-links.min.js"></script>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escHtml(title)}</title>
  <link rel="stylesheet" href="/static/style.css" />
  ${terminalScripts}
</head>
<body>
  <header class="top-bar">
    <a href="/" class="logo">noskills</a>
    <span class="user-info" id="user-info"></span>
  </header>
  ${body}
  <script src="/static/client.js"></script>
</body>
</html>`;
};
