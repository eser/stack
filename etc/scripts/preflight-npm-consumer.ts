// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Release preflight: install the CLI npm bundle the way a user would.
 *
 * Packs `pkg/@eserstack/cli/dist` into a tarball, installs it with npm into a
 * scratch project OUTSIDE the repository, and runs the same smoke commands the
 * pipeline's no-Deno job runs. Doing it outside the repo is the whole point:
 * inside the monorepo, Node walks up to the workspace's node_modules and hides
 * every unpublished or undeclared dependency — which is how v4.5.0 shipped a
 * bundle that imported a package not on npm and only failed in CI — or fails
 * to find one that IS declared (koffi lives under @eserstack/ajan in the pnpm
 * tree, unreachable from cli/dist), which kept the Node cross-runtime job red.
 *
 * Deliberately no workspace or registry imports (see gen-jsr-manifests.ts for
 * why).
 *
 * Usage:
 *   deno run --allow-all etc/scripts/preflight-npm-consumer.ts [options]
 *
 * Options:
 *   --runtime=node|bun   Run the installed bundle with this runtime (default:
 *                        node). Bun executes the same eser.js through its own
 *                        FFI backend.
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

import * as distUtils from "./dist-utils.ts";

const decoder = new TextDecoder();

// Each bound fails one stalled step with a message that names it, inside the
// preflight step's five-minute limit, which stays the backstop.

/** npm pack of the local dist directory into one tarball. */
const NPM_PACK_TIMEOUT_MS = 60_000;

/** npm install of the tarball, which fetches its dependencies from npm. */
const NPM_INSTALL_TIMEOUT_MS = 180_000;

/** One eser command (--help, version, ajan version) under Node or Bun. */
const ESER_COMMAND_TIMEOUT_MS = 30_000;

type RunResult = { code: number; stdout: string; stderr: string };

/**
 * Runs `cmd` in `cwd` and returns its exit code and output for the caller to
 * judge. A run that `timeoutMs` stops throws instead: its exit code would only
 * say that it was killed, and `eser ajan version` would read that as the
 * expected graceful failure.
 */
const run = async (
  cmd: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<RunResult> => {
  const signal = AbortSignal.timeout(timeoutMs);
  const output = await new Deno.Command(cmd[0]!, {
    args: cmd.slice(1),
    cwd,
    stdout: "piped",
    stderr: "piped",
    signal,
  }).output();

  // A failed run with an aborted signal is one the timeout stopped.
  if (!output.success && signal.aborted) {
    const commandLine = cmd.join(" ");

    throw new Error(
      `${commandLine} (in ${cwd}): did not finish within ${timeoutMs} ms and was stopped; rerun the preflight, and if it stops again, run the command by hand in that directory to see where it hangs (for npm, check that the registry is reachable)`,
    );
  }

  return {
    code: output.code,
    stdout: decoder.decode(output.stdout),
    stderr: decoder.decode(output.stderr),
  };
};

const must = (result: RunResult, what: string): void => {
  if (result.code !== 0) {
    throw new Error(
      `${what} failed (exit ${result.code})\n${result.stdout}${result.stderr}`,
    );
  }
};

const parseOptions = (): {
  runtime: "node" | "bun";
  requireNative: boolean;
} => {
  const runtimeArg =
    Deno.args
      .find((a) => a.startsWith("--runtime="))
      ?.slice("--runtime=".length) ?? "node";

  if (runtimeArg !== "node" && runtimeArg !== "bun") {
    throw new Error(`--runtime must be node or bun, got "${runtimeArg}"`);
  }

  return {
    runtime: runtimeArg,
    requireNative: Deno.args.includes("--require-native"),
  };
};

const main = async (): Promise<void> => {
  const { runtime, requireNative } = parseOptions();
  const repoRoot = distUtils.repoRootFrom(import.meta.dirname);
  const distDir = `${repoRoot}/pkg/@eserstack/cli/dist`;

  let packedText: string;
  try {
    packedText = await Deno.readTextFile(`${distDir}/package.json`);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(
        `${distDir} has no package.json; run \`deno task cli build\` first.`,
        { cause: error },
      );
    }
    throw error;
  }
  const packed = JSON.parse(packedText) as { version: string };

  // Both directories live under the OS temp dir, never under the repo.
  const packDir = await Deno.makeTempDir({ prefix: "eser-preflight-pack-" });
  const consumerDir = await Deno.makeTempDir({
    prefix: "eser-preflight-consumer-",
  });

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

    const tarballs: string[] = [];
    for await (const entry of Deno.readDir(packDir)) {
      if (entry.name.endsWith(".tgz")) tarballs.push(entry.name);
    }
    if (tarballs.length !== 1) {
      throw new Error(`expected one tarball in ${packDir}, found ${tarballs}`);
    }
    const tarball = `${packDir}/${tarballs[0]!}`;

    await Deno.writeTextFile(
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

    // Invoke the runtime explicitly rather than through the bin shim, so the
    // matrix's Node or Bun is the one that runs — not whatever `node` the
    // shebang finds first.
    const entry = `${consumerDir}/node_modules/eser/eser.js`;
    const eser = (...args: string[]) =>
      run([runtime, entry, ...args], consumerDir, ESER_COMMAND_TIMEOUT_MS);

    must(await eser("--help"), `${runtime} eser --help`);

    const version = await eser("version");
    must(version, `${runtime} eser version`);
    console.log(`${runtime} eser version → ${version.stdout.trim()}`);

    const ajan = await eser("ajan", "version");
    const ajanOutput = `${ajan.stdout}${ajan.stderr}`;

    // Whatever happens, the failure must never tell an npm user to install Deno.
    if (/deno/i.test(ajanOutput)) {
      throw new Error(
        `eser ajan version mentions Deno — the npm package must not require it:\n${ajanOutput}`,
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
        `${runtime} eser ajan version → failed gracefully without mentioning Deno (no native library for an unreleased version)`,
      );
    }

    console.log(`npm consumer preflight (${runtime}): OK`);
  } finally {
    await Deno.remove(packDir, { recursive: true });
    await Deno.remove(consumerDir, { recursive: true });
  }
};

if (import.meta.main) {
  // Script entry point: the preflight and CI run the file directly.
  // oxlint-disable-next-line node/no-top-level-await
  await main();
}
