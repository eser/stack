// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Where Deno.bundle() writes its files, and how the deno-bundler backend moves
 * them to the names the entry keys ask for.
 *
 * Deno.bundle() writes each entry point at its path below the lowest common
 * ancestor directory of all the entry points, with the extension replaced by
 * `.js`, and writes shared chunks at the top of the output directory. With
 * entry points in two unrelated directories the common ancestor is the file
 * system root, so the outputs carry their whole absolute path. The helpers
 * here predict those paths and rewrite the relative imports and source maps,
 * external or inline, of a file that moves.
 *
 * Paths inside the output directory (`denoName`, `finalName`) always use `/`.
 *
 * @module
 */

import * as base64 from "@std/encoding/base64";
import * as crossRuntime from "@eserstack/standards/cross-runtime";

const toPosix = (path: string): string =>
  crossRuntime.runtime.path.sep === "/"
    ? path
    : path.split(crossRuntime.runtime.path.sep).join("/");

const splitPosix = (path: string): string[] =>
  path.split("/").filter((segment) => segment !== "" && segment !== ".");

const dirnamePosix = (path: string): string =>
  splitPosix(path).slice(0, -1).join("/");

/**
 * Returns the lowest common ancestor directory of the given files, as
 * Deno.bundle() computes it for its output layout.
 *
 * @param filePaths - The entry point files; relative paths resolve against the
 *   working directory
 * @returns The absolute directory; the root when the files share nothing more
 */
export const lowestCommonAncestorDir = (
  filePaths: readonly string[],
): string => {
  const path = crossRuntime.runtime.path;
  let common: string[] | null = null;
  let root = "";

  for (const filePath of filePaths) {
    const directory = path.dirname(path.resolve(filePath));
    const parsedRoot = path.parse(directory).root;
    const segments = directory.slice(parsedRoot.length).split(path.sep)
      .filter((segment) => segment !== "");

    if (common === null) {
      common = segments;
      root = parsedRoot;
      continue;
    }

    if (parsedRoot !== root) {
      // Different drives share no directory; Deno.bundle cannot lay them out
      // under one output directory either.
      return root;
    }

    let shared = 0;
    while (
      shared < common.length && shared < segments.length &&
      common[shared] === segments[shared]
    ) {
      shared += 1;
    }
    common = common.slice(0, shared);
  }

  if (common === null) {
    return path.resolve(".");
  }

  return common.length === 0 ? root : path.join(root, ...common);
};

/**
 * Returns the path, inside the output directory, where Deno.bundle() writes the
 * bundle of one entry point.
 *
 * @param entryPath - The entry point file
 * @param outbase - The common ancestor from {@link lowestCommonAncestorDir}
 * @returns A `/`-separated path such as `src/app.js`
 */
export const denoOutputName = (entryPath: string, outbase: string): string => {
  const path = crossRuntime.runtime.path;
  const absolute = path.resolve(entryPath);
  const extension = path.extname(absolute);
  const withoutExtension = extension === ""
    ? absolute
    : absolute.slice(0, -extension.length);

  return toPosix(path.relative(outbase, `${withoutExtension}.js`));
};

/** A relative import found in a bundle file. */
export interface BundleImport {
  /** The imported file's final name inside the output directory. */
  readonly path: string;
  /** `import-statement` for `import`/`export ... from`, else `dynamic-import`. */
  readonly kind: "import-statement" | "dynamic-import";
}

/** The code of a moved bundle file and the bundle files it imports. */
export interface RewrittenImports {
  readonly code: string;
  readonly imports: readonly BundleImport[];
}

// `from "x"`, `import "x"` and `import("x")` with a relative specifier. The
// quantifiers are bounded so a long run of spaces cannot backtrack for long.
const RELATIVE_SPECIFIER =
  /(\bfrom\s{0,100}|\bimport\s{0,100}(\(\s{0,100})?)(["'])(\.{1,2}\/[^"'\n]{1,500})\3/g;

/**
 * Resolves `specifier` against the directory of `fromName`. Returns null when
 * it climbs above the output directory.
 */
const resolveInBundle = (
  fromName: string,
  specifier: string,
): string | null => {
  const resolved = splitPosix(dirnamePosix(fromName));

  for (const segment of splitPosix(specifier)) {
    if (segment !== "..") {
      resolved.push(segment);
      continue;
    }
    if (resolved.length === 0) {
      return null;
    }
    resolved.pop();
  }

  return resolved.join("/");
};

/** The specifier that reaches `toName` from a file at `fromName`. */
const relativeSpecifier = (fromName: string, toName: string): string => {
  const fromDir = splitPosix(dirnamePosix(fromName));
  const target = splitPosix(toName);
  let shared = 0;

  while (
    shared < fromDir.length && shared < target.length - 1 &&
    fromDir[shared] === target[shared]
  ) {
    shared += 1;
  }

  const rest = target.slice(shared).join("/");
  const ups = fromDir.length - shared;

  return ups === 0 ? `./${rest}` : `${"../".repeat(ups)}${rest}`;
};

/**
 * Points every relative import of a bundle file at the final name of the file
 * it imports, as seen from the file's own final name.
 *
 * @param code - The file as Deno.bundle() wrote it
 * @param denoName - Where Deno.bundle() wrote the file
 * @param finalName - Where the backend writes the file
 * @param finalNames - Deno name to final name, for every file of the bundle
 * @returns The rewritten code and the bundle files it imports, in order of
 *   first appearance; imports of files outside the bundle stay as they are
 */
export const rewriteRelativeImports = (
  code: string,
  denoName: string,
  finalName: string,
  finalNames: ReadonlyMap<string, string>,
): RewrittenImports => {
  const imports: BundleImport[] = [];
  const seen = new Set<string>();

  const rewritten = code.replace(
    RELATIVE_SPECIFIER,
    (
      match: string,
      prefix: string,
      call: string | undefined,
      quote: string,
      specifier: string,
    ) => {
      const target = resolveInBundle(denoName, specifier);
      const targetFinalName = target === null
        ? undefined
        : finalNames.get(target);

      if (targetFinalName === undefined) {
        return match;
      }

      const kind = call === undefined ? "import-statement" : "dynamic-import";
      const key = `${kind}:${targetFinalName}`;
      if (!seen.has(key)) {
        seen.add(key);
        imports.push({ path: targetFinalName, kind });
      }

      const newSpecifier = relativeSpecifier(finalName, targetFinalName);
      return `${prefix}${quote}${newSpecifier}${quote}`;
    },
  );

  return { code: rewritten, imports };
};

/**
 * Sets the `sourceMappingURL` comment of a file to `mapUrl`, replacing the one
 * Deno.bundle() wrote, if any. Appending keeps every mapped line in place.
 */
export const setSourceMappingUrl = (code: string, mapUrl: string): string => {
  const comment = `//# sourceMappingURL=${mapUrl}`;
  const existing = /^\/\/# sourceMappingURL=.*$/m;

  if (existing.test(code)) {
    return code.replace(existing, comment);
  }

  return code.endsWith("\n") ? `${code}${comment}\n` : `${code}\n${comment}\n`;
};

/**
 * Rewrites the `sources` of a source map that moves from `fromDir` to `toDir`,
 * so each relative source still names the same file.
 *
 * Sources with a scheme (`file:`, `https:`) or an absolute path, and maps with
 * a `sourceRoot`, stay as they are.
 *
 * @param mapText - The source map JSON
 * @param fromDir - The absolute directory Deno.bundle() wrote the map in
 * @param toDir - The absolute directory the backend writes the map in
 * @returns The rewritten source map JSON
 * @throws {SyntaxError} when `mapText` is not JSON
 */
export const relocateSourceMap = (
  mapText: string,
  fromDir: string,
  toDir: string,
): string => {
  const path = crossRuntime.runtime.path;
  const map = JSON.parse(mapText) as {
    sources?: unknown;
    sourceRoot?: unknown;
  };

  const hasSourceRoot = typeof map.sourceRoot === "string" &&
    map.sourceRoot !== "";
  if (hasSourceRoot || !Array.isArray(map.sources)) {
    return mapText;
  }

  map.sources = map.sources.map((source: unknown) => {
    if (
      typeof source !== "string" || /^[a-z][a-z0-9+.-]*:/i.test(source) ||
      path.isAbsolute(source)
    ) {
      return source;
    }

    return toPosix(path.relative(toDir, path.resolve(fromDir, source)));
  });

  return JSON.stringify(map);
};

// The comment Deno.bundle() writes for `sourcemap: "inline"`.
const INLINE_SOURCE_MAP =
  /^\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([A-Za-z0-9+/]+={0,2})[ \t]*$/m;

/**
 * Rewrites the `sources` of the inline source map at the end of `code`, for a
 * file that moves from `fromDir` to `toDir`, the same way
 * {@link relocateSourceMap} does for a separate map file.
 *
 * @param code - The bundle file, with or without an inline source map
 * @param fromDir - The absolute directory Deno.bundle() wrote the file in
 * @param toDir - The absolute directory the backend writes the file in
 * @returns The code with the relocated map; code without an inline map
 *   unchanged
 * @throws {SyntaxError} when the inline map is not JSON
 */
export const relocateInlineSourceMap = (
  code: string,
  fromDir: string,
  toDir: string,
): string => {
  const match = INLINE_SOURCE_MAP.exec(code);
  const encoded = match?.[1];
  if (match === null || encoded === undefined) {
    return code;
  }

  const mapText = new TextDecoder().decode(base64.decodeBase64(encoded));
  const relocated = relocateSourceMap(mapText, fromDir, toDir);
  const comment = `//# sourceMappingURL=data:application/json;base64,${
    base64.encodeBase64(relocated)
  }`;

  return `${code.slice(0, match.index)}${comment}${
    code.slice(match.index + match[0].length)
  }`;
};
