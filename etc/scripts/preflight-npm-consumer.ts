// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Release preflight: install the Go bridge library, @eserstack/ajan, the way
 * an npm user would, and load it.
 *
 * Builds @eserstack/standards and @eserstack/ajan, packs both, installs the
 * tarballs with npm into a scratch project OUTSIDE the repository, and loads
 * the bridge there under Node through node:ffi, as a library that depends on
 * it does. Doing it outside the repo is the whole point: inside the monorepo,
 * Node walks up to the workspace's node_modules and hides every unpublished or
 * undeclared dependency — which is how v4.5.0 shipped a bundle that imported a
 * package not on npm and only failed in CI. Until TASK-254 this checked the
 * eser npm bundle, which loaded the bridge the same way; the npm `eser` is now
 * the launcher of the Go binary, which needs no bridge.
 *
 * Deliberately no workspace or registry imports, only Node built-ins and
 * dist-utils.ts: it checks the library as npm installs it, so it must not lean
 * on the workspace it checks.
 *
 * Usage:
 *   node etc/scripts/preflight-npm-consumer.ts [options]
 *
 * Options:
 *   --runtime=node       Load the installed library with this runtime (default
 *                        and only value: node).
 *   --require-native     Fail unless the bridge loads and reports the
 *                        library's version. Use with ESER_AJAN_LIB_PATH
 *                        pointing at a freshly built library; without it a
 *                        scratch install has no native library for an
 *                        unreleased version and the graceful failure is the
 *                        expected outcome.
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

/** The library build of @eserstack/standards and @eserstack/ajan. */
const BUILD_TIMEOUT_MS = 180_000;

/** pnpm pack of one package directory into one tarball. */
const PACK_TIMEOUT_MS = 60_000;

/** npm install of the tarballs, which fetches the optional platform packages. */
const NPM_INSTALL_TIMEOUT_MS = 180_000;

/** One load of the bridge under Node. */
const LOAD_TIMEOUT_MS = 30_000;

/** The packages installed: the bridge and its one dependency. */
const PACKAGES = ["standards", "ajan"] as const;

/**
 * What the consumer runs: it loads the bridge from its node_modules and prints
 * the version the library reports.
 */
const LOAD_SCRIPT = [
  'const ajan = await import("@eserstack/ajan");',
  "const lib = await ajan.loadEserAjan();",
  "try {",
  "  const { version, abi } = lib.handshake;",
  "  console.log(`eser-ajan version ${version} (dispatcher ABI ${abi}, ${lib.backend})`);",
  "} finally {",
  "  lib.close();",
  "}",
].join("\n");

/** The exit code and the decoded output of one command. */
export type RunResult = { code: number; stdout: string; stderr: string };

/** The options the preflight reads from its arguments. */
export type PreflightOptions = { runtime: "node"; requireNative: boolean };

/**
 * Runs `cmd` in `cwd` and returns its exit code and output for the caller to
 * judge, with `env` as its environment (this process's when not given). A run
 * that `timeoutMs` stops throws instead: its exit code would only say that it
 * was killed, and a load of the bridge would read that as the expected
 * graceful failure.
 */
export const run = (
  cmd: readonly string[],
  cwd: string,
  timeoutMs: number,
  env?: Readonly<Record<string, string | undefined>>,
): Promise<RunResult> =>
  new Promise((resolve, reject) => {
    const signal = AbortSignal.timeout(timeoutMs);
    const child = childProcess.spawn(cmd[0]!, cmd.slice(1), {
      cwd,
      signal,
      stdio: ["ignore", "pipe", "pipe"],
      ...(env === undefined ? {} : { env }),
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

const main = async (): Promise<void> => {
  const { runtime, requireNative } = parseOptions(process.argv.slice(2));
  const repoRoot = distUtils.repoRootFrom(import.meta.dirname);
  const ajanDir = `${repoRoot}/pkg/@eserstack/ajan`;
  const manifest = JSON.parse(
    await fs.readFile(`${ajanDir}/package.json`, "utf8"),
  ) as { version: string };

  console.log("Building @eserstack/standards and @eserstack/ajan ...");
  must(
    await run(
      [
        "pnpm",
        ...PACKAGES.flatMap((name) => ["--filter", `@eserstack/${name}`]),
        "build",
      ],
      repoRoot,
      BUILD_TIMEOUT_MS,
    ),
    "the library build",
  );

  // Both directories live under the OS temp dir, never under the repo.
  const packDir = await fs.mkdtemp(`${os.tmpdir()}/ajan-preflight-pack-`);
  const consumerDir = await fs.mkdtemp(
    `${os.tmpdir()}/ajan-preflight-consumer-`,
  );

  try {
    // pnpm pack, as the publish job's pnpm publish does: it puts
    // publishConfig.exports in place and rewrites the workspace: ranges.
    await Promise.all(
      PACKAGES.map(async (name) =>
        must(
          await run(
            ["pnpm", "pack", "--pack-destination", packDir],
            `${repoRoot}/pkg/@eserstack/${name}`,
            PACK_TIMEOUT_MS,
          ),
          `pnpm pack of @eserstack/${name}`,
        ),
      ),
    );

    const tarballs = (await fs.readdir(packDir))
      .filter((name) => name.endsWith(".tgz"))
      .map((name) => `${packDir}/${name}`);
    if (tarballs.length !== PACKAGES.length) {
      throw new Error(
        `expected ${PACKAGES.length} tarballs in ${packDir}, found ${tarballs.join(", ")}`,
      );
    }

    await fs.writeFile(
      `${consumerDir}/package.json`,
      '{"name":"ajan-preflight-consumer","private":true,"version":"1.0.0","type":"module"}\n',
    );

    console.log(
      `Installing ${tarballs.length} tarballs into ${consumerDir} ...`,
    );
    must(
      await run(
        ["npm", "install", "--no-audit", "--no-fund", ...tarballs],
        consumerDir,
        NPM_INSTALL_TIMEOUT_MS,
      ),
      "npm install of the packed library",
    );

    // The Node that runs this script, so the matrix's Node is the one that
    // loads the bridge.
    const load = await run(
      [process.execPath, "--input-type=module", "-e", LOAD_SCRIPT],
      consumerDir,
      LOAD_TIMEOUT_MS,
    );
    const output = `${load.stdout}${load.stderr}`;

    // Whatever happens, the failure must never tell an npm user to install deno.
    if (/deno/i.test(output)) {
      throw new Error(
        `loading @eserstack/ajan mentions deno — the npm package must not require it:\n${output}`,
      );
    }

    if (load.code === 0) {
      // The platform packages are pinned to this exact version; if a library
      // loaded it must be this build, not an older one that happened to resolve.
      if (!load.stdout.includes(manifest.version)) {
        throw new Error(
          `the bridge reported "${load.stdout.trim()}" but @eserstack/ajan is ${manifest.version} — a mismatched library was loaded`,
        );
      }
      console.log(`${runtime} @eserstack/ajan → ${load.stdout.trim()}`);
    } else if (requireNative) {
      throw new Error(
        `--require-native: @eserstack/ajan did not load the native library under ${runtime}:\n${output}`,
      );
    } else {
      console.log(
        `${runtime} @eserstack/ajan → failed gracefully without mentioning deno (no native library for an unreleased version)`,
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
