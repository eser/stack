// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Entry point for the interactive TUI adapter.
 * Delegates wiring to the shared composition root in adapters/cli/wiring.ts.
 */

import * as wiring from "../cli/wiring.ts";
import { createTuiTriggers } from "./triggers.ts";
import { TuiMenu } from "./menu.ts";

export async function main(): Promise<void> {
  const { bound, auths, tokenStore, twitterRedirectUri } = await wiring
    .createAppContext();
  const triggers = createTuiTriggers(bound);
  const menu = new TuiMenu(triggers, auths, twitterRedirectUri, tokenStore);
  await menu.run();
}

if (import.meta.main) {
  // deno-lint-ignore no-top-level-await
  await main();
}
