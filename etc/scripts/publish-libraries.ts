// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Publishes the @eserstack libraries to npm: every workspace package that is
 * not private and has `exports` (isLibrary in gen-library-manifests.ts). The
 * private test seam and the ajan-* and noskills-* platform packages, which
 * the publish-ajan job publishes with their binaries, are left out.
 *
 * It runs after `pnpm -r build`, which writes each library's dist/. A real
 * run asks npm for each library's version the way the publish-ajan job does
 * (`npm view <name>@<version> version`), keeps the ones npm lacks, and runs
 * one `pnpm -r publish --provenance --access public --no-git-checks` filtered
 * to them, so a second run of the same version publishes nothing. pnpm packs
 * each library with its publishConfig.exports in place of `exports` and its
 * `workspace:*` ranges rewritten to the exact version.
 *
 * `--dry-run` asks no registry: it runs the same publish command with
 * `--dry-run` for every library, `--force` so pnpm does not look the versions
 * up either, and the @eserstack scope on an unreachable registry, so a request
 * for an @eserstack name fails the run. It then checks that pnpm handled
 * every library. The release preflight runs it.
 *
 * Usage:
 *   node ./etc/scripts/publish-libraries.ts            # publish what npm lacks
 *   node ./etc/scripts/publish-libraries.ts --dry-run  # no registry, no upload
 *
 * @module
 */

// The progress and result lines it prints are the publish log.
/* oxlint-disable no-console */

// etc/scripts belongs to no workspace package, so no import map resolves the
// bare "@eserstack/standards/cross-runtime". The cross-runtime layer imports
// no other package, so it loads by path from here.
import * as crossRuntime from "../../pkg/@eserstack/standards/cross-runtime/mod.ts";
import * as libraryManifests from "./gen-library-manifests.ts";

const { runtime } = crossRuntime;
const REPO_ROOT = runtime.path.resolve(import.meta.dirname ?? ".", "..", "..");
const PACKAGES_DIR = "pkg/@eserstack";

/**
 * The registry a dry run gives the @eserstack scope: the discard port of the
 * loopback address, where nothing listens.
 */
export const UNREACHABLE_REGISTRY = "http://127.0.0.1:9/";

/** One `npm view` of a library's version. */
const VIEW_TIMEOUT_MS = 60_000;

/** How many `npm view` calls run at once. */
const VIEW_CONCURRENCY = 8;

/** The whole `pnpm -r publish` of every library. */
const PUBLISH_TIMEOUT_MS = 900_000;

/** The options the command reads from its arguments. */
export type PublishOptions = {
  readonly dryRun: boolean;
};

/**
 * Reads `--dry-run`.
 *
 * @throws Error for any other argument
 */
export const parseOptions = (args: readonly string[]): PublishOptions => {
  for (const arg of args) {
    if (arg !== "--dry-run") {
      throw new Error(
        `unknown argument ${arg}; usage: publish-libraries.ts [--dry-run]`,
      );
    }
  }

  return { dryRun: args.includes("--dry-run") };
};

/** A library and the version it publishes. */
export type Library = {
  readonly name: string;
  readonly version: string;
};

/** The libraries among workspace manifests, sorted by name. */
export const selectLibraries = (
  manifests: readonly (libraryManifests.Manifest & {
    readonly version?: string;
  })[],
): Library[] =>
  manifests
    .filter((manifest) => libraryManifests.isLibrary(manifest))
    .map((manifest) => ({
      name: manifest.name ?? "",
      version: manifest.version ?? "",
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

/**
 * Whether `npm view <name>@<version> version` reports that npm has the
 * version: it exits 0 and prints the version. npm exits with E404 for a
 * missing package or version.
 */
export const isPublished = (
  library: Library,
  result: { readonly success: boolean; readonly stdout: string },
): boolean => result.success && result.stdout.trim() === library.version;

/** The arguments of the one `pnpm -r publish` for these libraries. */
export const publishArgs = (
  libraries: readonly Library[],
  dryRun: boolean,
): string[] => [
  "-r",
  ...libraries.flatMap((library) => ["--filter", library.name]),
  "publish",
  "--provenance",
  "--access",
  "public",
  "--no-git-checks",
  ...(dryRun
    ? [
        "--dry-run",
        "--force",
        `--config.@eserstack:registry=${UNREACHABLE_REGISTRY}`,
      ]
    : []),
];

/** The libraries whose `<name>@<version>` the pnpm output never names. */
export const missingFromOutput = (
  libraries: readonly Library[],
  output: string,
): Library[] =>
  libraries.filter(
    (library) => !output.includes(`${library.name}@${library.version}`),
  );

const decoder = new TextDecoder();

/** Runs a command at the repository root and returns its decoded output. */
const run = async (
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<{
  success: boolean;
  code: number;
  stdout: string;
  output: string;
}> => {
  const result = await runtime.exec.spawn(cmd, args, {
    cwd: REPO_ROOT,
    stdout: "piped",
    stderr: "piped",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const stdout = decoder.decode(result.stdout);

  return {
    success: result.success,
    code: result.code,
    stdout,
    output: `${stdout}${decoder.decode(result.stderr)}`,
  };
};

/** Every workspace manifest under pkg/@eserstack. */
export const workspaceManifests = async (): Promise<
  libraryManifests.Manifest[]
> => {
  const manifests: libraryManifests.Manifest[] = [];

  for await (const entry of runtime.fs.readDir(
    runtime.path.join(REPO_ROOT, PACKAGES_DIR),
  )) {
    const manifestPath = runtime.path.join(
      REPO_ROOT,
      PACKAGES_DIR,
      entry.name,
      "package.json",
    );

    if (entry.isDirectory && (await runtime.fs.exists(manifestPath))) {
      manifests.push(
        JSON.parse(
          await runtime.fs.readTextFile(manifestPath),
        ) as libraryManifests.Manifest,
      );
    }
  }

  return manifests;
};

/** The libraries npm does not have at their version yet (network reads only). */
export const unpublishedLibraries = async (
  libraries: readonly Library[],
): Promise<Library[]> => {
  const published = new Set<string>();
  const queue = [...libraries];

  const worker = async (): Promise<void> => {
    for (
      let library = queue.shift();
      library !== undefined;
      library = queue.shift()
    ) {
      // Sequential within a worker on purpose: the pool bounds how many npm
      // processes run at once.
      // oxlint-disable-next-line no-await-in-loop
      const result = await run(
        "npm",
        ["view", `${library.name}@${library.version}`, "version"],
        VIEW_TIMEOUT_MS,
      );

      if (isPublished(library, result)) {
        published.add(library.name);
        console.log(
          `${library.name}@${library.version} is already on npm, skipping`,
        );
      }
    }
  };

  await Promise.all(Array.from({ length: VIEW_CONCURRENCY }, worker));

  return libraries.filter((library) => !published.has(library.name));
};

const main = async (): Promise<void> => {
  const options = parseOptions(runtime.process.args);
  const libraries = selectLibraries(await workspaceManifests());
  const targets = options.dryRun
    ? libraries
    : await unpublishedLibraries(libraries);

  if (targets.length === 0) {
    console.log(
      `All ${libraries.length} libraries are already on npm at their version; nothing to publish.`,
    );
    return;
  }

  const args = publishArgs(targets, options.dryRun);

  console.log(
    `${options.dryRun ? "Dry run: publishing" : "Publishing"} ${targets.length} of ${libraries.length} libraries:\n  ${targets.map((library) => `${library.name}@${library.version}`).join("\n  ")}`,
  );

  const result = await run("pnpm", args, PUBLISH_TIMEOUT_MS);

  console.log(result.output.trimEnd());

  if (!result.success) {
    throw new Error(
      `pnpm ${args.join(" ")} exited with code ${result.code}. A first publish of a name npm does not have, or a name without a trusted publisher, fails here; see "Bootstrapping New npm Names" in docs/agents/release-and-ci.md.`,
    );
  }

  const missing = missingFromOutput(targets, result.output);

  if (missing.length > 0) {
    throw new Error(
      `pnpm did not publish ${missing.map((library) => `${library.name}@${library.version}`).join(", ")}`,
    );
  }

  console.log(
    `\n${options.dryRun ? "Dry run passed for" : "Published"} ${targets.length} libraries.`,
  );
};

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  await main();
}
