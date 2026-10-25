// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Release preflight: install the noskills npm launcher the way a user would
 * (TASK-261).
 *
 * Packs `pkg/@eserstack/noskills/dist` (the launcher, from npm-build.ts) and
 * this host's platform package (`pkg/@eserstack/noskills-<platform>`, with
 * the binary `eser dev npm-binaries` staged), installs both with npm into a
 * scratch project OUTSIDE the repository, and checks that `npx noskills` runs
 * the Go binary, and that the binary reaches the TypeScript CLI the launcher
 * carries for the commands it forwards. Outside the repo, Node cannot find
 * the platform package through the workspace links, so a launcher that
 * resolves it wrongly fails here.
 *
 * npm fetches the other optional dependencies (the ajan libraries and the
 * other platforms' packages) from the registry; for a version that is not
 * published yet they are missing, which npm skips and the checks here do not
 * need.
 *
 * Deliberately no workspace or registry imports (see gen-jsr-manifests.ts for
 * why).
 *
 * Usage:
 *   go run ./cmd/eser dev compile --current-only
 *   go run ./cmd/eser dev npm-binaries
 *   deno run --allow-all pkg/@eserstack/noskills/scripts/npm-build.ts
 *   deno run --allow-all etc/scripts/preflight-noskills-launcher.ts
 *
 * @module
 */

// The progress and result lines it prints are the preflight's log.
// deno-lint-ignore-file no-console

import * as distUtils from "./dist-utils.ts";

const decoder = new TextDecoder();

/** npm pack of one package directory. */
const NPM_PACK_TIMEOUT_MS = 60_000;

/** npm install of the two tarballs and the registry's optional packages. */
const NPM_INSTALL_TIMEOUT_MS = 180_000;

/** One noskills command through npx. */
const NOSKILLS_COMMAND_TIMEOUT_MS = 30_000;

type RunResult = { code: number; stdout: string; stderr: string };

/**
 * Runs `cmd` in `cwd` and returns its exit code and output for the caller to
 * judge. A run that `timeoutMs` stops throws instead.
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

  if (!output.success && signal.aborted) {
    throw new Error(
      `${
        cmd.join(" ")
      } (in ${cwd}): did not finish within ${timeoutMs} ms and was stopped; rerun the preflight, and if it stops again, run the command by hand in that directory (for npm, check that the registry is reachable)`,
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

/** The `<process.platform>-<process.arch>` suffix of this host's package. */
const hostPlatform = (): string => {
  const os = Deno.build.os === "windows" ? "win32" : Deno.build.os;
  const arch = Deno.build.arch === "x86_64" ? "x64" : "arm64";

  return `${os}-${arch}`;
};

const packOne = async (dir: string, packDir: string): Promise<string> => {
  const before = new Set<string>();
  for await (const entry of Deno.readDir(packDir)) before.add(entry.name);

  must(
    await run(
      ["npm", "pack", "--pack-destination", packDir],
      dir,
      NPM_PACK_TIMEOUT_MS,
    ),
    `npm pack in ${dir}`,
  );

  const added: string[] = [];
  for await (const entry of Deno.readDir(packDir)) {
    if (entry.name.endsWith(".tgz") && !before.has(entry.name)) {
      added.push(entry.name);
    }
  }

  if (added.length !== 1) {
    throw new Error(`npm pack in ${dir} wrote ${added.length} tarballs`);
  }

  return `${packDir}/${added[0]!}`;
};

const main = async (): Promise<void> => {
  const repoRoot = distUtils.repoRootFrom(import.meta.dirname);
  const distDir = `${repoRoot}/pkg/@eserstack/noskills/dist`;
  const platformDir = `${repoRoot}/pkg/@eserstack/noskills-${hostPlatform()}`;
  const binary = `${platformDir}/noskills${
    Deno.build.os === "windows" ? ".exe" : ""
  }`;

  let packed: { version: string };
  try {
    packed = JSON.parse(await Deno.readTextFile(`${distDir}/package.json`));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(
        `${distDir} has no package.json; run pkg/@eserstack/noskills/scripts/npm-build.ts first.`,
        { cause: error },
      );
    }
    throw error;
  }

  try {
    await Deno.stat(binary);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(
        `${binary} is missing; run \`go run ./cmd/eser dev compile --current-only\` and \`go run ./cmd/eser dev npm-binaries\` first.`,
        { cause: error },
      );
    }
    throw error;
  }

  const packDir = await Deno.makeTempDir({
    prefix: "noskills-preflight-pack-",
  });
  const consumerDir = await Deno.makeTempDir({
    prefix: "noskills-preflight-consumer-",
  });

  try {
    const tarballs = [
      await packOne(distDir, packDir),
      await packOne(platformDir, packDir),
    ];

    await Deno.writeTextFile(
      `${consumerDir}/package.json`,
      '{"name":"noskills-preflight-consumer","private":true,"version":"1.0.0"}\n',
    );

    console.log(`Installing ${tarballs.join(" and ")} into ${consumerDir} ...`);
    must(
      await run(
        ["npm", "install", "--no-audit", "--no-fund", ...tarballs],
        consumerDir,
        NPM_INSTALL_TIMEOUT_MS,
      ),
      "npm install of the packed launcher",
    );

    // `npx noskills`, as a user and the v4.5.x hooks run it. The installed
    // bin is found locally, so npx does not reach the registry. (`npx --no
    // noskills --version` would be npx's own --version.)
    const noskills = (...args: string[]) =>
      run(
        ["npx", "noskills", ...args],
        consumerDir,
        NOSKILLS_COMMAND_TIMEOUT_MS,
      );

    const version = await noskills("--version");
    must(version, "npx noskills --version");
    if (version.stdout.trim() !== `noskills ${packed.version}`) {
      throw new Error(
        `npx noskills --version printed "${version.stdout.trim()}", want "noskills ${packed.version}"`,
      );
    }
    console.log(`npx noskills --version → ${version.stdout.trim()}`);

    const json = await noskills("version", "--json");
    must(json, "npx noskills version --json");
    const reported = JSON.parse(json.stdout) as {
      runtime?: string;
      version?: string;
    };
    if (reported.runtime !== "go" || reported.version !== packed.version) {
      throw new Error(
        `npx noskills version --json reported ${json.stdout.trim()}; the launcher did not run the Go binary of ${packed.version}`,
      );
    }
    console.log(`npx noskills version --json → runtime ${reported.runtime}`);

    // An unknown first word goes from the binary to the TypeScript CLI
    // bundle the launcher names in NOSKILLS_TS_BUNDLE, which prints its help.
    const forwarded = await noskills("no-such-command");
    if (!forwarded.stdout.includes("noskills <command> [options]")) {
      throw new Error(
        `npx noskills no-such-command did not reach the TypeScript CLI:\n${forwarded.stdout}${forwarded.stderr}`,
      );
    }
    console.log("npx noskills no-such-command → the TypeScript CLI's help");

    console.log("noskills launcher preflight: OK");
  } finally {
    await Deno.remove(packDir, { recursive: true });
    await Deno.remove(consumerDir, { recursive: true });
  }
};

if (import.meta.main) {
  // Script entry point: the preflight runs the file directly.
  // deno-lint-ignore no-top-level-await
  await main();
}
