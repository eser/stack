// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The one list of packages the npm bundles must not inline.
 *
 * `cli`, `noskills` and `laroux-server` each bundle a different entry point out
 * of the same workspace with esbuild. They used to carry three copies of this
 * list, and the copies drifted: `noskills` broke the v4.3.0 release at the npm
 * smoke test because only `cli` had the FFI entries. One module, imported by
 * all three builders, cannot drift.
 *
 * What stays external and why:
 *
 * - `tailwindcss`, `@tailwindcss/*`, `lightningcss` — native modules, resolved
 *   from the consumer's node_modules at runtime.
 * - `@eserstack/ajan-*`, `@eserstack/ajan-wasm` — the per-platform shared
 *   libraries and the WASM fallback. They are optionalDependencies of the npm
 *   package and are located at runtime by the FFI loader via dlopen.
 * - `koffi` — the Node FFI binding, a native module.
 * - `bun:ffi` — a Bun-only builtin that exists in no registry; esbuild cannot
 *   resolve it, so the bundle must leave the import untouched.
 *
 * What is deliberately NOT external: `@eserstack/ajan` itself. It is published
 * to JSR only, so declaring it as an npm dependency leaves the package
 * uninstallable (`npm install` 404s), and because the FFI loader is a static
 * import in every ffi-client.ts the bundle is unloadable even from a link
 * install. Bundling it keeps the package self-contained (v4.5.0 lesson).
 *
 * @module
 */

/** esbuild `external` entries shared by every npm build in the workspace. */
export const NPM_EXTERNAL_PACKAGES: readonly string[] = [
  "tailwindcss",
  "@tailwindcss/*",
  "lightningcss",
  "@eserstack/ajan-*",
  "@eserstack/ajan-wasm",
  "koffi",
  "bun:ffi",
];
