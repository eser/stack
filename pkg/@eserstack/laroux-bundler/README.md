# 🏗️ [@eserstack/laroux-bundler](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/laroux-bundler` is
> published on npm under the same name (`pnpm add @eserstack/laroux-bundler`);
> the JSR versions stay available but get no updates.

> **eserstack Product-Candidate** — build pipeline for laroux ·
> [eser/stack](https://github.com/eser/stack) **Install:**
> `pnpm add jsr:@eserstack/laroux-bundler`

Build system and bundler for [laroux.js](https://github.com/eser/stack), a React
Server Components framework. It turns the `src/` directory of a laroux app into
`dist/client/` (browser bundles, styles, fonts and images) and `dist/server/`
(server components, routes and server actions), as a one-off build or in watch
mode. The core is framework-agnostic: the framework (React) and the CSS tooling
(Tailwind CSS) are adapters that you import and pass to the build.

## Overview

This package provides the build system for laroux.js:

- File-based routes: pages, layouts, API routes and proxies under
  `src/app/routes`
- Transform pipeline: TypeScript and JSX, `"use client"` components turned into
  client references, server component imports rewritten to point at them, and
  `"use server"` actions marked for React
- Module map: client component discovery and the mapping React uses to resolve
  them
- Chunk manifest: code splitting and lazy loading per client component
- Client entry with the laroux-react bootstrap: HMR client and the
  development-mode error overlay
- CSS processing: Tailwind CSS v4, Lightning CSS, CSS modules and critical CSS
  extraction
- Import rewriting: bare specifiers resolved through the project's `deno.json`
  and `package.json` import maps, with browser shims for server-only packages
- Font self-hosting for Google Fonts and image optimization with sharp
- Client and server bundles on Rolldown
- Runtime bundler that bundles in memory during development, and prebuilt
  bundler that serves the output of a build

## Installation

```bash
pnpm add jsr:@eserstack/laroux-bundler
```

With Deno:

```bash
deno add jsr:@eserstack/laroux-bundler
```

## Quick Start

Build a laroux app once. The project needs `src/app/routes/` and, for Tailwind,
`src/app/styles/global.css`. The default values for images, browser shims and
server externals come from `@eserstack/laroux`.

```typescript
import * as laroux from "@eserstack/laroux";
import * as larouxBundler from "@eserstack/laroux-bundler";
import * as react from "@eserstack/laroux-bundler/adapters/react";
import * as tailwindcss from "@eserstack/laroux-bundler/adapters/tailwindcss";
import { runtime } from "@eserstack/standards/cross-runtime";

const projectRoot = runtime.process.cwd();
const config: larouxBundler.BuildConfig = {
  projectRoot,
  srcDir: runtime.path.resolve(projectRoot, "src"),
  distDir: runtime.path.resolve(projectRoot, "dist"),
  logLevel: "info",
  fonts: [],
  images: laroux.DEFAULT_IMAGES,
  cssModuleTypes: false,
  noCssModuleAutoReference: false,
  browserShims: laroux.DEFAULT_BROWSER_SHIMS,
  serverExternals: laroux.DEFAULT_SERVER_EXTERNALS,
};

const context = larouxBundler.createBuildContext(config, {
  framework: react.reactPlugin,
  css: tailwindcss.createTailwindPlugin(),
  bundlerBackend: "rolldown",
});

const result = await larouxBundler.build(context);
```

`build()` logs a failure and returns `success: false` instead of throwing, so
check `result.success` before serving the output. A failed build still removes
the copy of the source it bundles from (`dist/_bundle_src`).

This build compiles `global.css` with Tailwind but leaves out the stylesheet,
font and image adapters: a stylesheet Tailwind does not compile is written
unchanged, no fonts are self-hosted and images are served as they are. The
[Adapters](#adapters) section shows how to pass them.

## Usage

The examples in this section continue the Quick Start and reuse its imports,
`config`, `context` and `result`.

### Building Only When Needed

`ensureBuildIsReady()` runs `build()` only when the output is stale, and
otherwise returns the existing build: its build id, timestamp, module map and
client bundle, with a `duration` of 0. The output is stale when
`dist/client/manifest.json` is missing or when a build input changed after the
timestamp in it. The inputs are every file under the source directory and
`public/` at any depth (except `node_modules` and hidden entries), plus
`laroux.config.ts`, `package.json`, `deno.json` and `deno.jsonc`. `build()`
writes the chunk manifest as its last step, so a build that failed halfway
leaves none behind and the next call builds again:

```typescript
const ready = await larouxBundler.ensureBuildIsReady(context);

if (ready.duration === 0) {
  console.log(`Reusing the build from ${new Date(ready.timestamp)}`);
}
```

### Watch Mode

`watch()` rebuilds when a `.ts`, `.tsx`, `.js`, `.jsx` or `.css` file under the
source directory changes. It waits 50 ms to batch the changes of one save, runs
one build at a time, and passes each result with its changed files to your
callback, failed builds included. When the callback returns a promise, the next
rebuild waits for it, so the callback can load the rebuilt output before `dist/`
changes again. A failed build keeps its changed files, so the next save rebuilds
them too. Each watcher keeps its own `BuildCache` of client component analyses,
CSS module results and route scans, unless `context.cache` holds one to share.

A change to CSS files alone rebuilds only the stylesheets, and writes them as a
full build does: `styles.css` from the global stylesheet followed by the CSS
module styles, then the critical, deferred and universal CSS derived from it.
The JavaScript in `dist/` stays, so the result reports the build id of the build
before it. A change to scripts alone keeps `styles.css` and skips the global
stylesheet, but still compiles the CSS modules, because the bundles import their
class names.

Each result carries the `buildId` of the code in `dist/`. The generated routes
file imports every page and layout with it as a query, `page.js?v=` and the id,
so a server that imports the routes file under a new build id gets the rebuilt
pages instead of the ones Deno cached by URL; laroux dev loads each rebuild this
way.

```typescript
let lastGoodBuild = result;

const watcher = larouxBundler.watch(context, (rebuilt) => {
  if (rebuilt.success) {
    lastGoodBuild = rebuilt;
    console.log(`Serving build ${rebuilt.buildId}`);
  }
});

// Stop watching
watcher.close();
```

### Serving Bundles

The server reads bundles through the `Bundler` interface, whose `getBundle()`
returns the client code, the module map, the chunk manifest and the entrypoint
URL.

`PrebuiltBundler` serves the output of `build()`. It reads
`dist/client/manifest.json` and `dist/client/module-map.json`, and its client
code is `null` because the server serves the built files as static assets:

```typescript
import * as prebuilt from "@eserstack/laroux-bundler/adapters/prebuilt-bundler";

const bundler = new prebuilt.PrebuiltBundler({ distDir: config.distDir });
const bundle = await bundler.getBundle();

// Reload the manifest after a rebuild
await bundler.reload();
```

`RuntimeBundler` bundles in memory for development, with no `dist/`. It uses
`DEVELOPMENT_SETTINGS` (unminified, one bundle), caches the result for one
second, and its entrypoint is `/__runtime_bundle.js`, with HMR enabled in its
chunk manifest. It bundles with rolldown and applies `browserShims` like a
production build; without the option it uses `laroux.DEFAULT_BROWSER_SHIMS`:

```typescript
import * as runtimeBundler from "@eserstack/laroux-bundler/adapters/runtime-bundler";

const devBundler = new runtimeBundler.RuntimeBundler({
  srcDir: config.srcDir,
  projectRoot: config.projectRoot,
  plugin: react.reactPlugin,
  browserShims: config.browserShims,
});

const devBundle = await devBundler.getBundle();

// After a change
await devBundler.rebuild();
```

### Adapters

Each adapter has its own entry point, and the build uses only the adapters you
pass to `createBuildContext()`. This is the set `eser laroux build` passes:

```typescript
import * as fonts from "@eserstack/laroux-bundler/adapters/fonts";
import * as lightningcss from "@eserstack/laroux-bundler/adapters/lightningcss";
import * as sharp from "@eserstack/laroux-bundler/adapters/sharp";

const fullContext = larouxBundler.createBuildContext(config, {
  framework: react.reactPlugin,
  css: tailwindcss.createTailwindPlugin(),
  cssProcessor: lightningcss.lightningCssProcessor,
  fontOptimizer: fonts.googleFontOptimizer,
  imageOptimizer: sharp.sharpImageOptimizer,
  bundlerBackend: "rolldown",
});

const fullResult = await larouxBundler.build(fullContext);
```

| Entry point                                           | Provides                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `@eserstack/laroux-bundler/adapters/react`            | `reactPlugin`, the React Server Components framework plugin                |
| `@eserstack/laroux-bundler/adapters/tailwindcss`      | `createTailwindPlugin()`, Tailwind CSS v4 and critical CSS                 |
| `@eserstack/laroux-bundler/adapters/lightningcss`     | `lightningCssProcessor`, Lightning CSS lowering and minification           |
| `@eserstack/laroux-bundler/adapters/sharp`            | `sharpImageOptimizer`, WebP, AVIF, responsive widths and blur placeholders |
| `@eserstack/laroux-bundler/adapters/fonts`            | `googleFontOptimizer`, self-hosted Google Fonts                            |
| `@eserstack/laroux-bundler/adapters/runtime-bundler`  | `RuntimeBundler`, in-memory development bundles                            |
| `@eserstack/laroux-bundler/adapters/prebuilt-bundler` | `PrebuiltBundler`, bundles read from `dist/`                               |

The Lightning CSS, sharp and fonts entry points also export the functions their
adapters are built on (`processCss()`, `optimizeImages()` and
`optimizeGoogleFonts()`) for use outside a build.

Each port has a no-op default for the adapter you leave out:

| Option           | Port              | Without it                                                                      |
| ---------------- | ----------------- | ------------------------------------------------------------------------------- |
| `framework`      | `FrameworkPlugin` | `noopPlugin`: no framework hooks, so `build()` fails at the client entry step   |
| `css`            | `CssPlugin`       | No global CSS processing, no critical CSS, CSS modules compiled as written      |
| `cssProcessor`   | `CssProcessor`    | `noopCssProcessor`: a stylesheet the CSS plugin does not compile stays as it is |
| `fontOptimizer`  | `FontOptimizer`   | `noopFontOptimizer`: no font files, no `fonts.css`                              |
| `imageOptimizer` | `ImageOptimizer`  | `noopImageOptimizer`: `public/images/` is served as it is                       |

To write your own adapter, implement the port type from the package root and
pass it the same way. A font optimizer returns `null` for fonts it does not
handle, and an image optimizer returns `null` when it optimizes nothing.

## Configuration

`createBuildContext()` takes a `BuildConfig`. The paths are absolute.

| Field                      | Type                         | Purpose                                                             |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------- |
| `projectRoot`              | `string`                     | Project root directory                                              |
| `srcDir`                   | `string`                     | Source directory that holds `app/`                                  |
| `distDir`                  | `string`                     | Output directory; a full build deletes it first                     |
| `logLevel`                 | `LogLevel`                   | Log level for the client, written into the chunk manifest           |
| `fonts`                    | `FontDefinition[]`           | Google Fonts to self-host                                           |
| `images`                   | `ResolvedImageConfig`        | Formats, widths, quality and placeholder for `public/images/`       |
| `cssModuleTypes`           | `boolean`                    | Write `.d.ts` files for CSS modules                                 |
| `noCssModuleAutoReference` | `boolean`                    | Do not inject `@reference` into CSS modules                         |
| `browserShims`             | `ResolvedBrowserShimsConfig` | Browser replacements for server-only packages and Node.js built-ins |
| `serverExternals`          | `string[]`                   | Packages left out of the server bundle and loaded at run time       |

The second argument picks the plugins and the adapters. Both bundles use
Rolldown (`bundlerBackend` accepts only `"rolldown"`); `browserShims` and the
import map resolution run as Rolldown plugins on the client bundle, so
server-only packages such as the native `@eserstack/logging` stay out of the
browser.

## Build Modes

`eser laroux dev` builds with Rolldown, then watches `src/` and sends HMR
updates after each rebuild that succeeds. `eser laroux build` builds once. In
both, `build()` bundles the client with `PRODUCTION_SETTINGS`: minified, split
into chunks, without source maps.

```bash
npx eser laroux dev    # build, watch, HMR
npx eser laroux build  # one production build
```

## How It Works

A full `build()` runs these steps:

1. Route scanning: `src/app/routes/` is scanned for `page.tsx`, `layout.tsx`,
   `route.ts` and `proxy.ts`, and the route, API route and proxy registries are
   generated into `dist/server/`; the route registry imports the pages and
   layouts with the build id as a query. A `home` directory maps to `/`. Test
   files and any file or directory whose name starts with `_` are skipped, so
   nothing under `_private/` becomes a route. A one-off build scans every time;
   in watch mode the scan is kept per routes directory until a file under it
   changes.
2. Module discovery: files with `"use client"` become client components.
3. Transform: each client component gets a `createClientReference()` proxy in
   `dist/server/`, server component imports are rewritten to those proxies, and
   `"use server"` files get React server reference markers.
4. Module map: `dist/client/module-map.json` maps each client component to its
   chunk, so the server can reference client components in the RSC stream.
5. CSS: the CSS plugin compiles `src/app/styles/global.css` into
   `dist/client/styles.css`, or the CSS processor transforms it when the plugin
   does not claim it. CSS modules go through the CSS plugin's preprocessing
   (Tailwind expands `@apply`) and compile to JSON class maps, and the styles
   split into critical, deferred and universal files.
6. Client bundle: `src/` is copied to `dist/_bundle_src/`, server action files
   in the copy are replaced by stubs that `POST` to `/_rsc` with an `RSC-Action`
   header through the client bootstrap's `__callServer`, and the client bundle
   is built from the copy, so `src/` is never modified. The laroux-react client
   bootstrap is copied to `dist/_laroux-react/` and bundled from there, so the
   packages it imports (`react`, `react-dom` and `@eserstack/laroux`) resolve
   from the app, as its own client components' imports do. `browserShims`
   replace server-only packages: by default `@eserstack/logging` becomes
   laroux's browser logger.
7. Assets: the font optimizer self-hosts the configured fonts, the image
   optimizer processes `public/images/`, translation files are copied, and
   `public/` is copied to `dist/`.
8. Server bundle: server components are bundled into `dist/server/`, the
   packages in `serverExternals` stay external, and an actions manifest lists
   the server action files.
9. Chunk manifest: `dist/client/manifest.json` is written last, so it marks a
   build that finished.

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- A `page.tsx`, `layout.tsx`, `route.ts` or `proxy.ts` in or below a directory
  whose name starts with `_` is no longer routed; only `_` file names were
  skipped. Rename `src/app/routes/_private/` to `src/app/routes/private/` if it
  was meant to be public.
- `build()` uses only the adapters you pass. `BuildPlugins` has optional
  `cssProcessor`, `fontOptimizer` and `imageOptimizer` with no-op defaults, and
  `BuildContext` requires them (`createBuildContext` fills them in). CSS modules
  go through the CSS plugin you pass, so without one `@apply` in a CSS module is
  not expanded:

  ```typescript
  import * as fonts from "@eserstack/laroux-bundler/adapters/fonts";
  import * as lightningcss from "@eserstack/laroux-bundler/adapters/lightningcss";
  import * as sharp from "@eserstack/laroux-bundler/adapters/sharp";
  import * as tailwind from "@eserstack/laroux-bundler/adapters/tailwindcss";

  // After: add these to the plugins you pass to build()
  const plugins = {
    css: tailwind.createTailwindPlugin({
      globalCssPath: "src/app/styles/global.css",
    }),
    cssProcessor: lightningcss.lightningCssProcessor,
    fontOptimizer: fonts.googleFontOptimizer,
    imageOptimizer: sharp.sharpImageOptimizer,
  };
  ```

- `scanRoutes(routesDir, projectRoot, forceRescan?)` is
  `scanRoutes(routesDir, projectRoot, { cache? })` and keeps no module-level
  cache. `invalidateRouteCache`, `getGlobalBuildCache` and
  `resetGlobalBuildCache` are removed, and `BuildCache` keys route scans by
  directory (`getRouteScan(routesDir, mtime)`,
  `setRouteScan(routesDir, scan, mtime)`):

  ```typescript
  import * as larouxBundler from "@eserstack/laroux-bundler";

  // Before
  invalidateRouteCache();
  const routes = await scanRoutes(routesDir, projectRoot, true);
  // After
  const cache = new larouxBundler.BuildCache();
  cache.invalidateFile(changedPath);
  const routes = await larouxBundler.scanRoutes(routesDir, projectRoot, {
    cache,
  });
  ```

- Client bundles always use rolldown; `bundlerBackend` selects only the server
  bundle's backend. `RuntimeBundler` bundles with rolldown, applies the new
  `browserShims` option (default `DEFAULT_BROWSER_SHIMS`), and resolves from
  `config.projectRoot` instead of the working directory. Pass the real
  `projectRoot`, and `browserShims` to match a custom production setting.
- `BuildConfig.noCssModuleAutoReference`, which was ignored, is honoured: with
  it, the Tailwind plugin adds no `@reference` to CSS modules. Remove the
  setting if you relied on the injection.
- The chunk manifest is `<distDir>/client/manifest.json`, written after every
  other step, so a running or failed build has none. Read
  `dist/client/manifest.json` instead of `dist/manifest.json`.
- `createClientEntry` copies the laroux-react bootstrap to
  `<distDir>/_laroux-react/` with its package layout, and `_client-entry.tsx`
  imports `./_laroux-react/client/bootstrap/entry.ts`. Code that read
  `<distDir>/entry.ts` reads the new path.
- `BuildResult` has a required `buildId: string`. Code that builds a
  `BuildResult` itself, such as a test fake, sets it; `build()` and
  `ensureBuildIsReady()` fill it in.
- `build()` writes `_generated-routes.ts` with page and layout imports that end
  in `?v=<buildId>`. A tool that reads that file as text allows the query;
  `generateRouteFile()` without the new `moduleVersion` option still writes
  plain specifiers.

## 🔗 Links

- [@eserstack/cli](https://jsr.io/@eserstack/cli): main CLI tool (`eser laroux`
  commands)
- [@eserstack/laroux-server](https://jsr.io/@eserstack/laroux-server): server
  runtime (SSR, routing, actions)
- [@eserstack/laroux](https://jsr.io/@eserstack/laroux): framework-agnostic core
  utilities
- [JSR package](https://jsr.io/@eserstack/laroux-bundler): symbol-level API
  reference, generated from source
- [Architecture decision records](https://github.com/eser/stack/tree/main/docs/adr)
- Generate the API reference locally with `deno task cli docs` (output lands in
  `docs/api/`, which is not tracked)

Apache-2.0 © [Eser Ozvataf](https://github.com/eser)
