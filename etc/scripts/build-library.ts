// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Builds one workspace library for npm: tsc 7 emits its JavaScript and
 * declarations into its dist/ through the package's tsconfig.build.json, which
 * extends the root tsconfig.build.json. Inside the workspace the sources still
 * run directly; dist/ is what the package's publishConfig.exports points at.
 *
 * Usage, from the package directory (the `build` script that
 * etc/scripts/gen-library-manifests.ts writes):
 *   node ../../../etc/scripts/build-library.ts [--copy <dir>]...
 *
 * Options:
 *   --copy <dir>  Copy a directory of runtime assets that the sources read
 *                 from next to themselves into dist/ (noskills-web's static/).
 *
 * Before the emit, it removes what an earlier build left in dist/: every
 * JavaScript, declaration, map and JSON file, and the copied directories.
 * Other files stay, because dist/ is shared: pkg/@eserstack/ajan keeps its
 * native and WASM builds there. The eser and noskills bundle scripts write
 * into the dist/ of cli and noskills too; this clean removes a bundle there
 * and a bundle build removes this emit, so whichever a later step packs is
 * built last.
 *
 * After the emit, it fails when an emitted .js file still imports a
 * TypeScript file: Node does not strip types under node_modules, so such an
 * import breaks every consumer.
 *
 * @module
 */

// The emit log of tsc and the summary line are the build output.
/* oxlint-disable no-console */

// etc/scripts belongs to no workspace package, so no import map resolves the
// bare "@eserstack/standards/cross-runtime". The cross-runtime layer imports
// no other package, so it loads by path from here.
import * as crossRuntime from "../../pkg/@eserstack/standards/cross-runtime/mod.ts";

const { runtime } = crossRuntime;
const REPO_ROOT = runtime.path.resolve(import.meta.dirname ?? ".", "..", "..");

/** The output directory of tsconfig.build.json, below the package. */
export const DIST_DIR = "dist";

/** The per-package config that extends the root tsconfig.build.json. */
export const BUILD_CONFIG = "tsconfig.build.json";

/** File endings of everything tsc writes into dist/, removed before a build. */
const EMIT_OUTPUT = /\.(?:[cm]?js|d\.[cm]?ts|map|json|tsbuildinfo)$/;

/** Module specifiers that name a TypeScript file. */
const TS_SPECIFIER = /\.(?:[cm]?ts|tsx)$/;

/**
 * Keywords after which a `/` starts a regular expression literal rather than
 * a division.
 */
const KEYWORDS_BEFORE_EXPRESSION: ReadonlySet<string> = new Set([
  "await",
  "case",
  "delete",
  "do",
  "else",
  "in",
  "instanceof",
  "new",
  "of",
  "return",
  "throw",
  "typeof",
  "void",
  "yield",
]);

/** Kinds of the last token, for the import and regular expression rules. */
type TokenKind = "word" | "punctuator" | "literal";

type Token = { readonly kind: TokenKind; readonly text: string };

const NO_TOKEN: Token = { kind: "punctuator", text: "" };

const isWordStart = (char: string): boolean => /[\p{ID_Start}$_\\]/u.test(char);

const isWordPart = (char: string): boolean =>
  /[\p{ID_Continue}$\u200c\u200d\\]/u.test(char);

/**
 * Whether a `/` after `previous` starts a regular expression literal. After a
 * value (a name, a literal, a closing bracket) it is a division; tsc output
 * never puts a regular expression right after a closing bracket.
 */
const startsRegExp = (previous: Token): boolean => {
  if (previous.kind === "literal") {
    return false;
  }

  if (previous.kind === "word") {
    return KEYWORDS_BEFORE_EXPRESSION.has(previous.text);
  }

  return (
    previous.text !== ")" && previous.text !== "]" && previous.text !== "}"
  );
};

/** The index after the string literal that opens at `start`. */
const skipString = (source: string, start: number): number => {
  const quote = source[start];
  let index = start + 1;

  while (index < source.length) {
    const char = source[index];

    if (char === "\\") {
      index += 2;
      continue;
    }

    index += 1;

    if (char === quote || char === "\n") {
      break;
    }
  }

  return index;
};

/** The index after the regular expression literal that opens at `start`. */
const skipRegExp = (source: string, start: number): number => {
  let index = start + 1;
  let inClass = false;

  while (index < source.length) {
    const char = source[index];

    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === "\n") {
      break;
    }

    index += 1;

    if (char === "[") {
      inClass = true;
    } else if (char === "]") {
      inClass = false;
    } else if (char === "/" && !inClass) {
      break;
    }
  }

  while (index < source.length && isWordPart(source[index]!)) {
    index += 1;
  }

  return index;
};

/**
 * Scans the text of a template literal from `start`, just after its opening
 * backtick or after the `}` that closes an interpolation. Returns the index
 * after the closing backtick, or after the next `${` with `interpolation` set.
 */
const scanTemplate = (
  source: string,
  start: number,
): { readonly end: number; readonly interpolation: boolean } => {
  let index = start;

  while (index < source.length) {
    const char = source[index];

    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === "`") {
      return { end: index + 1, interpolation: false };
    }

    if (char === "$" && source[index + 1] === "{") {
      return { end: index + 2, interpolation: true };
    }

    index += 1;
  }

  return { end: index, interpolation: false };
};

/**
 * Lists the module specifiers of a JavaScript module: those of `import` and
 * `export ... from` declarations and of `import()` calls with a string
 * literal. Comments and the contents of string, template and regular
 * expression literals are skipped, so a JSDoc example that shows an import
 * does not count. The lexer is small on purpose: it reads tsc output, which is
 * well-formed JavaScript.
 *
 * @param source - The text of a JavaScript module
 * @returns The specifiers in source order
 */
export const importSpecifiers = (source: string): string[] => {
  const specifiers: string[] = [];
  // One entry per open `{`: true when it opened a template interpolation.
  const braces: boolean[] = [];
  let previous: Token = NO_TOKEN;
  let beforePrevious: Token = NO_TOKEN;
  let index = 0;

  const push = (token: Token): void => {
    beforePrevious = previous;
    previous = token;
  };

  const continueTemplate = (start: number): void => {
    const scanned = scanTemplate(source, start);

    if (scanned.interpolation) {
      braces.push(true);
      push({ kind: "punctuator", text: "${" });
    } else {
      push({ kind: "literal", text: "`" });
    }

    index = scanned.end;
  };

  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];

    if (/\s/.test(char)) {
      index += 1;
    } else if (char === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      index = end === -1 ? source.length : end;
    } else if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
    } else if (char === '"' || char === "'") {
      const end = skipString(source, index);
      const isSpecifier =
        (previous.kind === "word" &&
          (previous.text === "from" || previous.text === "import")) ||
        (previous.text === "(" &&
          beforePrevious.kind === "word" &&
          beforePrevious.text === "import");

      if (isSpecifier) {
        specifiers.push(source.slice(index + 1, end - 1));
      }

      push({ kind: "literal", text: char });
      index = end;
    } else if (char === "`") {
      continueTemplate(index + 1);
    } else if (char === "/") {
      if (startsRegExp(previous)) {
        index = skipRegExp(source, index);
        push({ kind: "literal", text: "/" });
      } else {
        push({ kind: "punctuator", text: "/" });
        index += 1;
      }
    } else if (isWordStart(char)) {
      const start = index;

      while (index < source.length && isWordPart(source[index]!)) {
        index += 1;
      }

      push({ kind: "word", text: source.slice(start, index) });
    } else if (
      /[0-9]/.test(char) ||
      (char === "." && /[0-9]/.test(next ?? ""))
    ) {
      while (index < source.length && /[\w.]/.test(source[index]!)) {
        index += 1;
      }

      push({ kind: "literal", text: "0" });
    } else if (char === "{") {
      braces.push(false);
      push({ kind: "punctuator", text: "{" });
      index += 1;
    } else if (char === "}") {
      if (braces.pop() === true) {
        continueTemplate(index + 1);
      } else {
        push({ kind: "punctuator", text: "}" });
        index += 1;
      }
    } else {
      push({ kind: "punctuator", text: char });
      index += 1;
    }
  }

  return specifiers;
};

/**
 * The specifiers of a JavaScript module that name a TypeScript file, which
 * rewriteRelativeImportExtensions should have turned into .js.
 */
export const typeScriptSpecifiers = (source: string): string[] =>
  importSpecifiers(source).filter((specifier) => TS_SPECIFIER.test(specifier));

/** Whether a file in dist/ is build output that a new build replaces. */
export const isEmitOutput = (fileName: string): boolean =>
  EMIT_OUTPUT.test(fileName);

/**
 * Reads the directories of `--copy <dir>` and `--copy=<dir>` arguments.
 *
 * @throws Error for any other argument, a missing value, or a directory that
 * leaves the package
 */
export const parseCopyDirs = (args: readonly string[]): string[] => {
  const dirs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    let dir: string | undefined;

    if (arg === "--copy") {
      index += 1;
      dir = args[index];
    } else if (arg.startsWith("--copy=")) {
      dir = arg.slice("--copy=".length);
    } else {
      throw new Error(
        `unknown argument ${arg}; usage: build-library.ts [--copy <dir>]...`,
      );
    }

    if (dir === undefined || dir === "") {
      throw new Error("--copy needs a directory");
    }

    if (dir.startsWith("/") || dir.split(/[\\/]/).includes("..")) {
      throw new Error(
        `--copy ${dir}: the directory must be inside the package`,
      );
    }

    dirs.push(dir);
  }

  return dirs;
};

/** Whether a path relative to dist/ lies in one of the copied directories. */
const inCopyDir = (file: string, copyDirs: readonly string[]): boolean =>
  copyDirs.some((dir) => file === dir || file.startsWith(`${dir}/`));

/** What a clean of dist/ removes, relative to dist/ ("" is dist/ itself). */
export type CleanPlan = {
  readonly dirs: readonly string[];
  readonly files: readonly string[];
};

/**
 * Plans the clean of dist/ from the files in it (relative, "/" separators):
 * build output and the copied directories go, everything else stays. A
 * directory that holds nothing that stays goes as a whole, so no empty
 * directories are left behind.
 */
export const cleanPlan = (
  files: readonly string[],
  copyDirs: readonly string[] = [],
): CleanPlan => {
  const removable = (file: string): boolean =>
    isEmitOutput(file.slice(file.lastIndexOf("/") + 1)) ||
    inCopyDir(file, copyDirs);
  // "" for dist/, then "a", "a/b" for "a/b/c.js".
  const ancestors = (file: string): string[] => {
    const segments = file.split("/").slice(0, -1);

    return [
      "",
      ...segments.map((_, index) => segments.slice(0, index + 1).join("/")),
    ];
  };

  const kept = new Set(
    files.filter((file) => !removable(file)).flatMap(ancestors),
  );
  const dirs = new Set<string>();
  const removedFiles: string[] = [];

  for (const file of files.filter(removable)) {
    const dir = ancestors(file).find((ancestor) => !kept.has(ancestor));

    if (dir === undefined) {
      removedFiles.push(file);
    } else {
      dirs.add(dir);
    }
  }

  return { dirs: [...dirs], files: removedFiles };
};

/** The files under `dir`, relative to it with "/" separators. */
const listFiles = async (dir: string): Promise<string[]> => {
  const files: string[] = [];

  for await (const entry of runtime.fs.walk(dir, { includeDirs: false })) {
    files.push(runtime.path.relative(dir, entry.path).replaceAll("\\", "/"));
  }

  return files;
};

/** Removes the output of an earlier build from `distDir`. */
const cleanDist = async (
  distDir: string,
  copyDirs: readonly string[],
): Promise<void> => {
  if (!(await runtime.fs.exists(distDir))) {
    return;
  }

  const plan = cleanPlan(await listFiles(distDir), copyDirs);

  await Promise.all([
    ...plan.dirs.map((dir) =>
      runtime.fs.remove(runtime.path.join(distDir, dir), { recursive: true }),
    ),
    ...plan.files.map((file) =>
      runtime.fs.remove(runtime.path.join(distDir, file)),
    ),
  ]);
};

/** Copies the files of the directory `from` into `to`. */
const copyDir = async (from: string, to: string): Promise<void> => {
  const files = await listFiles(from);

  await Promise.all(
    files.map(async (file) => {
      const target = runtime.path.join(to, file);

      await runtime.fs.mkdir(runtime.path.dirname(target), { recursive: true });
      await runtime.fs.copyFile(runtime.path.join(from, file), target);
    }),
  );
};

/** Every `.ts` specifier left in the emitted .js files under `distDir`. */
const findTypeScriptSpecifiers = async (
  distDir: string,
  copyDirs: readonly string[],
): Promise<string[]> => {
  const modules = (await listFiles(distDir)).filter(
    (file) => /\.[cm]?js$/.test(file) && !inCopyDir(file, copyDirs),
  );
  const findings = await Promise.all(
    modules.map(async (file) => {
      const source = await runtime.fs.readTextFile(
        runtime.path.join(distDir, file),
      );

      return typeScriptSpecifiers(source).map(
        (specifier) => `${file}: "${specifier}"`,
      );
    }),
  );

  return findings.flat();
};

const main = async (): Promise<void> => {
  const pkgDir = runtime.process.cwd();
  const copyDirs = parseCopyDirs(runtime.process.args);
  const distDir = runtime.path.join(pkgDir, DIST_DIR);

  if (!(await runtime.fs.exists(runtime.path.join(pkgDir, BUILD_CONFIG)))) {
    throw new Error(
      `build ${pkgDir}: no ${BUILD_CONFIG}; run node ./etc/scripts/gen-library-manifests.ts from the repository root`,
    );
  }

  await cleanDist(distDir, copyDirs);

  // tsc 7 is a root devDependency; its bin is a Node script, so it runs on
  // this Node on every platform.
  const tsc = runtime.path.join(
    REPO_ROOT,
    "node_modules",
    "typescript",
    "bin",
    "tsc",
  );
  const result = await runtime.exec.spawn(
    runtime.process.execPath(),
    [tsc, "-p", BUILD_CONFIG],
    { cwd: pkgDir, stdout: "inherit", stderr: "inherit" },
  );

  // tsc writes what it can even when it reports errors, so a failed run must
  // fail the build, or the package ships with declarations missing.
  if (!result.success) {
    throw new Error(`build ${pkgDir}: tsc exited with code ${result.code}`);
  }

  await Promise.all(
    copyDirs.map((dir) =>
      copyDir(runtime.path.join(pkgDir, dir), runtime.path.join(distDir, dir)),
    ),
  );

  const findings = await findTypeScriptSpecifiers(distDir, copyDirs);

  if (findings.length > 0) {
    throw new Error(
      `build ${pkgDir}: ${findings.length} emitted import(s) still name a .ts file:\n  ${findings.join("\n  ")}`,
    );
  }

  console.log(`built ${runtime.path.relative(REPO_ROOT, distDir)}`);
};

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  await main();
}
