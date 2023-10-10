import { updateCheck } from "./update_check.ts";
import { DAY, dirname, fromFileUrl, join, toFileUrl } from "./deps.ts";
import { type LimeOptions, Manifest as ServerManifest } from "../server/mod.ts";
import { build } from "./build.ts";
import {
  collect,
  ensureMinDenoVersion,
  generate,
  type Manifest,
} from "./mod.ts";
import { startFromContext } from "../server/boot.ts";
import { getLimeConfigWithDefaults } from "../server/config.ts";
import { getServerContext } from "../server/context.ts";

export async function dev(
  base: string,
  options?: LimeOptions,
) {
  ensureMinDenoVersion();

  // Run update check in background
  updateCheck(DAY).catch(() => {});

  const dir = dirname(fromFileUrl(base));

  let currentManifest: Manifest;
  const prevManifest = Deno.env.get("LIME_DEV_PREVIOUS_MANIFEST");

  if (prevManifest) {
    currentManifest = JSON.parse(prevManifest);
  } else {
    currentManifest = { islands: [], routes: [] };
  }

  const newManifest = await collect(dir, options?.router?.ignoreFilePattern);

  Deno.env.set("LIME_DEV_PREVIOUS_MANIFEST", JSON.stringify(newManifest));

  const manifestChanged =
    !arraysEqual(newManifest.routes, currentManifest.routes) ||
    !arraysEqual(newManifest.islands, currentManifest.islands);

  if (manifestChanged) {
    await generate(dir, newManifest);
  }

  const manifest = (await import(toFileUrl(join(dir, "manifest.gen.ts")).href))
    .default as ServerManifest;

  const config = await getLimeConfigWithDefaults(
    manifest,
    options ?? {},
  );
  config.loadSnapshot = false;

  if (Deno.args.includes("build")) {
    config.dev = false;

    await build(config);

    return;
  }

  config.dev = true;

  const ctx = await getServerContext(config);
  await startFromContext(ctx, config.server);
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}
