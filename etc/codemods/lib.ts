// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared helpers of the Deno-to-Node codemods in this folder: file listing,
 * parsing with oxc-parser, and source edits. The folder is removed in M1-T37
 * (TASK-231), once the codemods have run; until then deno.json and the
 * runtime-API validator exclude it, because it is Node code.
 *
 * @module
 */

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as oxc from "oxc-parser";

/** An oxc AST node; the codemods read only the fields they need. */
// deno-lint-ignore no-explicit-any
export type Node = any;

/** A replacement of src[start, end) by what produce() returns. */
export type Edit = {
  readonly start: number;
  readonly end: number;
  readonly produce: (render: (start: number, end: number) => string) => string;
};

/** Parses TypeScript or TSX; returns null when the file does not parse. */
export const parse = (path: string, src: string): Node | null => {
  const lang = path.endsWith(".tsx") ? "tsx" : "ts";
  const result = oxc.parseSync(path, src, { lang, sourceType: "module" });
  if (result.errors.length > 0) {
    return null;
  }

  return result.program;
};

/** A comment as oxc-parser reports it. */
export type Comment = {
  readonly type: "Line" | "Block";
  readonly value: string;
  readonly start: number;
  readonly end: number;
};

/** Parses like parse and also returns the comments; null when it does not parse. */
export const parseWithComments = (
  path: string,
  src: string,
): { program: Node; comments: readonly Comment[] } | null => {
  const lang = path.endsWith(".tsx") || path.endsWith(".jsx") ? "tsx" : "ts";
  const result = oxc.parseSync(path, src, { lang, sourceType: "module" });
  if (result.errors.length > 0) {
    return null;
  }

  return { program: result.program, comments: result.comments as readonly Comment[] };
};

/** Calls visit for node and every node under it, parents first. */
export const walk = (node: Node, visit: (node: Node) => void): void => {
  if (node === null || typeof node !== "object" || typeof node.type !== "string") {
    return;
  }

  visit(node);

  for (const key of oxc.visitorKeys[node.type] ?? []) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        walk(item, visit);
      }
    } else {
      walk(child, visit);
    }
  }
};

/**
 * Applies edits to src. An edit may contain other edits: its produce() gets a
 * render function that returns any range of the source with the inner edits
 * applied. Overlapping edits that do not nest keep the first one.
 */
export const applyEdits = (src: string, edits: readonly Edit[]): string => {
  const sorted = [...edits].sort((a, b) => a.start - b.start || b.end - a.end);

  const render = (from: number, to: number): string => {
    let out = "";
    let pos = from;

    for (const edit of sorted) {
      if (edit.start < pos || edit.start < from || edit.end > to) {
        continue;
      }

      out += src.slice(pos, edit.start) + edit.produce(render);
      pos = edit.end;
    }

    return out + src.slice(pos, to);
  };

  return render(0, src.length);
};

/** The 1-based line of an offset. */
export const lineOf = (src: string, offset: number): number => {
  let line = 1;
  for (let i = 0; i < offset; i++) {
    if (src.charCodeAt(i) === 10) {
      line++;
    }
  }

  return line;
};

export type CliOptions = {
  readonly dryRun: boolean;
  readonly filters: readonly string[];
  readonly paths: readonly string[];
};

/**
 * Reads `[--dry-run] [--filter <substring>]... [path...]`. With no paths the
 * codemod runs on every git-tracked or untracked, not ignored file.
 */
export const parseCliArgs = (argv: readonly string[]): CliOptions => {
  let dryRun = false;
  const filters: string[] = [];
  const paths: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--filter") {
      const value = argv[++i];
      if (value === undefined) {
        throw new Error("--filter needs a value");
      }
      filters.push(value);
    } else {
      paths.push(arg);
    }
  }

  return { dryRun, filters, paths };
};

const TS_EXTENSIONS = /\.(?:ts|tsx|mts|cts)$/;

/** TypeScript and JavaScript sources, for the codemods that read both. */
export const JS_AND_TS_EXTENSIONS: RegExp = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/** Lists the source files the codemod should read. */
export const listFiles = (
  options: CliOptions,
  extensions: RegExp = TS_EXTENSIONS,
): string[] => {
  const listed = options.paths.length > 0
    ? options.paths.flatMap((path) =>
      fs.statSync(path).isDirectory()
        ? fs.readdirSync(path, { recursive: true, encoding: "utf8" }).map((p) =>
          `${path.replace(/\/$/, "")}/${p}`
        )
        : [path]
    )
    : childProcess.execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    ).split("\n");

  return listed
    .filter((path) => extensions.test(path))
    .filter((path) => !path.includes("node_modules/"))
    .filter((path) => !path.startsWith("etc/codemods/") && !path.startsWith("third-party/"))
    // git ls-files still lists a file deleted from the working tree.
    .filter((path) => fs.existsSync(path))
    .filter((path) =>
      options.filters.length === 0 ||
      options.filters.some((filter) => path.includes(filter))
    )
    .sort();
};
