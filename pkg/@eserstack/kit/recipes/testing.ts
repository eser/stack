// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Helpers for the kit tests.
 *
 * @module
 */

/**
 * The static `ReadableStream.from`, which Node has and the TypeScript DOM
 * library does not declare yet.
 */
type ReadableStreamConstructorWithFrom = typeof ReadableStream & {
  from<T>(source: Iterable<T> | AsyncIterable<T>): ReadableStream<T>;
};

/** Returns a stream of the values of `source`, through `ReadableStream.from`. */
export const readableStreamFrom = <T>(
  source: Iterable<T> | AsyncIterable<T>,
): ReadableStream<T> => {
  return (ReadableStream as ReadableStreamConstructorWithFrom).from(source);
};

/** One entry of a test archive built by {@link tarArchive}. */
export type TarFixtureEntry =
  | {
      readonly type: "file";
      readonly path: string;
      readonly content: string | Uint8Array;
    }
  | { readonly type: "directory"; readonly path: string }
  | {
      readonly type: "symlink";
      readonly path: string;
      readonly linkname: string;
    }
  | {
      /** Any typeflag, such as "g" for the pax global header of GitHub tarballs. */
      readonly type: "raw";
      readonly path: string;
      readonly typeflag: string;
      readonly content: string;
    };

const BLOCK = 512;
const encoder = new TextEncoder();

/**
 * Splits a path into the ustar prefix (up to 155 bytes) and name (up to 100
 * bytes) fields, at a slash.
 */
const splitUstarPath = (path: string): [prefix: string, name: string] => {
  if (encoder.encode(path).length <= 100) {
    return ["", path];
  }

  for (
    let cut = path.indexOf("/");
    cut !== -1;
    cut = path.indexOf("/", cut + 1)
  ) {
    const prefix = path.slice(0, cut);
    const name = path.slice(cut + 1);
    if (
      encoder.encode(prefix).length <= 155 &&
      encoder.encode(name).length <= 100
    ) {
      return [prefix, name];
    }
  }

  throw new RangeError(
    `tar fixture: the path ${path} does not fit a ustar header`,
  );
};

/** Writes `value` into `header` at `offset`, as bytes. */
const writeField = (
  header: Uint8Array,
  offset: number,
  value: string,
): void => {
  header.set(encoder.encode(value), offset);
};

/** An octal number field of `width` bytes, NUL-terminated. */
const octal = (value: number, width: number): string =>
  `${value.toString(8).padStart(width - 1, "0")}\0`;

/** One ustar header block and its content padded to whole blocks. */
const ustarEntry = (
  path: string,
  typeflag: string,
  mode: number,
  body: Uint8Array,
  linkname = "",
): Uint8Array => {
  const entry = new Uint8Array(BLOCK * (1 + Math.ceil(body.length / BLOCK)));
  const header = entry.subarray(0, BLOCK);
  const [prefix, name] = splitUstarPath(path);

  writeField(header, 0, name);
  writeField(header, 100, octal(mode, 8));
  writeField(header, 108, octal(0, 8));
  writeField(header, 116, octal(0, 8));
  writeField(header, 124, octal(body.length, 12));
  writeField(header, 136, octal(0, 12));
  // The checksum field counts as eight spaces while the header is summed.
  writeField(header, 148, "        ");
  writeField(header, 156, typeflag);
  writeField(header, 157, linkname);
  writeField(header, 257, "ustar\u000000");
  writeField(header, 345, prefix);

  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeField(header, 148, `${checksum.toString(8).padStart(6, "0")}\0 `);
  entry.set(body, BLOCK);

  return entry;
};

/**
 * Builds an uncompressed ustar archive of `entries`, followed by the two
 * zero blocks that end it, so tests need no tar library to make fixtures.
 */
export const tarArchive = (entries: readonly TarFixtureEntry[]): Uint8Array => {
  const parts = entries.map((entry): Uint8Array => {
    switch (entry.type) {
      case "file":
        return ustarEntry(
          entry.path,
          "0",
          0o644,
          typeof entry.content === "string"
            ? encoder.encode(entry.content)
            : entry.content,
        );
      case "directory":
        return ustarEntry(
          entry.path.endsWith("/") ? entry.path : `${entry.path}/`,
          "5",
          0o755,
          new Uint8Array(0),
        );
      case "symlink":
        return ustarEntry(
          entry.path,
          "2",
          0o777,
          new Uint8Array(0),
          entry.linkname,
        );
      case "raw":
        return ustarEntry(
          entry.path,
          entry.typeflag,
          0o644,
          encoder.encode(entry.content),
        );
    }
  });
  parts.push(new Uint8Array(2 * BLOCK));

  const archive = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    archive.set(part, offset);
    offset += part.length;
  }

  return archive;
};

/** Gzips the given byte arrays, one after another, into one stream. */
export const gzipStream = (
  ...parts: readonly Uint8Array[]
): ReadableStream<Uint8Array> => {
  return readableStreamFrom(parts).pipeThrough(
    new CompressionStream("gzip") as unknown as TransformStream<
      Uint8Array,
      Uint8Array
    >,
  );
};

/** A gzipped archive of `entries`, as codeload.github.com serves one. */
export const gzippedTarball = (
  entries: readonly TarFixtureEntry[],
): ReadableStream<Uint8Array> => gzipStream(tarArchive(entries));
