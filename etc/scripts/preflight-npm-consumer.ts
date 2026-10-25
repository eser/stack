// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Release preflight: install the CLI npm bundle the way a user would.
 *
 * Packs `pkg/@eserstack/cli/dist` into a tarball, installs it with npm into a
 * scratch project OUTSIDE the repository, and runs the same smoke commands the
 * pipeline's npm smoke job runs. Doing it outside the repo is the whole point:
 * inside the monorepo, Node walks up to the workspace's node_modules and hides
 * every unpublished or undeclared dependency — which is how v4.5.0 shipped a
 * bundle that imported a package not on npm and only failed in CI — or fails
 * to find one that IS declared (a dependency of @eserstack/ajan lives under it
 * in the pnpm tree, unreachable from cli/dist), which kept the Node job red.
 *
 * Deliberately no workspace or registry imports, only Node built-ins and
 * dist-utils.ts: it checks the bundle as npm installs it, so it must not lean
 * on the workspace it checks.
 *
 * Usage:
 *   node etc/scripts/preflight-npm-consumer.ts [options]
 *
 * Options:
 *   --runtime=node       Run the installed bundle with this runtime (default
 *                        and only value: node).
 *   --require-native     Fail unless `eser ajan version` loads the native
 *                        library and reports the bundle's version. Use with
 *                        ESER_AJAN_LIB_PATH pointing at a freshly built
 *                        library; without it a scratch install has no native
 *                        library for an unreleased version and the graceful
 *                        failure is the expected outcome.
 *
 * @module
 */

// The progress and result lines it prints are the preflight's log.
/* oxlint-disable no-console */

import * as childProcess from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as process from "node:process";
import * as distUtils from "./dist-utils.ts";

// Each bound fails one stalled step with a message that names it, inside the
// preflight step's five-minute limit, which stays the backstop.

/** npm pack of the local dist directory into one tarball. */
const NPM_PACK_TIMEOUT_MS = 60_000;

/** npm install of the tarball, which fetches its dependencies from npm. */
const NPM_INSTALL_TIMEOUT_MS = 180_000;

/** One eser command (--help, version, ajan version) under Node. */
const ESER_COMMAND_TIMEOUT_MS = 30_000;

/** The exit code and the decoded output of one command. */
export type RunResult = { code: number; stdout: string; stderr: string };

/** The options the preflight reads from its arguments. */
export type PreflightOptions = { runtime: "node"; requireNative: boolean };

/**
 * Runs `cmd` in `cwd` and returns its exit code and output for the caller to
 * judge. A run that `timeoutMs` stops throws instead: its exit code would only
 * say that it was killed, and `eser ajan version` would read that as the
 * expected graceful failure.
 */
export const run = (
  cmd: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<RunResult> =>
  new Promise((resolve, reject) => {
    const signal = AbortSignal.timeout(timeoutMs);
    const child = childProcess.spawn(cmd[0]!, cmd.slice(1), {
      cwd,
      signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    child.on("error", (error) => {
      // An aborted signal means the timeout stopped the run.
      if (signal.aborted) {
        const commandLine = cmd.join(" ");

        reject(
          new Error(
            `${commandLine} (in ${cwd}): did not finish within ${timeoutMs} ms and was stopped; rerun the preflight, and if it stops again, run the command by hand in that directory to see where it hangs (for npm, check that the registry is reachable)`,
            { cause: error },
          ),
        );

        return;
      }

      reject(error);
    });

    child.on("close", (code) => {
      // The error handler already settled a run the timeout stopped.
      if (signal.aborted) {
        return;
      }

      resolve({
        // A child that a signal killed has no exit code.
        code: code === null ? 1 : code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });

const must = (result: RunResult, what: string): void => {
  if (result.code !== 0) {
    throw new Error(
      `${what} failed (exit ${result.code})\n${result.stdout}${result.stderr}`,
    );
  }
};

/** Reads `--runtime=` and `--require-native` from the script's arguments. */
export const parseOptions = (args: readonly string[]): PreflightOptions => {
  const runtimeArg =
    args.find((a) => a.startsWith("--runtime="))?.slice("--runtime=".length) ??
    "node";

  if (runtimeArg !== "node") {
    throw new Error(`--runtime must be node, got "${runtimeArg}"`);
  }

  return {
    runtime: runtimeArg,
    requireNative: args.includes("--require-native"),
  };
};

const isNotFound = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const main = async (): Promise<void> => {
  const { runtime, requireNative } = parseOptions(process.argv.slice(2));
  const repoRoot = distUtils.repoRootFrom(import.meta.dirname);
  const distDir = `${repoRoot}/pkg/@eserstack/cli/dist`;

  let packedText: string;
  try {
    packedText = await fs.readFile(`${distDir}/package.json`, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(
        `${distDir} has no package.json; run \`pnpm cli build\` first.`,
        { cause: error },
      );
    }
    throw error;
  }
  const packed = JSON.parse(packedText) as { version: string };

  // Both directories live under the OS temp dir, never under the repo.
  const packDir = await fs.mkdtemp(`${os.tmpdir()}/eser-preflight-pack-`);
  const consumerDir = await fs.mkdtemp(
    `${os.tmpdir()}/eser-preflight-consumer-`,
  );

  try {
    console.log(`Packing ${distDir} ...`);
    must(
      await run(
        ["npm", "pack", "--pack-destination", packDir],
        distDir,
        NPM_PACK_TIMEOUT_MS,
      ),
      "npm pack",
    );

    const tarballs = (await fs.readdir(packDir)).filter((name) =>
      name.endsWith(".tgz"),
    );
    if (tarballs.length !== 1) {
      throw new Error(`expected one tarball in ${packDir}, found ${tarballs}`);
    }
    const tarball = `${packDir}/${tarballs[0]!}`;

    await fs.writeFile(
      `${consumerDir}/package.json`,
      '{"name":"eser-preflight-consumer","private":true,"version":"1.0.0"}\n',
    );

    console.log(`Installing ${tarballs[0]} into ${consumerDir} ...`);
    must(
      await run(
        ["npm", "install", "--no-audit", "--no-fund", tarball],
        consumerDir,
        NPM_INSTALL_TIMEOUT_MS,
      ),
      "npm install of the packed CLI",
    );

    // Invoke the Node that runs this script rather than the bin shim, so the
    // matrix's Node is the one that runs — not whatever `node` the shebang
    // finds first.
    const entry = `${consumerDir}/node_modules/eser/eser.js`;
    const eser = (...args: string[]): Promise<RunResult> =>
      run(
        [process.execPath, entry, ...args],
        consumerDir,
        ESER_COMMAND_TIMEOUT_MS,
      );

    must(await eser("--help"), `${runtime} eser --help`);

    const version = await eser("version");
    must(version, `${runtime} eser version`);
    console.log(`${runtime} eser version → ${version.stdout.trim()}`);

    const ajan = await eser("ajan", "version");
    const ajanOutput = `${ajan.stdout}${ajan.stderr}`;

    // Whatever happens, the failure must never tell an npm user to install deno.
    if (/deno/i.test(ajanOutput)) {
      throw new Error(
        `eser ajan version mentions deno — the npm package must not require it:\n${ajanOutput}`,
      );
    }

    if (ajan.code === 0) {
      // The platform packages are pinned to this exact version; if a library
      // loaded it must be this build, not an older one that happened to resolve.
      if (!ajan.stdout.includes(packed.version)) {
        throw new Error(
          `eser ajan version reported "${ajan.stdout.trim()}" but the bundle is ${packed.version} — a mismatched library was loaded`,
        );
      }
      console.log(`${runtime} eser ajan version → ${ajan.stdout.trim()}`);
    } else if (requireNative) {
      throw new Error(
        `--require-native: eser ajan version did not load the native library under ${runtime}:\n${ajanOutput}`,
      );
    } else {
      console.log(
        `${runtime} eser ajan version → failed gracefully without mentioning deno (no native library for an unreleased version)`,
      );
    }

    console.log(`npm consumer preflight (${runtime}): OK`);
  } finally {
    await fs.rm(packDir, { recursive: true, force: true });
    await fs.rm(consumerDir, { recursive: true, force: true });
  }
};

if (import.meta.main) {
  // Script entry point: the preflight and CI run the file directly.
  // oxlint-disable-next-line node/no-top-level-await
  await main();
}
