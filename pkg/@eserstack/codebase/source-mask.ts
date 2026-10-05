// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tells code apart from comments and string literals in a JavaScript or
 * TypeScript source, so the pattern-based validators skip a match that sits
 * in a comment, a JSDoc example or a string.
 *
 * This is a scanner, not a lexer. A quote or backtick inside a regular
 * expression literal reads as the start of a string; a single- or
 * double-quoted string ends at the end of its line, which bounds that error to
 * one line.
 *
 * @module
 */

/**
 * Marks with 1 every position of `content` that sits inside a comment or a
 * string literal. The text of a template literal is masked; its `${...}`
 * interpolations are code, so `${process.env.X}` still counts as code.
 */
export const codeMask = (content: string): Uint8Array => {
  const mask = new Uint8Array(content.length);
  const length = content.length;
  // Brace depth at which each open template interpolation started; a `}` at
  // that depth closes the interpolation and resumes the template text.
  const interpolations: number[] = [];
  let depth = 0;
  let i = 0;

  // Masks template text up to the closing backtick or the next `${`.
  const scanTemplateText = (): void => {
    while (i < length) {
      const ch = content[i];
      if (ch === "\\") {
        mask[i++] = 1;
        if (i < length) mask[i++] = 1;
        continue;
      }
      if (ch === "`") {
        mask[i++] = 1;
        return;
      }
      if (ch === "$" && content[i + 1] === "{") {
        mask[i++] = 1;
        mask[i++] = 1;
        interpolations.push(depth);
        return;
      }
      mask[i++] = 1;
    }
  };

  // Masks a single- or double-quoted string, which cannot span lines.
  const scanQuoted = (quote: string): void => {
    mask[i++] = 1;
    while (i < length) {
      const ch = content[i];
      if (ch === "\\") {
        mask[i++] = 1;
        if (i < length) mask[i++] = 1;
        continue;
      }
      if (ch === "\n") return;
      mask[i++] = 1;
      if (ch === quote) return;
    }
  };

  while (i < length) {
    const ch = content[i];
    const next = content[i + 1];

    if (ch === "/" && next === "/") {
      while (i < length && content[i] !== "\n") mask[i++] = 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = content.indexOf("*/", i + 2);
      const stop = end < 0 ? length : end + 2;
      while (i < stop) mask[i++] = 1;
      continue;
    }
    if (ch === "`") {
      mask[i++] = 1;
      scanTemplateText();
      continue;
    }
    if (ch === '"' || ch === "'") {
      scanQuoted(ch);
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      if (interpolations.at(-1) === depth) {
        interpolations.pop();
        mask[i++] = 1;
        scanTemplateText();
        continue;
      }
      depth--;
    }
    i++;
  }

  return mask;
};

/** The 1-based line number of a character index in `content`. */
export const lineOf = (content: string, index: number): number =>
  content.slice(0, index).split("\n").length;
