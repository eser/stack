import { updateCheck } from "./update_check.ts";
import { DAY, dirname, fromFileUrl, join } from "./deps.ts";
import { type LimeOptions } from "../server/types.ts";
import { build } from "./build.ts";
import {
  collect,
  ensureMinDenoVersion,
  generate,
  type Manifest,
} from "./mod.ts";

export async function dev(
  base: string,
  entrypoint: string,
  options: LimeOptions = {},
) {
  ensureMinDenoVersion();

  // Run update check in background
  updateCheck(DAY).catch(() => {});

  entrypoint = new URL(entrypoint, base).href;

  const dir = dirname(fromFileUrl(base));

  let currentManifest: Manifest;
  const prevManifest = Deno.env.get("LIME_DEV_PREVIOUS_MANIFEST");

  if (prevManifest) {
    currentManifest = JSON.parse(prevManifest);
  } else {
    currentManifest = { islands: [], routes: [] };
  }

  const newManifest = await collect(dir);

  Deno.env.set("LIME_DEV_PREVIOUS_MANIFEST", JSON.stringify(newManifest));

  const manifestChanged =
    !arraysEqual(newManifest.routes, currentManifest.routes) ||
    !arraysEqual(newManifest.islands, currentManifest.islands);

  if (manifestChanged) {
    await generate(dir, newManifest);
  }

  if (Deno.args.includes("build")) {
    await build(join(dir, "lime.gen.ts"), options);
    return;
  }

  await import(entrypoint);
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
