// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * TUI adapter barrel.
 * NOTE: Adapters are NOT re-exported from the root mod.ts.
 * Wire them at the composition root of your application.
 */

export { TuiMenu } from "./menu.ts";
export type { EndpointCost } from "./costs.ts";
export { DEFAULT_COSTS } from "./costs.ts";
export { noopScheduler, noopTranslator } from "./stubs.ts";
export { main } from "./app.ts";
