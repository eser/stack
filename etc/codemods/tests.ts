// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Rewrites Deno test files to node:test (M0-T18, decision-7). Removed in
 * M1-T37 (TASK-231) after M1-T4 has run it.
 *
 * - `Deno.test(name, fn)`, `Deno.test(name, options, fn)` and
 *   `Deno.test({ name, fn, ...options })` (and `Deno.test.ignore` and
 *   `Deno.test.only`) become `nodeTest.test(name, [options,] fn)`, with
 *   `import * as nodeTest from "node:test"` added.
 * - `t.step` becomes `t.test`, in both forms, for every test context name.
 * - In options, `ignore` becomes `skip`, `only` stays, and `sanitizeOps`,
 *   `sanitizeResources`, `sanitizeExit` and `permissions` are deleted.
 * - `import * as bdd from "@std/testing/bdd"` imports "node:test" under the
 *   same name; object-form `bdd.describe({ name, fn })` and `bdd.it({...})`
 *   become positional; `beforeAll` and `afterAll` become `before` and
 *   `after`; `.ignore` becomes `.skip`.
 *
 * The @eserstack/test-kit imports are left alone. A site in a shape it does
 * not know is left as it is and listed.
 *
 *   node etc/codemods/tests.ts [--dry-run] [--filter <substring>]... [path...]
 *
 * @module
 */

import * as fs from "node:fs";
import * as lib from "./lib.ts";

type Node = lib.Node;

type Phase = "probe" | "emit";

export type Stats = {
  files: number;
  changed: number;
  denoTest: number;
  step: number;
  sanitizerKeys: number;
  permissionsKeys: number;
  ignoreToSkip: number;
  bddFiles: number;
  bddObjectForm: number;
  bddHooksRenamed: number;
  unhandled: string[];
};

export const emptyStats = (): Stats => ({
  files: 0,
  changed: 0,
  denoTest: 0,
  step: 0,
  sanitizerKeys: 0,
  permissionsKeys: 0,
  ignoreToSkip: 0,
  bddFiles: 0,
  bddObjectForm: 0,
  bddHooksRenamed: 0,
  unhandled: [],
});

const SANITIZER_KEYS = new Set(["sanitizeOps", "sanitizeResources", "sanitizeExit"]);
const NODE_TEST_NAMESPACE = "nodeTest";
const BDD_SOURCE = "@std/testing/bdd";

const isFunction = (node: Node): boolean =>
  node !== undefined && node !== null &&
  (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression");

const keyName = (property: Node): string | undefined =>
  property?.type === "Property" && !property.computed
    ? property.key?.name ?? property.key?.value
    : undefined;

const isMember = (node: Node, object: string, property: string): boolean =>
  node?.type === "MemberExpression" && !node.computed &&
  node.object?.type === "Identifier" && node.object.name === object &&
  node.property?.name === property;

/** `Deno.test`, `Deno.test.ignore` or `Deno.test.only`. */
const denoTestModifier = (callee: Node): "" | "ignore" | "only" | null => {
  if (isMember(callee, "Deno", "test")) {
    return "";
  }

  if (
    callee?.type === "MemberExpression" && !callee.computed &&
    isMember(callee.object, "Deno", "test") &&
    (callee.property?.name === "ignore" || callee.property?.name === "only")
  ) {
    return callee.property.name;
  }

  return null;
};

/** Transforms one file's source; returns the new source and counts into stats. */
export const transformSource = (
  path: string,
  src: string,
  stats: Stats,
): string => {
  const program = lib.parse(path, src);
  if (program === null) {
    stats.unhandled.push(`${path}: does not parse`);

    return src;
  }

  const edits: lib.Edit[] = [];
  const calls: Node[] = [];
  let bddImport: Node = null;
  let bddName: string | null = null;
  let hasNodeTestImport = false;

  lib.walk(program, (node) => {
    if (node.type === "CallExpression") {
      calls.push(node);
    }

    if (node.type === "ImportDeclaration" && node.source?.value === BDD_SOURCE) {
      bddImport = node;
      const namespace = node.specifiers?.find((s: Node) => s.type === "ImportNamespaceSpecifier");
      bddName = namespace?.local?.name ?? null;
    }

    if (
      node.type === "ImportDeclaration" && node.source?.value === "node:test" &&
      node.specifiers?.some((s: Node) =>
        s.type === "ImportNamespaceSpecifier" && s.local?.name === NODE_TEST_NAMESPACE
      )
    ) {
      hasNodeTestImport = true;
    }
  });

  // The names a test callback gives its context: t.step needs them.
  const contextNames = new Set<string>(["t"]);
  const isBddCall = (callee: Node): boolean =>
    bddName !== null && callee?.type === "MemberExpression" &&
    (callee.object?.name === bddName ||
      (callee.object?.type === "MemberExpression" && callee.object.object?.name === bddName));

  for (const call of calls) {
    const testLike = denoTestModifier(call.callee) !== null || isBddCall(call.callee) ||
      (call.callee?.type === "MemberExpression" &&
        (call.callee.property?.name === "step" || call.callee.property?.name === "test"));
    if (!testLike) {
      continue;
    }

    for (const arg of call.arguments) {
      const fn = isFunction(arg)
        ? arg
        : arg.type === "ObjectExpression"
        ? arg.properties.find((p: Node) => keyName(p) === "fn")?.value
        : null;
      if (isFunction(fn) && fn.params[0]?.type === "Identifier") {
        contextNames.add(fn.params[0].name);
      }
    }
  }

  // Rewrites an options object's properties; null means "leave the site".
  // The probe phase reports unknown options; the emit phase counts.
  const convertOptions = (
    properties: readonly Node[],
    modifier: string,
    render: (a: number, b: number) => string,
    site: string,
    phase: Phase,
  ): string[] | null => {
    const emit = phase === "emit";
    const kept: string[] = [];

    for (const property of properties) {
      const key = keyName(property);
      if (key === "name" || key === "fn") {
        continue;
      }

      if (key !== undefined && SANITIZER_KEYS.has(key)) {
        stats.sanitizerKeys += emit ? 1 : 0;
        continue;
      }

      if (key === "permissions") {
        stats.permissionsKeys += emit ? 1 : 0;
        continue;
      }

      if (key === "ignore") {
        stats.ignoreToSkip += emit ? 1 : 0;
        kept.push(`skip: ${render(property.value.start, property.value.end)}`);
        continue;
      }

      if (key === "only") {
        kept.push(`only: ${render(property.value.start, property.value.end)}`);
        continue;
      }

      if (!emit) {
        stats.unhandled.push(`${site}: option ${key ?? "(spread or computed)"} has no node:test equivalent`);
      }

      return null;
    }

    if (modifier === "ignore") {
      stats.ignoreToSkip += emit ? 1 : 0;
      kept.push("skip: true");
    } else if (modifier === "only") {
      kept.push("only: true");
    }

    return kept;
  };

  const functionText = (property: Node, render: (a: number, b: number) => string): string => {
    if (property.type === "Property" && property.method) {
      const value = property.value;

      return `${value.async ? "async " : ""}function${value.generator ? "*" : ""} ${
        render(property.key.end, property.end)
      }`;
    }

    const node = property.type === "Property" ? property.value : property;

    return render(node.start, node.end);
  };

  /**
   * Turns a call's arguments into (name, options, fn) text, or null for an
   * unknown shape. Handles (name, fn), (name, options, fn), ({...}) and
   * ({...}, fn) and a named function alone.
   */
  const positional = (
    call: Node,
    modifier: string,
    site: string,
  ): ((render: (a: number, b: number) => string, phase: Phase) => string | null) => {
    const [a0, a1, a2] = call.arguments;
    const isName = (node: Node) => node !== undefined && node.type !== "ObjectExpression" && !isFunction(node) && node.type !== "SpreadElement";

    return (render, phase) => {
      let name: string | null = null;
      let fn: string | null = null;
      let options: string[] | null = [];

      if (a0?.type === "ObjectExpression") {
        const nameProp = a0.properties.find((p: Node) => keyName(p) === "name");
        const fnProp = a0.properties.find((p: Node) => keyName(p) === "fn");
        name = nameProp !== undefined ? render(nameProp.value.start, nameProp.value.end) : null;
        fn = fnProp !== undefined ? functionText(fnProp, render) : isFunction(a1) ? render(a1.start, a1.end) : null;
        if (name === null && isFunction(a1) && a1.id !== null && a1.id !== undefined) {
          name = JSON.stringify(a1.id.name);
        }
        options = convertOptions(a0.properties, modifier, render, site, phase);
      } else if (isName(a0) && a1?.type === "ObjectExpression" && isFunction(a2)) {
        name = render(a0.start, a0.end);
        fn = render(a2.start, a2.end);
        options = convertOptions(a1.properties, modifier, render, site, phase);
      } else if (isName(a0) && isFunction(a1) && call.arguments.length === 2) {
        name = render(a0.start, a0.end);
        fn = render(a1.start, a1.end);
        options = convertOptions([], modifier, render, site, phase);
      } else if (isFunction(a0) && call.arguments.length === 1 && a0.id !== null && a0.id !== undefined) {
        name = JSON.stringify(a0.id.name);
        fn = render(a0.start, a0.end);
        options = convertOptions([], modifier, render, site, phase);
      }

      if (name === null || fn === null || options === null) {
        return null;
      }

      return `${name}, ${options.length > 0 ? `{ ${options.join(", ")} }, ` : ""}${fn}`;
    };
  };

  let usesNodeTest = false;

  for (const call of calls) {
    const site = `${path}:${lib.lineOf(src, call.start)}`;
    const modifier = denoTestModifier(call.callee);

    if (modifier !== null) {
      const simple = modifier === "" && call.arguments.length === 2 &&
        call.arguments[0].type !== "ObjectExpression" && isFunction(call.arguments[1]);

      if (simple) {
        stats.denoTest++;
        usesNodeTest = true;
        edits.push({ start: call.callee.start, end: call.callee.end, produce: () => `${NODE_TEST_NAMESPACE}.test` });
        continue;
      }

      const args = positional(call, modifier, site);
      const probe = args((a, b) => src.slice(a, b), "probe");
      if (probe === null) {
        stats.unhandled.push(`${site}: Deno.test in an unknown shape`);
        continue;
      }

      stats.denoTest++;
      usesNodeTest = true;
      edits.push({
        start: call.start,
        end: call.end,
        produce: (render) => `${NODE_TEST_NAMESPACE}.test(${args(render, "emit")})`,
      });
      continue;
    }

    const callee = call.callee;
    const isStep = callee?.type === "MemberExpression" && !callee.computed &&
      callee.property?.name === "step" && callee.object?.type === "Identifier" &&
      contextNames.has(callee.object.name);

    if (isStep) {
      const contextName = callee.object.name;
      const simple = call.arguments.length === 2 && call.arguments[0].type !== "ObjectExpression" &&
        isFunction(call.arguments[1]);

      if (simple) {
        stats.step++;
        edits.push({ start: callee.property.start, end: callee.property.end, produce: () => "test" });
        continue;
      }

      const args = positional(call, "", site);
      const probe = args((a, b) => src.slice(a, b), "probe");
      if (probe === null) {
        stats.unhandled.push(`${site}: t.step in an unknown shape`);
        continue;
      }

      stats.step++;
      edits.push({
        start: call.start,
        end: call.end,
        produce: (render) => `${contextName}.test(${args(render, "emit")})`,
      });
      continue;
    }

    if (bddName !== null && isBddCall(callee)) {
      // bdd.describe.ignore / bdd.it.ignore -> .skip; beforeAll/afterAll -> before/after.
      const method = callee.object?.type === "MemberExpression" ? callee.object.property?.name : callee.property?.name;
      const modifierName = callee.object?.type === "MemberExpression" ? callee.property?.name : "";

      if (modifierName === "ignore") {
        edits.push({ start: callee.property.start, end: callee.property.end, produce: () => "skip" });
      }

      if (method === "beforeAll" || method === "afterAll") {
        stats.bddHooksRenamed++;
        edits.push({
          start: callee.property.start,
          end: callee.property.end,
          produce: () => (method === "beforeAll" ? "before" : "after"),
        });
        continue;
      }

      if ((method === "describe" || method === "it") && call.arguments[0]?.type === "ObjectExpression") {
        const args = positional(call, "", site);
        const probe = args((a, b) => src.slice(a, b), "probe");
        if (probe === null) {
          stats.unhandled.push(`${site}: bdd.${method} in an unknown shape`);
          continue;
        }

        stats.bddObjectForm++;
        const calleeText = src.slice(callee.start, callee.end).replace(/\.ignore$/, ".skip");
        edits.push({
          start: call.start,
          end: call.end,
          produce: (render) => `${calleeText}(${args(render, "emit")})`,
        });
        continue;
      }

      if ((method === "describe" || method === "it") && call.arguments[1]?.type === "ObjectExpression") {
        // (name, options, fn): only the options change.
        const optionsNode = call.arguments[1];
        const converted = convertOptions(optionsNode.properties, "", (a, b) => src.slice(a, b), site, "probe");
        if (converted === null) {
          continue;
        }

        edits.push({
          start: optionsNode.start,
          end: optionsNode.end,
          produce: (render) => {
            const kept = convertOptions(optionsNode.properties, "", render, site, "emit") ?? [];

            return kept.length > 0 ? `{ ${kept.join(", ")} }` : "{}";
          },
        });
      }
    }
  }

  // Deno.test used other than as a call, such as an alias.
  lib.walk(program, (node) => {
    if (
      (node.type === "MemberExpression" && isMember(node, "Deno", "test")) &&
      !calls.some((call) => call.callee === node || call.callee?.object === node)
    ) {
      stats.unhandled.push(`${path}:${lib.lineOf(src, node.start)}: Deno.test is not called directly`);
    }
  });

  if (bddImport !== null) {
    stats.bddFiles++;
    const source = (bddImport as Node).source;
    edits.push({ start: source.start, end: source.end, produce: () => '"node:test"' });
  }

  if (edits.length === 0) {
    return src;
  }

  let out = lib.applyEdits(src, edits);

  if (usesNodeTest && !hasNodeTestImport) {
    const first = program.body.find((s: Node) => s.type === "ImportDeclaration") ?? program.body[0];
    const at = first !== undefined ? first.start : 0;
    out = `${out.slice(0, at)}import * as ${NODE_TEST_NAMESPACE} from "node:test";\n${out.slice(at)}`;
  }

  return out;
};

const PREFILTER = /Deno\.test|@std\/testing\/bdd|\.step\(/;

/** Runs the codemod over the files the options select. */
export const run = (options: lib.CliOptions): Stats => {
  const stats = emptyStats();

  for (const path of lib.listFiles(options)) {
    const src = fs.readFileSync(path, "utf8");
    if (!PREFILTER.test(src)) {
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
