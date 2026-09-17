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
 * Deliberately no workspace imports (see gen-jsr-manifests.ts for why).
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

import * as path from "jsr:@std/path@^1.1.4";

const decoder = new TextDecoder();

type RunResult = { code: number; stdout: string; stderr: string };

const run = async (
  cmd: string[],
  cwd: string,
): Promise<RunResult> => {
  const output = await new Deno.Command(cmd[0]!, {
    args: cmd.slice(1),
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();

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
  const runtimeArg = Deno.args.find((a) => a.startsWith("--runtime="))
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
  const scriptDir = path.dirname(path.fromFileUrl(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..", "..");
  const distDir = path.join(repoRoot, "pkg", "@eserstack", "cli", "dist");

  let packed: { version: string };
  try {
    packed = JSON.parse(
      await Deno.readTextFile(path.join(distDir, "package.json")),
    ) as { version: string };
  } catch {
    throw new Error(
      `${distDir} has no package.json — run \`deno task cli build\` first.`,
    );
  }

  // Both directories live under the OS temp dir, never under the repo.
  const packDir = await Deno.makeTempDir({ prefix: "eser-preflight-pack-" });
  const consumerDir = await Deno.makeTempDir({
    prefix: "eser-preflight-consumer-",
  });

  try {
    // deno-lint-ignore no-console
    console.log(`Packing ${distDir} ...`);
    must(
      await run(["npm", "pack", "--pack-destination", packDir], distDir),
      "npm pack",
    );

    const tarballs: string[] = [];
    for await (const entry of Deno.readDir(packDir)) {
      if (entry.name.endsWith(".tgz")) tarballs.push(entry.name);
    }
    if (tarballs.length !== 1) {
      throw new Error(`expected one tarball in ${packDir}, found ${tarballs}`);
    }
    const tarball = path.join(packDir, tarballs[0]!);

    await Deno.writeTextFile(
      path.join(consumerDir, "package.json"),
      '{"name":"eser-preflight-consumer","private":true,"version":"1.0.0"}\n',
    );

    // deno-lint-ignore no-console
    console.log(`Installing ${tarballs[0]} into ${consumerDir} ...`);
    must(
      await run(
        ["npm", "install", "--no-audit", "--no-fund", tarball],
        consumerDir,
      ),
      "npm install of the packed CLI",
    );

    // Invoke the runtime explicitly rather than through the bin shim, so the
    // matrix's Node or Bun is the one that runs — not whatever `node` the
    // shebang finds first.
    const entry = path.join(consumerDir, "node_modules", "eser", "eser.js");
    const eser = (...args: string[]) =>
      run([runtime, entry, ...args], consumerDir);

    must(await eser("--help"), `${runtime} eser --help`);

    const version = await eser("version");
    must(version, `${runtime} eser version`);
    // deno-lint-ignore no-console
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
      // deno-lint-ignore no-console
      console.log(`${runtime} eser ajan version → ${ajan.stdout.trim()}`);
    } else if (requireNative) {
      throw new Error(
        `--require-native: eser ajan version did not load the native library under ${runtime}:\n${ajanOutput}`,
      );
    } else {
      // deno-lint-ignore no-console
      console.log(
        `${runtime} eser ajan version → failed gracefully without mentioning Deno (no native library for an unreleased version)`,
      );
    }

    // deno-lint-ignore no-console
    console.log(`npm consumer preflight (${runtime}): OK`);
  } finally {
    await Deno.remove(packDir, { recursive: true });
    await Deno.remove(consumerDir, { recursive: true });
  }
};

if (import.meta.main) {
  await main();
}
