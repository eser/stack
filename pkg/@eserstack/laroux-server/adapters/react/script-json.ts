// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Escapes serialized JSON for embedding inside an HTML <script> element.
 *
 * `<`, `>` and `&` become `<`, `>` and `&`, so no value can
 * close the element (`</script`) or open an HTML comment (`<!--`) that
 * changes how the rest of the script is parsed. U+2028 and U+2029 become
 * escapes because they end a line in older JavaScript parsers. JSON only
 * contains these characters inside string literals, where the escapes decode
 * back to the same string, so the result is still valid JSON and a valid
 * JavaScript expression.
 */
export const escapeJsonForScript = (json: string): string =>
  json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
