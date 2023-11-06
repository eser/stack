// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { updateCheck } from "./update_check.ts";
import { DAY, dirname, fromFileUrl, join, toFileUrl } from "./deps.ts";
import { type LimeConfig, Manifest as ServerManifest } from "../server/mod.ts";
import { build } from "./build.ts";
import {
  collect,
  ensureMinDenoVersion,
  generate,
  type Manifest,
} from "./mod.ts";
import { startServer } from "../server/boot.ts";
import { getInternalLimeState } from "../server/config.ts";
import { getServerContext } from "../server/context.ts";

export async function dev(
  base: string,
  config?: LimeConfig,
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

  const newManifest = await collect(dir, config?.router?.ignoreFilePattern);

  Deno.env.set("LIME_DEV_PREVIOUS_MANIFEST", JSON.stringify(newManifest));

  const manifestChanged =
    !arraysEqual(newManifest.routes, currentManifest.routes) ||
    !arraysEqual(newManifest.islands, currentManifest.islands);

  if (manifestChanged) {
    await generate(dir, newManifest);
  }

  const manifest = (await import(toFileUrl(join(dir, "manifest.gen.ts")).href))
    .default as ServerManifest;

  const state = await getInternalLimeState(
    manifest,
    config ?? {},
  );
  state.loadSnapshot = false;

  if (Deno.args.includes("build")) {
    state.config.dev = false;

    await build(state);

    return;
  }

  state.config.dev = true;

  const ctx = await getServerContext(state);
  await startServer(ctx.handler(), state.config.server);
}

function arraysEqual<T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>): boolean {
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
