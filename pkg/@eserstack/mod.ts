// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * eserstack — Barrel re-export of all public packages.
 *
 * Intended for REPL exploration and quick prototyping. Production code
 * should import directly from the package (e.g. `@eserstack/fp/mod.ts`).
 *
 * @module
 */

// Layer 0 — Foundation
export * as standards from "./standards/mod.ts";
export * as primitives from "./primitives/mod.ts";
// export * as directives from "./directives/mod.ts";

// Layer 1 — Core Utilities
export * as fp from "./fp/mod.ts";
export * as eserCrypto from "./crypto/mod.ts";
export * as parsing from "./parsing/mod.ts";

// Layer 2 — Infrastructure
export * as di from "./di/mod.ts";
export * as events from "./events/mod.ts";
export * as config from "./config/mod.ts";
export * as cache from "./cache/mod.ts";
export * as logging from "./logging/mod.ts";
export * as http from "./http/mod.ts";
export * as httpclient from "./httpclient/mod.ts";
export * as functions from "./functions/mod.ts";
export * as shell from "./shell/mod.ts";
export * as testing from "./testing/mod.ts";
export * as formats from "./formats/mod.ts";
export * as streams from "./streams/mod.ts";
export * as collector from "./collector/mod.ts";
export * as cs from "./cs/mod.ts";
// export * as codebase from "./codebase/mod.ts";

// Layer 3 — Framework
export * as appRuntime from "./app-runtime/mod.ts";
export * as bundler from "./bundler/mod.ts";
export * as kit from "./kit/mod.ts";
// export * as jsxRuntime from "./jsx-runtime/mod.ts";
// export * as laroux from "./laroux/mod.ts";
// export * as larouxBundler from "./laroux-bundler/mod.ts";
// export * as larouxReact from "./laroux-react/mod.ts";
// export * as larouxRuntime from "./laroux-runtime/mod.ts";

// Layer 4 — Application (internal tooling — import directly)
// export * as ai from "./ai/mod.ts";
// export * as noskills from "./noskills/mod.ts";
// export * as noskillsWeb from "./noskills-web/mod.ts";
// export * as posts from "./posts/mod.ts";
// export * as workflows from "./workflows/mod.ts";
