// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Writes the npm build fields of every workspace library: the `build` script,
 * the `files` list and `publishConfig.exports` in its package.json, and the
 * tsconfig.build.json next to it that extends the root one.
 *
 * A library is a workspace package that is not private and has `exports`: the
 * TypeScript libraries and tools. The private test seam (test-kit) and the
 * ajan-* and noskills-* platform packages, which have no `exports`, are left
 * alone.
 *
 * Inside the workspace `exports` keeps pointing at the .ts sources, which
 * Node runs directly. `publishConfig.exports` maps every export sub-path to
 * the emitted files in dist/ with `types` and `import` conditions; pnpm puts it
 * in place of `exports` when it packs or publishes the package. Node does not
 * strip types under node_modules, so a published library must point at .js.
 *
 * The package.json text is edited in place: only the three fields this script
 * owns change (and inside `scripts` and `publishConfig`, only `build` and
 * `exports`), the other fields keep their order and text, and new fields go
 * next to `exports`. The output follows oxfmt's package.json layout, so
 * `oxfmt --check` passes on it.
 *
 * Usage:
 *   node ./etc/scripts/gen-library-manifests.ts          # write the fields
 *   node ./etc/scripts/gen-library-manifests.ts --check  # fail when one is stale
 *
 * @module
 */

// The list of written or stale files is the command's output.
/* oxlint-disable no-console */

// etc/scripts belongs to no workspace package, so no import map resolves the
// bare "@eserstack/standards/cross-runtime". The cross-runtime layer imports
// no other package, so it loads by path from here.
import * as crossRuntime from "../../pkg/@eserstack/standards/cross-runtime/mod.ts";

const { runtime } = crossRuntime;
const REPO_ROOT = runtime.path.resolve(import.meta.dirname ?? ".", "..", "..");
const PACKAGES_DIR = "pkg/@eserstack";

/** The root emit config that every package's tsconfig.build.json extends. */
const ROOT_BUILD_CONFIG = "tsconfig.build.json";

/** The build runner, relative to the repository root. */
const BUILD_RUNNER = "etc/scripts/build-library.ts";

/** One level of indentation in package.json. */
const INDENT = "  ";

/** A source module that tsc emits as .js plus .d.ts. */
const TS_SOURCE = /^\.\/(?<path>.+)\.tsx?$/;

/** What a library needs beyond the defaults. */
export type LibraryOptions = {
  /** Directories of runtime assets that the build copies into dist/. */
  readonly copy?: readonly string[];
  /** Export sub-paths that stay on their source file when published. */
  readonly sourceExports?: readonly string[];
  /** Further `files` entries, for the sources such exports need. */
  readonly extraFiles?: readonly string[];
};

/** The libraries that need more than the defaults, by package name. */
export const LIBRARY_OPTIONS: Readonly<Record<string, LibraryOptions>> = {
  // laroux-bundler locates laroux-react through its ./client/bootstrap export
  // and copies these sources into an app's client build
  // (BOOTSTRAP_SOURCE_FILES in laroux-bundler/adapters/react/rsc-client-entry.ts),
  // so the export stays on the source and the sources ship with the package.
  "@eserstack/laroux-react": {
    sourceExports: ["./client/bootstrap"],
    extraFiles: [
      "client.ts",
      "protocol.ts",
      "client/bootstrap/",
      "runtime/image/fallback.ts",
      "runtime/navigation/link-navigation.ts",
    ],
  },
  // server.ts serves static/ from its own directory, which is dist/ once built.
  "@eserstack/noskills-web": {
    copy: ["static"],
  },
};

/** A package.json, as far as this script reads it. */
export type Manifest = {
  readonly name?: string;
  readonly private?: boolean;
  readonly exports?: unknown;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly publishConfig?: Readonly<Record<string, unknown>>;
};

/** The `types` and `import` targets of one emitted module. */
export type DistConditions = {
  readonly types: string;
  readonly import: string;
};

/** The fields this script owns in one library's package.json. */
export type LibraryFields = {
  readonly build: string;
  readonly files: readonly string[];
  readonly publishExports: Readonly<Record<string, DistConditions | string>>;
};

/** Whether a workspace package is a library that gets an npm build. */
export const isLibrary = (manifest: Manifest): boolean =>
  manifest.private !== true &&
  manifest.exports !== undefined &&
  manifest.exports !== null;

/**
 * The emitted files of a source export target: "./a/b.ts" becomes
 * "./dist/a/b.d.ts" and "./dist/a/b.js".
 *
 * @throws Error for a target that is not a relative .ts or .tsx file
 */
export const distConditions = (target: string): DistConditions => {
  const path = TS_SOURCE.exec(target)?.groups?.["path"];

  if (path === undefined) {
    throw new Error(
      `export target ${target} is not a ./*.ts source, so it has no emitted file`,
    );
  }

  return { types: `./dist/${path}.d.ts`, import: `./dist/${path}.js` };
};

/**
 * Maps the `exports` field of a library to its publishConfig.exports. The
 * string form becomes the "." sub-path. Sub-paths in `sourceExports` keep
 * their source target.
 *
 * @throws Error for an `exports` field that is not a string or a map of
 * sub-paths to string targets
 */
export const publishExports = (
  exports: unknown,
  sourceExports: readonly string[] = [],
): Record<string, DistConditions | string> => {
  const entries: [string, unknown][] =
    typeof exports === "string"
      ? [[".", exports]]
      : exports !== null &&
          typeof exports === "object" &&
          !Array.isArray(exports)
        ? Object.entries(exports)
        : [];

  if (entries.length === 0) {
    throw new Error("exports must be a string or a map of sub-paths to files");
  }

  const result: Record<string, DistConditions | string> = {};

  for (const [subPath, target] of entries) {
    if (typeof target !== "string") {
      throw new Error(
        `exports["${subPath}"] is not a file path; conditions are not supported`,
      );
    }

    result[subPath] = sourceExports.includes(subPath)
      ? target
      : distConditions(target);
  }

  return result;
};

/**
 * The `build` script of a package directory. pnpm runs it in that directory,
 * so the runner path is relative to it.
 */
export const buildScript = (
  pkgDir: string,
  copy: readonly string[] = [],
): string => {
  const runner = runtime.path
    .relative(pkgDir, BUILD_RUNNER)
    .replaceAll("\\", "/");
  const args = copy.map((dir) => ` --copy ${dir}`).join("");

  return `node ${runner}${args}`;
};

/**
 * The `files` list of a library: the emitted modules and declarations, the
 * JSON files tsc copies for JSON imports, the copied asset directories and the
 * extra entries. Patterns and not the whole dist/, because pkg/@eserstack/ajan
 * also keeps its native builds in dist/. The README needs no entry: npm and
 * pnpm always pack the one at the package root, and an entry without a slash
 * would also match a README.md inside dist/.
 */
export const filesList = (options: LibraryOptions = {}): string[] => [
  "dist/**/*.js",
  "dist/**/*.d.ts",
  "dist/**/*.json",
  ...(options.copy ?? []).map((dir) => `dist/${dir}/`),
  ...(options.extraFiles ?? []),
];

/** Everything this script writes for one library. */
export const libraryFields = (
  pkgDir: string,
  manifest: Manifest,
  options: LibraryOptions = {},
): LibraryFields => ({
  build: buildScript(pkgDir, options.copy),
  files: filesList(options),
  publishExports: publishExports(manifest.exports, options.sourceExports),
});

/** The tsconfig.build.json of a package directory. */
export const buildConfigText = (pkgDir: string): string => {
  const base = runtime.path
    .relative(pkgDir, ROOT_BUILD_CONFIG)
    .replaceAll("\\", "/");

  return `{ "extends": ${JSON.stringify(base)} }\n`;
};

// =============================================================================
// package.json text editing
// =============================================================================

/** Where one member of the top-level object sits in the text. */
export type MemberSpan = {
  readonly key: string;
  readonly keyStart: number;
  readonly valueStart: number;
  readonly valueEnd: number;
  /** The index of the comma after the value, or -1 for the last member. */
  readonly comma: number;
};

const skipWhitespace = (text: string, start: number): number => {
  let index = start;

  while (index < text.length && /\s/.test(text[index]!)) {
    index += 1;
  }

  return index;
};

/** The index after the JSON string that opens at `start`. */
const skipJsonString = (text: string, start: number): number => {
  let index = start + 1;

  while (index < text.length && text[index] !== '"') {
    index += text[index] === "\\" ? 2 : 1;
  }

  return index + 1;
};

/** The index after the JSON value that starts at `start`. */
const skipJsonValue = (text: string, start: number): number => {
  if (text[start] === '"') {
    return skipJsonString(text, start);
  }

  if (text[start] !== "{" && text[start] !== "[") {
    let index = start;

    while (index < text.length && /[^\s,}\]]/.test(text[index]!)) {
      index += 1;
    }

    return index;
  }

  let depth = 0;
  let index = start;

  while (index < text.length) {
    const char = text[index]!;

    if (char === '"') {
      index = skipJsonString(text, index);
      continue;
    }

    if (char === "{" || char === "[") {
      depth += 1;
    } else if (char === "}" || char === "]") {
      depth -= 1;

      if (depth === 0) {
        return index + 1;
      }
    }

    index += 1;
  }

  throw new Error("unterminated JSON value");
};

/**
 * Locates the members of the top-level object of a JSON text.
 *
 * @throws Error when the text is not a JSON object
 */
export const topLevelMembers = (text: string): MemberSpan[] => {
  let index = skipWhitespace(text, 0);

  if (text[index] !== "{") {
    throw new Error("package.json is not a JSON object");
  }

  const members: MemberSpan[] = [];
  index = skipWhitespace(text, index + 1);

  while (index < text.length && text[index] !== "}") {
    const keyStart = index;
    const keyEnd = skipJsonString(text, keyStart);
    const key = JSON.parse(text.slice(keyStart, keyEnd)) as string;
    index = skipWhitespace(text, keyEnd);

    if (text[index] !== ":") {
      throw new Error(`expected ":" after "${key}"`);
    }

    const valueStart = skipWhitespace(text, index + 1);
    const valueEnd = skipJsonValue(text, valueStart);
    index = skipWhitespace(text, valueEnd);
    const comma = text[index] === "," ? index : -1;

    if (comma !== -1) {
      index = skipWhitespace(text, comma + 1);
    }

    members.push({ key, keyStart, valueStart, valueEnd, comma });
  }

  return members;
};

/**
 * Serializes a JSON value the way oxfmt prints package.json, which it formats
 * like JSON.stringify: every non-empty object and array one entry per line.
 * `indent` is the indentation of the line the value starts on.
 */
export const formatJson = (value: unknown, indent: string): string =>
  JSON.stringify(value, null, INDENT.length).replaceAll("\n", `\n${indent}`);

/**
 * Sets one top-level member: replaces the value of an existing one, or
 * inserts the member before the first of `before` or after the first of
 * `after` that exists, or else at the end.
 */
export const setMember = (
  text: string,
  key: string,
  value: unknown,
  placement: {
    readonly before?: readonly string[];
    readonly after?: readonly string[];
  },
): string => {
  const members = topLevelMembers(text);
  const existing = members.find((member) => member.key === key);

  if (existing !== undefined) {
    return (
      text.slice(0, existing.valueStart) +
      formatJson(value, INDENT) +
      text.slice(existing.valueEnd)
    );
  }

  const member = `${JSON.stringify(key)}: ${formatJson(value, INDENT)}`;
  const before = members.find((item) => placement.before?.includes(item.key));

  if (before !== undefined) {
    return (
      `${text.slice(0, before.keyStart)}${member},\n${INDENT}` +
      text.slice(before.keyStart)
    );
  }

  const after =
    members.find((item) => placement.after?.includes(item.key)) ??
    members.at(-1);

  if (after === undefined) {
    throw new Error(`cannot place "${key}" in an empty package.json`);
  }

  if (after.comma !== -1) {
    return (
      `${text.slice(0, after.comma + 1)}\n${INDENT}${member},` +
      text.slice(after.comma + 1)
    );
  }

  return `${text.slice(0, after.valueEnd)},\n${INDENT}${member}${text.slice(after.valueEnd)}`;
};

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

/**
 * Applies the fields of one library to its package.json text: `files` before
 * `exports`, `publishConfig` after it, and `scripts` before the dependency
 * fields, unless the field is already there. Inside `scripts` and
 * `publishConfig` only `build` and `exports` change.
 */
export const applyLibraryFields = (
  text: string,
  fields: LibraryFields,
): string => {
  const manifest = JSON.parse(text) as Manifest;
  const scripts = { ...manifest.scripts, build: fields.build };
  const publishConfig = {
    ...manifest.publishConfig,
    exports: fields.publishExports,
  };

  let result = setMember(text, "files", fields.files, { before: ["exports"] });
  result = setMember(result, "publishConfig", publishConfig, {
    after: ["exports"],
  });
  result = setMember(result, "scripts", scripts, { before: DEPENDENCY_FIELDS });

  return result;
};

// =============================================================================
// Command
// =============================================================================

/** A file whose content differs from what this script writes. */
type Change = { readonly path: string; readonly content: string };

/** Reads a file, or returns null when it does not exist. */
const readIfExists = async (path: string): Promise<string | null> =>
  (await runtime.fs.exists(path)) ? await runtime.fs.readTextFile(path) : null;

/** The changes one package directory needs; none when it is no library. */
const packageChanges = async (pkgDir: string): Promise<Change[]> => {
  const manifestPath = `${pkgDir}/package.json`;
  const configPath = `${pkgDir}/tsconfig.build.json`;
  const text = await readIfExists(runtime.path.join(REPO_ROOT, manifestPath));

  if (text === null) {
    return [];
  }

  const manifest = JSON.parse(text) as Manifest;

  if (!isLibrary(manifest)) {
    return [];
  }

  const options = LIBRARY_OPTIONS[manifest.name ?? ""] ?? {};
  const manifestText = applyLibraryFields(
    text,
    libraryFields(pkgDir, manifest, options),
  );
  const configText = buildConfigText(pkgDir);
  const currentConfig = await readIfExists(
    runtime.path.join(REPO_ROOT, configPath),
  );

  return [
    ...(manifestText === text
      ? []
      : [{ path: manifestPath, content: manifestText }]),
    ...(configText === currentConfig
      ? []
      : [{ path: configPath, content: configText }]),
  ];
};

/** The changes the libraries need, relative to the repository root. */
const collectChanges = async (): Promise<Change[]> => {
  const pkgDirs: string[] = [];

  for await (const entry of runtime.fs.readDir(
    runtime.path.join(REPO_ROOT, PACKAGES_DIR),
  )) {
    if (entry.isDirectory) {
      pkgDirs.push(`${PACKAGES_DIR}/${entry.name}`);
    }
  }

  pkgDirs.sort();

  return (await Promise.all(pkgDirs.map(packageChanges))).flat();
};

const main = async (): Promise<void> => {
  const check = runtime.process.args.includes("--check");
  const changes = await collectChanges();

  if (check) {
    if (changes.length > 0) {
      console.error(
        `${changes.length} library build file(s) are out of date; run node ./etc/scripts/gen-library-manifests.ts:\n  ${changes.map((change) => change.path).join("\n  ")}`,
      );
      runtime.process.setExitCode(1);
    }

    return;
  }

  await Promise.all(
    changes.map((change) =>
      runtime.fs.writeTextFile(
        runtime.path.join(REPO_ROOT, change.path),
        change.content,
      ),
    ),
  );

  for (const change of changes) {
    console.log(`wrote ${change.path}`);
  }
};

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  await main();
}
