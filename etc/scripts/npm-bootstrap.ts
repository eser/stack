// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Bootstraps the npm names a release would publish for the first time.
 *
 * npm attaches a trusted publisher only to a package that exists, so the
 * release's OIDC publish cannot create a name: its first PUT answers 404. The
 * owner publishes a placeholder for each such name once, `0.0.0-bootstrap.0`
 * under the `bootstrap` dist-tag, which takes no release version. npm points
 * `latest` at the placeholder too, since a package always has one, until the
 * first release moves it; nothing installs it meanwhile, because the
 * launchers pin their platform packages to the exact release version. The
 * owner then adds the trusted publisher on
 * npmjs.com ("Bootstrapping New npm Names" in docs/agents/release-and-ci.md).
 *
 * Without `--publish` it only reads the registry: it asks
 * `npm view <name> version` for every workspace package that is not private
 * (or the names given) and lists the ones npm answers E404 for. Any other
 * failure stops it, so a network error never reads as a free name. With
 * `--publish`, after `npm whoami` confirms a login, it writes each placeholder
 * under etc/temp/npm-bootstrap and runs `npm publish --access public --tag
 * bootstrap` in it, one at a time and attached to the terminal, so npm can ask
 * for a one-time password or a browser login. `--otp <code>` passes one
 * through. It prints the trusted publisher and tidy-up steps at the end.
 *
 * Only the owner runs it with `--publish`; agents never publish.
 *
 * Usage:
 *   node ./etc/scripts/npm-bootstrap.ts                      # list the names npm lacks
 *   node ./etc/scripts/npm-bootstrap.ts --publish            # publish their placeholders
 *   node ./etc/scripts/npm-bootstrap.ts --publish --otp 123456 @eserstack/eser-linux-x64
 *
 * @module
 */

// The names it finds and the steps it prints are the command's output.
/* oxlint-disable no-console */

// etc/scripts belongs to no workspace package, so no import map resolves the
// bare "@eserstack/standards/cross-runtime". The cross-runtime layer imports
// no other package, so it loads by path from here.
import * as crossRuntime from "../../pkg/@eserstack/standards/cross-runtime/mod.ts";
import * as publishLibraries from "./publish-libraries.ts";

const { runtime } = crossRuntime;
const REPO_ROOT = runtime.path.resolve(import.meta.dirname ?? ".", "..", "..");

/** The placeholder version: a prerelease below every release. */
export const BOOTSTRAP_VERSION = "0.0.0-bootstrap.0";

/** The dist-tag of the placeholder, removed after the first release. */
export const BOOTSTRAP_TAG = "bootstrap";

/** Where the placeholders are written, relative to the repository root. */
export const BOOTSTRAP_DIR = "etc/temp/npm-bootstrap";

/** The workflow the trusted publisher of every name names. */
const TRUSTED_WORKFLOW = "build.yml";

/** One `npm view`. */
const VIEW_TIMEOUT_MS = 60_000;

/** How many `npm view` calls run at once. */
const VIEW_CONCURRENCY = 8;

/** One `npm publish`, which may wait for a login in the browser. */
const PUBLISH_TIMEOUT_MS = 600_000;

const USAGE = "usage: npm-bootstrap.ts [--publish] [--otp <code>] [<name>...]";

/** The options the command reads from its arguments. */
export type BootstrapOptions = {
  readonly publish: boolean;
  readonly otp: string | null;
  readonly names: readonly string[];
};

/**
 * Reads `--publish`, `--otp <code>` (or `--otp=<code>`) and package names.
 *
 * @throws Error for an unknown flag or an `--otp` without a code
 */
export const parseOptions = (args: readonly string[]): BootstrapOptions => {
  let publish = false;
  let otp: string | null = null;
  const names: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";

    if (arg === "--publish") {
      publish = true;
    } else if (arg === "--otp" || arg.startsWith("--otp=")) {
      const code = arg === "--otp" ? args[++i] : arg.slice("--otp=".length);

      if (code === undefined || code === "" || code.startsWith("--")) {
        throw new Error(`--otp needs a code; ${USAGE}`);
      }

      otp = code;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown argument ${arg}; ${USAGE}`);
    } else {
      names.push(arg);
    }
  }

  return { publish, otp, names };
};

/** The names of the workspace packages that are not private, sorted. */
export const publishableNames = (
  manifests: readonly { readonly name?: string; readonly private?: boolean }[],
): string[] =>
  manifests
    .filter((manifest) => manifest.private !== true)
    .map((manifest) => manifest.name ?? "")
    .filter((name) => name !== "")
    .sort((left, right) => left.localeCompare(right));

/**
 * The names to check: every publishable one, or the given ones.
 *
 * @throws Error for a given name that is no publishable workspace package
 */
export const selectTargets = (
  publishable: readonly string[],
  names: readonly string[],
): string[] => {
  const unknown = names.filter((name) => !publishable.includes(name));

  if (unknown.length > 0) {
    throw new Error(
      `${unknown.join(", ")}: not a workspace package that is published`,
    );
  }

  return names.length > 0 ? [...names] : [...publishable];
};

/**
 * What `npm view <name> version` says about a name: npm has it, or it
 * answered E404.
 *
 * @throws Error for any other failure, such as a network error
 */
export const viewState = (
  name: string,
  result: { readonly success: boolean; readonly output: string },
): "published" | "missing" => {
  if (result.success) {
    return "published";
  }

  if (result.output.includes("E404")) {
    return "missing";
  }

  throw new Error(
    `npm view ${name} version failed without an E404, so whether npm has the name is unknown:\n${result.output.trim()}`,
  );
};

/** The fields of a placeholder's package.json. */
export type PlaceholderManifest = {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly license: string;
  readonly repository: { readonly type: string; readonly url: string };
};

/** The package.json of a placeholder. */
export const placeholderManifest = (name: string): PlaceholderManifest => ({
  name,
  version: BOOTSTRAP_VERSION,
  description:
    "A placeholder that reserves this name for eserstack; install a release version.",
  license: "Apache-2.0",
  repository: { type: "git", url: "git+https://github.com/eser/stack.git" },
});

/** The directory of a placeholder, relative to the repository root. */
export const placeholderDir = (name: string): string =>
  `${BOOTSTRAP_DIR}/${name.replace(/^@/, "").replace("/", "-")}`;

/** The arguments of the `npm publish` of a placeholder. */
export const publishArgs = (otp: string | null): string[] => [
  "publish",
  "--access",
  "public",
  "--tag",
  BOOTSTRAP_TAG,
  ...(otp === null ? [] : [`--otp=${otp}`]),
];

/** What the owner does after the placeholders are on npm. */
export const nextSteps = (names: readonly string[]): string =>
  [
    "Next, for each name:",
    `1. Add a trusted publisher: GitHub Actions, repository eser/stack, workflow ${TRUSTED_WORKFLOW}:`,
    ...names.map((name) => `     https://www.npmjs.com/package/${name}/access`),
    "2. Let the next release publish the release versions over OIDC.",
    "3. Then remove the placeholders' tag and deprecate them:",
    ...names.flatMap((name) => [
      `     npm dist-tag rm ${name} ${BOOTSTRAP_TAG}`,
      `     npm deprecate ${name}@${BOOTSTRAP_VERSION} "placeholder"`,
    ]),
  ].join("\n");

const decoder = new TextDecoder();

/** Runs npm with its output captured. */
const npmCaptured = async (
  args: string[],
): Promise<{ success: boolean; output: string }> => {
  const result = await runtime.exec.spawn("npm", args, {
    cwd: REPO_ROOT,
    stdout: "piped",
    stderr: "piped",
    signal: AbortSignal.timeout(VIEW_TIMEOUT_MS),
  });

  return {
    success: result.success,
    output: `${decoder.decode(result.stdout)}${decoder.decode(result.stderr)}`,
  };
};

/** The names npm answers E404 for, in the order given. */
const missingNames = async (names: readonly string[]): Promise<string[]> => {
  const missing = new Set<string>();
  const queue = [...names];

  const worker = async (): Promise<void> => {
    for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
      // Sequential within a worker on purpose: the pool bounds how many npm
      // processes run at once.
      // oxlint-disable-next-line no-await-in-loop
      const result = await npmCaptured(["view", name, "version"]);

      if (viewState(name, result) === "missing") {
        missing.add(name);
      }
    }
  };

  await Promise.all(Array.from({ length: VIEW_CONCURRENCY }, worker));

  return names.filter((name) => missing.has(name));
};

/** Writes a placeholder and publishes it, attached to the terminal. */
const publishPlaceholder = async (
  name: string,
  otp: string | null,
): Promise<void> => {
  const dir = runtime.path.join(REPO_ROOT, placeholderDir(name));

  await runtime.fs.mkdir(dir, { recursive: true });
  await runtime.fs.writeTextFile(
    runtime.path.join(dir, "package.json"),
    `${JSON.stringify(placeholderManifest(name), null, 2)}\n`,
  );
  await runtime.fs.writeTextFile(
    runtime.path.join(dir, "README.md"),
    `# ${name}\n\nA placeholder that reserves this name for [eserstack](https://github.com/eser/stack). Install a release version.\n`,
  );

  console.log(`\nPublishing ${name}@${BOOTSTRAP_VERSION}`);

  const result = await runtime.exec.spawn("npm", publishArgs(otp), {
    cwd: dir,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
  });

  if (!result.success) {
    throw new Error(
      `npm publish of ${name} exited with code ${result.code}; the names before it are on npm, so run the command again for the rest`,
    );
  }
};

const main = async (): Promise<void> => {
  const options = parseOptions(runtime.process.args);
  const targets = selectTargets(
    publishableNames(await publishLibraries.workspaceManifests()),
    options.names,
  );

  console.log(`Asking npm about ${targets.length} names...`);

  const missing = await missingNames(targets);

  if (missing.length === 0) {
    console.log("npm has every name; nothing to bootstrap.");
    return;
  }

  console.log(
    `npm does not have ${missing.length} names:\n  ${missing.join("\n  ")}`,
  );

  if (!options.publish) {
    console.log(
      `\nRun again with --publish, logged in to npm as an owner of the eserstack organization, to publish ${BOOTSTRAP_VERSION} of each under the ${BOOTSTRAP_TAG} tag.`,
    );
    return;
  }

  const whoami = await npmCaptured(["whoami"]);

  if (!whoami.success) {
    throw new Error(
      `npm whoami failed; log in with npm login first:\n${whoami.output.trim()}`,
    );
  }

  console.log(`Publishing as ${whoami.output.trim()}.`);

  // One at a time: each publish may stop for a password or a browser login.
  await missing.reduce(
    (previous, name) =>
      previous.then(() => publishPlaceholder(name, options.otp)),
    Promise.resolve(),
  );

  console.log(`\nPublished ${missing.length} placeholders.\n`);
  console.log(nextSteps(missing));
};

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  await main();
}
