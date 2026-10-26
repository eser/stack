// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * An RFC 4180 CSV writer and a streaming reader for the csv format.
 *
 * The writer quotes a field that holds the delimiter, a quote, CR or LF,
 * doubles the quotes inside it, and ends every row with CRLF. The reader
 * takes LF or CRLF row endings, reads quoted fields across line breaks and
 * across the chunks pushed into it, and skips blank lines.
 *
 * @module
 */

const QUOTE = '"';
const CR = "\r";
const LF = "\n";
const CRLF = "\r\n";

/** Thrown when CSV text breaks the quoting rules of RFC 4180. */
export class CsvParseError extends Error {
  /** The 1-based number of the record that failed, blank lines included. */
  readonly record: number;

  constructor(record: number, reason: string) {
    super(`CSV record ${record}: ${reason}`);
    this.name = "CsvParseError";
    this.record = record;
  }
}

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

/** Reads records from CSV text that arrives in chunks. */
export type RecordParser = {
  /** Adds a chunk and returns the records it completed. */
  readonly push: (chunk: string) => string[][];
  /** Ends the input and returns the record left in the buffer, if any. */
  readonly flush: () => string[][];
};

/** One record read from the buffer. */
type ParsedRecord = {
  readonly fields: string[];
  /** The buffer offset after the record and its line ending. */
  readonly end: number;
  /** The record is a blank line: no quotes and only whitespace. */
  readonly blank: boolean;
};

/**
 * Reads the record that starts at `start`. Returns null when the buffer ends
 * before the record does and more input may follow (`final` false).
 *
 * @throws {CsvParseError} On a quote inside an unquoted field, text after a
 *   closing quote, or (when `final`) a quoted field left open
 */
const parseRecord = (
  text: string,
  start: number,
  delimiter: string,
  final: boolean,
  record: number,
): ParsedRecord | null => {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  let index = start;

  /** The buffer ends inside a delimiter or a line ending that may go on. */
  const isPartial = (from: number): boolean =>
    !final &&
    text.length - from < delimiter.length &&
    delimiter.startsWith(text.slice(from));

  const finish = (end: number): ParsedRecord => {
    fields.push(field);
    const blank = !quoted && fields.join(delimiter).trim() === "";

    return { fields, end, blank };
  };

  while (true) {
    // At the start of a field.
    if (text[index] === QUOTE) {
      quoted = true;
      index += 1;

      // Inside the quoted field, up to its closing quote.
      while (true) {
        if (index >= text.length) {
          if (final) {
            throw new CsvParseError(record, "unterminated quoted field");
          }

          return null;
        }

        const char = text[index];
        if (char !== QUOTE) {
          field += char;
          index += 1;
          continue;
        }

        if (index + 1 >= text.length && !final) {
          // A doubled quote may be split across chunks.
          return null;
        }

        if (text[index + 1] === QUOTE) {
          field += QUOTE;
          index += 2;
          continue;
        }

        index += 1;
        break;
      }

      // After the closing quote: a delimiter, a line ending or the end.
      if (index >= text.length) {
        return final ? finish(index) : null;
      }

      if (text.startsWith(delimiter, index)) {
        fields.push(field);
        field = "";
        index += delimiter.length;
        continue;
      }

      if (text[index] === LF) {
        return finish(index + 1);
      }

      if (text[index] === CR) {
        if (index + 1 >= text.length) {
          return final ? finish(index + 1) : null;
        }

        if (text[index + 1] === LF) {
          return finish(index + 2);
        }
      }

      if (isPartial(index)) {
        return null;
      }

      throw new CsvParseError(record, "text after a closing quote");
    }

    // Inside an unquoted field, up to a delimiter or a line ending.
    while (true) {
      if (index >= text.length) {
        return final ? finish(index) : null;
      }

      if (text.startsWith(delimiter, index)) {
        break;
      }

      const char = text[index];
      if (char === LF) {
        return finish(index + 1);
      }

      if (char === CR) {
        if (index + 1 >= text.length) {
          return final ? finish(index + 1) : null;
        }

        if (text[index + 1] === LF) {
          return finish(index + 2);
        }
      }

      if (char === QUOTE) {
        throw new CsvParseError(record, "a quote inside an unquoted field");
      }

      if (isPartial(index)) {
        return null;
      }

      field += char;
      index += 1;
    }

    fields.push(field);
    field = "";
    index += delimiter.length;
  }
};

/**
 * Creates a reader of CSV records. Blank lines are skipped; every other
 * record is returned as its fields, in order.
 *
 * @throws {TypeError} When the delimiter is not usable
 */
export const createRecordParser = (delimiter: string): RecordParser => {
  assertDelimiter(delimiter);

  let buffer = "";
  let records = 0;

  const drain = (final: boolean): string[][] => {
    const complete: string[][] = [];
    let offset = 0;

    while (offset < buffer.length) {
      const parsed = parseRecord(buffer, offset, delimiter, final, records + 1);
      if (parsed === null) {
        break;
      }

      records += 1;
      offset = parsed.end;
      if (!parsed.blank) {
        complete.push(parsed.fields);
      }
    }

    // A record still open is read again from its start once more input
    // arrives.
    buffer = buffer.slice(offset);

    return complete;
  };

  return {
    push(chunk: string): string[][] {
      buffer += chunk;

      return drain(false);
    },

    flush(): string[][] {
      const rest = drain(true);
      buffer = "";

      return rest;
    },
  };
};
