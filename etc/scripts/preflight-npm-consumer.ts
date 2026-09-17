// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Release preflight: install the CLI npm bundle the way a user would.
 *
 * Packs `pkg/@eserstack/cli/dist` into a tarball, installs it with npm into a
 * scratch project OUTSIDE the repository, and runs the same smoke commands the
 * pipeline's no-Deno job runs. Doing it outside the repo is the whole point:
 * inside the monorepo, Node walks up to the workspace's node_modules and hides
 * every unpublished or undeclared dependency — which is how v4.5.0 shipped a
 * bundle that imported a package not on npm and only failed in CI.
 *
 * Deliberately no workspace imports (see gen-jsr-manifests.ts for why).
 *
 * Usage:
 *   deno run --allow-all etc/scripts/preflight-npm-consumer.ts
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

const main = async (): Promise<void> => {
  const scriptDir = path.dirname(path.fromFileUrl(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..", "..");
  const distDir = path.join(repoRoot, "pkg", "@eserstack", "cli", "dist");

  try {
    await Deno.stat(path.join(distDir, "package.json"));
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

    const bin = path.join(consumerDir, "node_modules", ".bin", "eser");

    must(await run([bin, "--help"], consumerDir), "eser --help");

    const version = await run([bin, "version"], consumerDir);
    must(version, "eser version");
    // deno-lint-ignore no-console
    console.log(`eser version → ${version.stdout.trim()}`);

    // Allowed to fail (no platform binary in a scratch install), but the
    // failure must never tell an npm user to install Deno.
    const ajan = await run([bin, "ajan", "version"], consumerDir);
    const ajanOutput = `${ajan.stdout}${ajan.stderr}`;
    if (/deno/i.test(ajanOutput)) {
      throw new Error(
        `eser ajan version mentions Deno — the npm package must not require it:\n${ajanOutput}`,
      );
    }
    if (ajan.code === 0) {
      // The platform packages are pinned to this exact version; if one loaded
      // it must be this build, not an older library that happened to resolve.
      const packed = JSON.parse(
        await Deno.readTextFile(path.join(distDir, "package.json")),
      ) as { version: string };
      if (!ajan.stdout.includes(packed.version)) {
        throw new Error(
          `eser ajan version reported "${ajan.stdout.trim()}" but the bundle is ${packed.version} — a mismatched platform library was loaded`,
        );
      }
    }
    // deno-lint-ignore no-console
    console.log(
      ajan.code === 0
        ? `eser ajan version → ${ajan.stdout.trim()}`
        : "eser ajan version → failed gracefully without mentioning Deno (platform package not published yet)",
    );

    // deno-lint-ignore no-console
    console.log("npm consumer preflight: OK");
  } finally {
    await Deno.remove(packDir, { recursive: true });
    await Deno.remove(consumerDir, { recursive: true });
  }
};

if (import.meta.main) {
  await main();
}
