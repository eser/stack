// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The RFC 4180 CSV writer of the csv format.
 *
 * The writer quotes a field that holds the delimiter, a quote, CR or LF,
 * doubles the quotes inside it, and ends every row with CRLF. The reader runs
 * in Go (`formatfx.ReadCSV`, through the bridge's `formatReadCsv`).
 *
 * @module
 */

const QUOTE = '"';
const CR = "\r";
const LF = "\n";
const CRLF = "\r\n";

/**
 * Checks that `delimiter` can separate fields: it must not be empty or hold
 * a quote, CR or LF, since those carry meaning of their own.
 *
 * @throws {TypeError} When the delimiter is not usable
 */
export const assertDelimiter = (delimiter: string): void => {
  if (
    delimiter === "" ||
    delimiter.includes(QUOTE) ||
    delimiter.includes(CR) ||
    delimiter.includes(LF)
  ) {
    throw new TypeError(
      `CSV delimiter ${JSON.stringify(delimiter)} must be non-empty and hold no quote, CR or LF`,
    );
  }
};

/**
 * Writes one field: null and undefined as an empty field, an object as JSON,
 * anything else as its string. The field is quoted when it holds the
 * delimiter, a quote, CR or LF.
 */
export const formatField = (value: unknown, delimiter: string): string => {
  if (value === null || value === undefined) {
    return "";
  }

  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  const needsQuotes =
    text.includes(delimiter) ||
    text.includes(QUOTE) ||
    text.includes(CR) ||
    text.includes(LF);

  return needsQuotes
    ? `${QUOTE}${text.replaceAll(QUOTE, QUOTE + QUOTE)}${QUOTE}`
    : text;
};

/**
 * Writes one row of fields, ended with CRLF.
 *
 * @throws {TypeError} When the delimiter is not usable
 */
export const formatRow = (
  values: readonly unknown[],
  delimiter: string,
): string => {
  assertDelimiter(delimiter);

  return (
    values.map((value) => formatField(value, delimiter)).join(delimiter) + CRLF
  );
};
