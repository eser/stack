// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared HTML escaping for the server-rendered templates.
 *
 * @module
 */

/** Escape the five HTML-significant characters for safe interpolation into
 *  element text and double-quoted attribute values. */
export const escHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
