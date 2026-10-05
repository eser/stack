# 🛰️ [@eserstack/laroux-server](./)

> **eserstack Product-Candidate** — SSR runtime for laroux ·
> [eser/stack](https://github.com/eser/stack) **Install:**
> `pnpm add jsr:@eserstack/laroux-server`

Core runtime and utilities for [laroux.js](https://github.com/eser/stack) - A
React Server Components framework for Deno. The server renders pages and RSC
payloads, serves static assets, runs API routes, proxies and server actions, and
ships the `laroux` CLI that creates, develops, builds and serves an app.

## Overview

This package contains the core runtime logic and utilities for laroux.js,
including:

- **HTTP Server** - Request handling, routing, and static file serving
- **RSC Handler** - React Server Components rendering and streaming
- **SSR Renderer** - HTML rendering with the RSC payload embedded for hydration
- **Server Actions** - Server-side function invocation from client components
- **API Routes and Proxies** - File-based `route.ts` handlers and `proxy.ts`
  middleware
- **HTML Shell** - Initial HTML document generation
- **Configuration System** - Type-safe config loading that merges the defaults,
  `laroux.config.ts` and the options passed to `startServer`
- **CLI** - `laroux init`, `dev`, `build` and `serve`, standalone or mounted as
  `eser laroux`

## 🚀 Quick Start

The CLI creates a project and starts the development server:

```bash
npx laroux init my-app
cd my-app
npx laroux dev
```

The same commands run as `eser laroux <command>` through `@eserstack/cli`.

To start the server from code, pass the renderer and HTML shell of a framework
adapter. Without a bundler plugin, `startServer` serves the build already in
`dist/`:

```typescript
import * as larouxServer from "@eserstack/laroux-server";
import * as reactAdapter from "@eserstack/laroux-server/adapters/react";

await larouxServer.startServer({
  mode: "serve",
  port: 8000,
  renderer: reactAdapter.reactRenderer,
  htmlShell: reactAdapter.reactHtmlShellBuilder,
});
```

## 🛠 API Reference

### Starting the Server

`startServer(options)` loads the configuration, builds the app when a bundler
plugin is given, and starts the HTTP server. The build uses only the bundler
adapters you pass. This is what `laroux dev` runs:

```typescript
import * as larouxServer from "@eserstack/laroux-server";
import * as reactAdapter from "@eserstack/laroux-server/adapters/react";
import * as fonts from "@eserstack/laroux-bundler/adapters/fonts";
import * as lightningcss from "@eserstack/laroux-bundler/adapters/lightningcss";
import * as reactBundler from "@eserstack/laroux-bundler/adapters/react";
import * as sharp from "@eserstack/laroux-bundler/adapters/sharp";
import * as tailwind from "@eserstack/laroux-bundler/adapters/tailwindcss";

await larouxServer.startServer({
  mode: "dev",
  port: 8000,
  renderer: reactAdapter.reactRenderer,
  htmlShell: reactAdapter.reactHtmlShellBuilder,
  frameworkPlugin: reactBundler.reactPlugin,
  cssPlugin: tailwind.createTailwindPlugin({
    globalCssPath: "src/app/styles/global.css",
  }),
  cssProcessor: lightningcss.lightningCssProcessor,
  fontOptimizer: fonts.googleFontOptimizer,
  imageOptimizer: sharp.sharpImageOptimizer,
});
```

| Option            | Type                 | Description                                                                                                                                              |
| ----------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`            | `"dev"` \| `"serve"` | `dev` builds on each start, watches and enables HMR; `serve` builds only a missing or stale build                                                        |
| `port`            | `number`             | Overrides `server.port` from the configuration (default `8000`)                                                                                          |
| `hmr`             | `boolean`            | Hot module replacement in dev mode (default `true` in dev)                                                                                               |
| `open`            | `boolean`            | Opens the browser after the server starts                                                                                                                |
| `projectRoot`     | `string`             | Directory holding `laroux.config.ts` (default: the working directory)                                                                                    |
| `logLevel`        | `LogLevel`           | `trace`, `debug`, `info`, `warn`, `error` or `fatal` (default `info`)                                                                                    |
| `renderer`        | `Renderer`           | Framework renderer adapter; without one, pages render empty                                                                                              |
| `htmlShell`       | `HtmlShellBuilder`   | HTML shell adapter; without one, the shell is empty                                                                                                      |
| `frameworkPlugin` | `FrameworkPlugin`    | Bundler plugin from `@eserstack/laroux-bundler`; without it nothing is built                                                                             |
| `cssPlugin`       | `CssPlugin`          | CSS plugin from `@eserstack/laroux-bundler`, such as `createTailwindPlugin(...)`                                                                         |
| `cssProcessor`    | `CssProcessor`       | Stylesheet processor, such as `lightningCssProcessor`, for a stylesheet the CSS plugin does not compile; without it that stylesheet is written unchanged |
| `fontOptimizer`   | `FontOptimizer`      | Font optimizer, such as `googleFontOptimizer`; without it no fonts are self-hosted                                                                       |
| `imageOptimizer`  | `ImageOptimizer`     | Image optimizer, such as `sharpImageOptimizer`; without it images are served as they are                                                                 |

In `serve` mode, the build is stale when `dist/client/manifest.json` is missing
or a file under the source directory or `public/`, or the project's
`laroux.config.ts`, `package.json`, `deno.json` or `deno.jsonc`, changed after
the last build.

When the build that `startServer` runs fails, it throws `BuildFailedError` and
does not start the server, so the app never runs on a stale or empty `dist/`.
The bundler has already logged the failing step and its error. `laroux dev`,
`laroux serve` and `laroux build` report the failure and exit with code 1.

In `dev` mode, a change under the source directory rebuilds the app. After a
rebuild that succeeds, the server loads the rebuilt pages, layout, `route.ts`
handlers, `proxy.ts` modules and server actions, then sends the HMR clients an
update, so the change is served without a restart. Deno keeps an imported module
under its URL until the process exits, so the server imports these modules by
URLs that end in `?v=` and the build id: each rebuild loads fresh, and within
one build each module loads once. Serve mode imports them the same way, with a
build id that never changes. Pages and layouts are bundled with the modules they
import, but `route.ts` and `proxy.ts` load from `src/`, and the modules they
import keep the code they had when first loaded; restart the dev server after
changing one of those. A change to CSS files alone rebuilds the stylesheets, CSS
module styles included, and keeps the build id, so the loaded modules stay as
they are.

After a rebuild that fails, the server logs the failure and sends the clients an
error message without detail instead of an update; the error itself is in the
server log. When a rebuild succeeds but its pages or layout fail to load, such
as a page that throws on import, the server logs that error, keeps the pages of
the build it loaded before, and sends the clients the same kind of error
message.

The root entry point also exports the port types these options take (`Renderer`,
`HtmlShellBuilder`, `FrameworkPlugin`, `CssPlugin`, `CssProcessor`,
`FontOptimizer`, `ImageOptimizer` and the types they use), so you can type an
adapter of your own without importing the bundler.

### React Adapter

`@eserstack/laroux-server/adapters/react` implements the renderer and HTML shell
ports for React.

| Export                                                     | Description                                         |
| ---------------------------------------------------------- | --------------------------------------------------- |
| `reactRenderer`, `createReactRenderer()`                   | Renderer port for React pages and RSC payloads      |
| `reactHtmlShellBuilder`, `createReactHtmlShellBuilder()`   | HTML shell port for React apps                      |
| `renderToReadableStream()`                                 | Low-level RSC Flight renderer                       |
| `renderValueToReadableStream()`                            | RSC encoding of a value, such as an action result   |
| `renderRSC()`, `renderRSCResponse()`, `streamToResponse()` | RSC handler for the HTTP layer                      |
| `renderSSR()`, `generateRSCPayloadScript()`                | Server-side rendering with the RSC payload embedded |
| `createInlineRSCStream()`, `chunkToInlineScript()`         | Inline RSC chunks for streaming responses           |
| `renderApp()`                                              | Composes the layout and page with the request data  |

When a page fails to render as a whole, `renderSSR()` returns a fallback with a
fixed message and a correlation id instead of the error's message, which can
carry request data and internal detail. The error is logged on the server with
the same `correlationId`, so a visitor's report leads to the log entry.

### Request Data in Pages

The server passes each page `params`, `pathname` and `request`, and the layout
`children` and `request`. `request` is a `PageRequest` from `@eserstack/laroux`
with the decoded `cookies` (a `ReadonlyMap`), `host` (the Host header) and
`locale` (the page URL's `locale` parameter), each of the last two `null` when
the request has none. It is built for each render and never kept in module
scope, so concurrent requests cannot read each other's cookies:

```tsx
// src/app/routes/account/page.tsx
import type * as laroux from "@eserstack/laroux";

export function AccountPage(props: laroux.PageProps) {
  const name = props.request.cookies.get("display_name");

  return (
    <p>
      {name === undefined ? "Welcome" : `Welcome back, ${name}`} on{" "}
      {props.request.host ?? "this site"}
    </p>
  );
}
```

`request` reaches server components only; a page or layout that is a client
component does not get it. Pass a client component the values it renders, never
`request` or a cookie, since its props are sent to the browser.

`params` holds the route's parameters percent-decoded, in pages and in
`route.ts` handlers alike: `/stories/hello%20world` gives a
`stories/[slug]/page.tsx` page `{ slug: "hello world" }`. A catch-all such as
`docs/[...path]` also matches its bare prefix, `/docs` or `/docs/`, with
`path: []`. A decoded parameter can hold `/` or `..`, so validate it before it
goes into a file path or a query.

### Server Actions

Client components call server actions through stubs that `POST` to `/_rsc` with
an `RSC-Action` header. The arguments arrive as a JSON array or as one
`FormData`; any other body gets a 400. The server encodes the result with
`renderValueToReadableStream()`, so Dates, Maps, Sets, BigInts, `undefined`,
React elements and server action references reach the client as themselves. A
symbol, a promise, a plain function or an object that contains itself cannot be
sent: the call rejects with an error that names where it sits, such as
`value.user.onSave`. An action that throws answers 500 with
`{ "error": "Server action failed" }`, and the error is logged with the action
id.

### Configuration System

Type-safe configuration loading with 3-layer merging (defaults → user config →
`startServer` options). `loadConfig(projectRoot?)` reads `laroux.config.ts` from
the project root (the working directory by default) and deep-merges it over the
defaults from `@eserstack/laroux`:

```typescript
import * as larouxConfig from "@eserstack/laroux-server/config";

const config = await larouxConfig.loadConfig("./my-app");

console.log(config.server.port); // 8000 unless laroux.config.ts sets it
```

**Example `laroux.config.ts`:**

```typescript
import type { UserConfig } from "@eserstack/laroux";

export default {
  srcDir: "src",
  distDir: "dist",
  publicDir: "public",
  logLevel: "info",
  server: {
    port: 3000,
    hmr: true,
  },
} satisfies UserConfig;
```

See `UserConfig` in `@eserstack/laroux` for the full schema.

### CLI

| Command                | Flags                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `laroux init [folder]` | `--template` (minimal, blog, dashboard, docs), `--force`, `--no-git`, `--no-install` |
| `laroux dev`           | `--port`, `--no-hmr`, `--log-level`, `--open`                                        |
| `laroux build`         | `--out-dir`, `--clean`, `--no-minify`, `--analyze`, `--log-level`                    |
| `laroux serve`         | `--port`, `--log-level`                                                              |

`init` creates the project in `my-laroux-app` when no folder is given. The
`./module` export holds the same command tree for the `eser` CLI to mount.

### Server Action Registry (deprecated)

`@eserstack/laroux-server/action-registry` keeps the old manual registry
(`registerAction`, `invokeAction`, `getRegisteredActions`, `clearActions`). New
code marks its action modules with `"use server"` instead, and the bundler wires
them up. `invokeAction` does not log failures; it rejects with a
`ServerActionError` whose `actionId` names the action and whose `cause` is the
error the action threw, so the caller logs it once.

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `startServer` throws `BuildFailedError` when its pre-serve build fails, and
  `laroux build`, `dev` and `serve` exit with code 1; they used to serve a stale
  or empty `dist/`. Fix the build, or catch the error where you must keep
  running:

  ```typescript
  import * as larouxServer from "@eserstack/laroux-server";

  try {
    await larouxServer.startServer(options);
  } catch (error) {
    if (!(error instanceof larouxServer.BuildFailedError)) throw error;
    // After: decide here what a failed build means for your process
  }
  ```

- `startServer` loads the generated routes file, the root layout, the API route
  and proxy registries and the actions manifest before it serves. A module among
  them that fails to load, or a missing root layout, stops startup with that
  error; requests used to fail later. In dev, the same failure after a rebuild
  keeps the previous pages and sends HMR clients an error. Fix the reported
  module, or add `src/app/layout.tsx`.
- `ServerOptions` takes `cssProcessor`, `fontOptimizer` and `imageOptimizer`,
  and the build no longer runs Lightning CSS, Google Fonts self-hosting or sharp
  unless you pass them. The `laroux` CLI passes them; a programmatic caller adds
  them as in the `startServer` example:
  `cssProcessor: lightningcss.lightningCssProcessor`,
  `fontOptimizer: fonts.googleFontOptimizer`,
  `imageOptimizer: sharp.sharpImageOptimizer`.
- Page and `route.ts` params arrive percent-decoded, and API routes use the page
  matcher, so a catch-all also matches its prefix (`/docs` and `/api/docs/`).
  Remove `decodeURIComponent` on params, and validate a param before it reaches
  a file path or a query:

  ```typescript
  // Before
  const slug = decodeURIComponent(ctx.params.slug as string);
  // After
  const slug = ctx.params.slug as string;
  ```

- `renderApp` is typed as
  `renderApp(Layout: ComponentType<LayoutProps<ReactNode>>, Page: ComponentType<PageProps>, props?)`,
  and server-component pages and layouts receive `request`. Type them with
  `laroux.PageProps` and `laroux.LayoutProps<React.ReactNode>`.
- Server action calls answer with an RSC stream (`text/x-component`) instead of
  JSON (see the laroux-react README), and the RSC-Action 404 body is
  `{"error":"Action not found"}` without the id.
- `streamToResponse()` and `renderRSCResponse()` no longer send
  `Access-Control-Allow-Origin: *` or the other CORS headers. Same-origin
  clients need nothing. A deployment that serves the RSC payload to another
  origin adds CORS for that origin, for example with
  `http.middlewares.cors.cors({ origin: ["https://app.example.com"] })`.
- `invokeAction()` (`./action-registry`, deprecated) rejects with
  `ServerActionError` for an unknown id and for a throwing action, and no longer
  logs. Match `instanceof ServerActionError`, read `error.cause` for the
  action's own error and `error.actionId` for the action, and log in the caller.

## License

Apache-2.0 © [Eser Ozvataf](https://github.com/eser)

## 🔗 Links

- [@eserstack/cli](https://jsr.io/@eserstack/cli) - Main CLI tool (`eser laroux`
  commands)
- [@eserstack/laroux-bundler](https://jsr.io/@eserstack/laroux-bundler) - Build
  system and HMR
- [@eserstack/laroux](https://jsr.io/@eserstack/laroux) - Framework-agnostic
  core: router, configuration types and defaults
- [@eserstack/laroux-react](https://jsr.io/@eserstack/laroux-react) - React
  integration for laroux
- [JSR Package](https://jsr.io/@eserstack/laroux-server)
- [eserstack repository](https://github.com/eser/stack)
