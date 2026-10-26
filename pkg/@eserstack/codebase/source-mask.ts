// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tells code apart from comments and string literals in a JavaScript or
 * TypeScript source, so the pattern-based validators skip a match that sits
 * in a comment, a JSDoc example or a string.
 *
 * This is a scanner, not a lexer. It tells a regular expression literal from
 * a division by the previous significant token, as the Go lexer in
 * pkg/ajan/codebasefx does, so a quote or backtick inside a regex is not read
 * as the start of a string. A single- or double-quoted string ends at the end
 * of its line, which bounds any other misreading to one line.
 *
 * @module
 */

/**
 * Marks with 1 every position of `content` that sits inside a comment, a
 * string literal or a regular expression literal. The text of a template
 * literal is masked; its `${...}` interpolations are code, so
 * `${process.env.X}` still counts as code.
 */
const IDENT_CHAR = /[A-Za-z0-9_$]/;

// Keywords after which a slash starts a regular expression, not a division.
const REGEX_AFTER_KEYWORD: ReadonlySet<string> = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "case",
  "do",
  "else",
  "yield",
  "await",
]);

export const codeMask = (content: string): Uint8Array => {
  const mask = new Uint8Array(content.length);
  const length = content.length;
  // Brace depth at which each open template interpolation started; a `}` at
  // that depth closes the interpolation and resumes the template text.
  const interpolations: number[] = [];
  let depth = 0;
  let i = 0;
  // The previous significant token, which decides whether a `/` starts a
  // regular expression: "value" for a literal, a word, or a punctuator.
  let previous = "";

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

  // Masks a regular expression literal and its flags; it cannot span lines.
  const scanRegex = (): void => {
    let inClass = false;
    mask[i++] = 1;
    while (i < length) {
      const ch = content[i];
      if (ch === "\n") return;
      if (ch === "\\") {
        mask[i++] = 1;
        if (i < length && content[i] !== "\n") mask[i++] = 1;
        continue;
      }
      mask[i++] = 1;
      if (ch === "[") inClass = true;
      else if (ch === "]") inClass = false;
      else if (ch === "/" && !inClass) break;
    }
    while (i < length && IDENT_CHAR.test(content[i]!)) mask[i++] = 1;
  };

  const regexAllowed = (): boolean => {
    if (previous === "" || previous === "value") {
      return previous === "";
    }
    if (IDENT_CHAR.test(previous[0]!)) {
      return REGEX_AFTER_KEYWORD.has(previous);
    }

    return previous !== ")" && previous !== "]";
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
      previous = "value";
      continue;
    }
    if (ch === '"' || ch === "'") {
      scanQuoted(ch);
      previous = "value";
      continue;
    }
    if (ch === "/" && regexAllowed()) {
      scanRegex();
      previous = "value";
      continue;
    }
    if (IDENT_CHAR.test(ch!)) {
      const start = i;
      while (i < length && IDENT_CHAR.test(content[i]!)) i++;
      const word = content.slice(start, i);
      previous = /^[0-9]/.test(word) ? "value" : word;
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      if (interpolations.at(-1) === depth) {
        interpolations.pop();
        mask[i++] = 1;
        scanTemplateText();
        previous = "value";
        continue;
      }
      depth--;
    }
    if (ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r") {
      previous = ch!;
    }
    i++;
  }

  return mask;
};

/** The 1-based line number of a character index in `content`. */
export const lineOf = (content: string, index: number): number =>
  content.slice(0, index).split("\n").length;
