// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Rewrites `Deno.bench` files to mitata (M0-T19, decision-36). Removed in
 * M1-T37 (TASK-231) after M1-T4 has run it.
 *
 * The repository's benches have one shape, a top-level
 * `Deno.bench(name, { group, baseline }, fn)`. All benches of one group move
 * to the place of the group's first bench, as
 *
 *   mitata.group(group, () => {
 *     mitata.summary(() => {
 *       mitata.bench(name, fn).baseline();
 *       mitata.bench(other, fn);
 *     });
 *   });
 *
 * and a bench without a group becomes `mitata.bench(name, fn)` in place.
 * Moving a bench is safe because mitata runs bench bodies only in
 * `mitata.run()`, which the codemod appends at the end of the file. Any other
 * shape or option is left as it is and listed.
 *
 *   node etc/codemods/benches.ts [--dry-run] [--filter <substring>]... [path...]
 *
 * @module
 */

import * as fs from "node:fs";
import * as lib from "./lib.ts";

type Node = lib.Node;

export type Stats = {
  files: number;
  changed: number;
  benches: number;
  groups: number;
  baselines: number;
  unhandled: string[];
};

export const emptyStats = (): Stats => ({
  files: 0,
  changed: 0,
  benches: 0,
  groups: 0,
  baselines: 0,
  unhandled: [],
});

const isDenoBench = (callee: Node): boolean =>
  callee?.type === "MemberExpression" && !callee.computed &&
  callee.object?.type === "Identifier" && callee.object.name === "Deno" &&
  callee.property?.name === "bench";

const isFunction = (node: Node): boolean =>
  node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression";

const keyName = (property: Node): string | undefined =>
  property?.type === "Property" && !property.computed
    ? property.key?.name ?? property.key?.value
    : undefined;

/** A name that is safe to evaluate early: a literal or a plain template. */
const isStaticName = (node: Node): boolean =>
  node?.type === "Literal" ||
  (node?.type === "TemplateLiteral" && node.expressions.length === 0);

/** Indents every line after the first by prefix. */
const indentRest = (text: string, prefix: string): string =>
  text.split("\n").map((line, i) => (i === 0 || line === "" ? line : prefix + line)).join("\n");

type Bench = {
  readonly statement: Node;
  readonly name: string;
  readonly fn: string;
  readonly group: string | null;
  readonly baseline: boolean;
};

/** Transforms one file's source; returns the new source and counts into stats. */
export const transformSource = (path: string, src: string, stats: Stats): string => {
  const program = lib.parse(path, src);
  if (program === null) {
    stats.unhandled.push(`${path}: does not parse`);

    return src;
  }

  const benches: Bench[] = [];

  for (const statement of program.body) {
    const call = statement.type === "ExpressionStatement" ? statement.expression : null;
    if (call?.type !== "CallExpression" || !isDenoBench(call.callee)) {
      continue;
    }

    const site = `${path}:${lib.lineOf(src, statement.start)}`;
    const [nameNode, optionsNode, fnNode] = call.arguments;
    let options: Node = null;
    let fn: Node = null;

    if (call.arguments.length === 3 && optionsNode?.type === "ObjectExpression" && isFunction(fnNode)) {
      options = optionsNode;
      fn = fnNode;
    } else if (call.arguments.length === 2 && isFunction(optionsNode)) {
      fn = optionsNode;
    }

    if (fn === null || !isStaticName(nameNode)) {
      stats.unhandled.push(`${site}: Deno.bench in an unknown shape`);
      continue;
    }

    let group: string | null = null;
    let baseline = false;
    let known = true;

    for (const property of options?.properties ?? []) {
      const key = keyName(property);
      if (key === "group") {
        group = property.shorthand ? property.key.name : src.slice(property.value.start, property.value.end);
      } else if (key === "baseline" && property.value?.type === "Literal" && typeof property.value.value === "boolean") {
        baseline = property.value.value;
      } else {
        stats.unhandled.push(`${site}: option ${key ?? "(spread or computed)"} has no mitata equivalent`);
        known = false;
      }
    }

    if (!known) {
      continue;
    }

    benches.push({
      statement,
      name: src.slice(nameNode.start, nameNode.end),
      fn: src.slice(fn.start, fn.end),
      group,
      baseline,
    });
  }

  if (benches.length === 0) {
    return src;
  }

  const edits: lib.Edit[] = [];
  const groups = new Map<string, Bench[]>();

  for (const bench of benches) {
    stats.benches++;
    stats.baselines += bench.baseline ? 1 : 0;

    if (bench.group === null) {
      edits.push({
        start: bench.statement.start,
        end: bench.statement.end,
        produce: () =>
          `mitata.bench(${bench.name}, ${bench.fn})${bench.baseline ? ".baseline()" : ""};`,
      });
      continue;
    }

    const members = groups.get(bench.group) ?? [];
    members.push(bench);
    groups.set(bench.group, members);
  }

  for (const [group, members] of groups) {
    stats.groups++;
    const lines = members.map((bench) =>
      `    mitata.bench(${bench.name}, ${indentRest(bench.fn, "    ")})${bench.baseline ? ".baseline()" : ""};`
    );
    const block = `mitata.group(${group}, () => {\n  mitata.summary(() => {\n${lines.join("\n")}\n  });\n});`;

    members.forEach((bench, i) => {
      const lineEnd = src.indexOf("\n", bench.statement.end);
      // A moved bench takes its line with it, and one blank line after it
      // when a blank line comes before it too.
      let end = i === 0 || lineEnd === -1 ? bench.statement.end : lineEnd + 1;
      const start = i === 0
        ? bench.statement.start
        : src.lastIndexOf("\n", bench.statement.start - 1) + 1;
      if (i > 0 && src[end] === "\n" && src.slice(Math.max(0, start - 2), start) === "\n\n") {
        end += 1;
      }

      edits.push({ start, end, produce: () => (i === 0 ? block : "") });
    });
  }

  let out = lib.applyEdits(src, edits).trimEnd();

  out += "\n\n// oxlint-disable-next-line node/no-top-level-await\nawait mitata.run();\n";

  const firstImport = program.body.find((s: Node) => s.type === "ImportDeclaration");
  const hasMitata = program.body.some((s: Node) => s.type === "ImportDeclaration" && s.source?.value === "mitata");
  if (!hasMitata) {
    const at = firstImport !== undefined ? firstImport.start : program.body[0]?.start ?? 0;
    out = `${out.slice(0, at)}import * as mitata from "mitata";\n${out.slice(at)}`;
  }

  return out;
};

/** Runs the codemod over the files the options select. */
export const run = (options: lib.CliOptions): Stats => {
  const stats = emptyStats();

  for (const path of lib.listFiles(options)) {
    const src = fs.readFileSync(path, "utf8");
    if (!src.includes("Deno.bench")) {
      continue;
    }

    stats.files++;
    const out = transformSource(path, src, stats);
    if (out === src) {
      continue;
    }

    stats.changed++;
    if (!options.dryRun) {
      fs.writeFileSync(path, out);
    }
  }

  return stats;
};

if (import.meta.main) {
  const stats = run(lib.parseCliArgs(process.argv.slice(2)));
  console.log(JSON.stringify(stats, null, 2));
}
