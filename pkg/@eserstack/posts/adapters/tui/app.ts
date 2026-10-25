// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Entry point for the interactive TUI adapter.
 * Delegates wiring to the shared composition root in adapters/cli/wiring.ts.
 */

import * as wiring from "../cli/wiring.ts";
import * as triggers from "./triggers.ts";
import * as menu from "./menu.ts";

export async function main(): Promise<void> {
  const { bound, auths, tokenStore, twitterRedirectUri } =
    await wiring.createAppContext();
  const tuiTriggers = triggers.createTuiTriggers(bound);
  const tuiMenu = new menu.TuiMenu(
    tuiTriggers,
    auths,
    twitterRedirectUri,
    tokenStore,
  );
  await tuiMenu.run();
}

if (import.meta.main) {
  // Script entry point: the await runs only when this file is executed
  // directly (`deno task tui`), never when another module imports it.
  // oxlint-disable-next-line node/no-top-level-await
  await main();
}
