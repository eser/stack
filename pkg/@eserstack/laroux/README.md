# 🌐 [@eserstack/laroux](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/laroux` is published
> on npm under the same name (`pnpm add @eserstack/laroux`); the JSR versions
> stay available but get no updates.

> **eserstack Product-Candidate** — framework-agnostic web core ·
> [eser/stack](https://github.com/eser/stack) **Install:**
> `pnpm add jsr:@eserstack/laroux`

Framework-agnostic core utilities for **Laroux.js** — a full-stack web framework
built on React Server Components. This package provides the shared logic used
across the Laroux ecosystem without any runtime or framework dependencies.

## 🚀 Quick Start

```typescript
import * as laroux from "@eserstack/laroux";

// Navigation analysis: should the client-side router handle this click?
const analysis = laroux.analyzeNavigation("/about", {
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
});
// { shouldHandle: true }

// Route matching
const params = laroux.matchRoute("/users/123", {
  path: "/users/[id]",
  component: null,
});
console.log(params); // { id: "123" }

// Check if URL is external
laroux.isExternalUrl("https://other.com"); // true
```

## 🛠 Features

- **Navigation** — URL analysis, link configuration, modifier key detection
- **Routing** — Path matching, normalization, API route definitions
- **Image Optimization** — Responsive images, format detection, srcset building
- **Configuration** — Default configs for SSR, builds, server, and more
- **Browser shims**: a browser logger that client bundles use in place of
  `@eserstack/logging`
- **Chunk manifest**: the build output format the bundler, the server and the
  client share

## 📦 Laroux Ecosystem

`@eserstack/laroux` is the core package in a family of four:

| Package                       | Purpose                                               |
| ----------------------------- | ----------------------------------------------------- |
| **@eserstack/laroux**         | Framework-agnostic core (this package)                |
| **@eserstack/laroux-server**  | HTTP server, SSR, and React Server Components runtime |
| **@eserstack/laroux-react**   | React client runtime, hydration, and protocol         |
| **@eserstack/laroux-bundler** | Build tooling, CSS, Tailwind, and asset processing    |

## 📋 Modules

### Navigation

Client-side navigation utilities for SPA-style routing.

```typescript
import * as laroux from "@eserstack/laroux";

// Build link configuration
const link = laroux.buildLinkConfig({ href: "/dashboard" });
// { href: "/dashboard", replace: false, scroll: true }

// Analyze navigation intent from the click's modifier keys
const nav = laroux.analyzeNavigation("https://other.com", {
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
});
// { shouldHandle: false, reason: "external" }

// Check URL types
laroux.isExternalUrl("https://other.com"); // true
laroux.isSpecialProtocol("mailto:user@example.com"); // true
```

The router handles relative links only. A click with a modifier key held, a hash
link and every link that names a scheme or another host are left to the browser:
`mailto:` and `tel:` with their own reason, and `http(s)`, protocol-relative
(`//cdn.example.com`) and any other scheme (`ftp:`, `javascript:`, `data:`) as
`"external"`.

### Router

URL pattern matching and API route handling.

Patterns use `[param]` for one segment and `[...param]` for the rest of the
path. Pass the pathname as the URL has it (`URL.pathname`, percent-encoded): the
parameters come back decoded, and a segment with a malformed escape such as
`100%` keeps its raw form. A decoded value can hold `/` or `..`, so validate it
before it goes into a file path or a query. A catch-all matches zero or more
segments, its bare prefix included: `/docs/[...path]` matches `/docs` and
`/docs/` with `path: []`, so a path and its `normalizePath()` form reach the
same route. laroux-server matches pages and `route.ts` API routes this way.

```typescript
import * as laroux from "@eserstack/laroux";

const routes: laroux.RouteDefinition[] = [
  { path: "/users/[id]", component: null },
  { path: "/docs/[...path]", component: null },
];

// Match one route and read its parameters
const params = laroux.matchRoute("/users/123", routes[0]!);
// { id: "123" }

// Parameters come back decoded
laroux.matchRoute("/users/jane%20doe", routes[0]!);
// { id: "jane doe" }

// Find the first matching route in a set (order from specific to general)
const match = laroux.findMatchingRoute("/docs/guide/intro", routes);
// { route: routes[1], params: { path: ["guide", "intro"] } }

// A catch-all also matches its bare prefix
laroux.findMatchingRoute("/docs", routes);
// { route: routes[1], params: { path: [] } }

// Normalize paths
laroux.normalizePath("stories/hello/"); // "/stories/hello"

// Create HTTP responses
laroux.jsonResponse({ ok: true }); // 200 Response with a JSON body
laroux.jsonResponse({ id: 7 }, { status: 201, headers: new Headers() }); // init passes through
laroux.errorResponse("Not found", 404); // {"error":"Not found"} with status 404
laroux.HttpError.notFound(); // {"error":"Not Found"} with status 404
```

Pages and layouts receive the request they render for as their `request` prop, a
`PageRequest`: `cookies` (a `ReadonlyMap` of the decoded cookie values), `host`
(the Host header or `null`) and `locale` (the page URL's `locale` parameter or
`null`). `PageProps` and `LayoutProps` type the props, and `parseCookieHeader()`
is the parser behind `cookies`:

```typescript
import * as laroux from "@eserstack/laroux";

export function greeting(props: laroux.PageProps): string {
  const name = props.request.cookies.get("display_name");
  return name === undefined ? "Welcome" : `Welcome back, ${name}`;
}

laroux.parseCookieHeader('theme=dark; note="hello%20world"');
// Map { "theme" => "dark", "note" => "hello world" }
```

The request reaches only server components. Pass a client component the values
it renders, never `request` or a cookie: client component props are sent to the
browser, HttpOnly cookies included.

### Image

Responsive image utilities for optimized delivery.

```typescript
import * as laroux from "@eserstack/laroux";

// Build image attributes
const attrs = laroux.buildImageAttributes({
  src: "/images/hero.jpg",
  width: 800,
  height: 600,
  alt: "Hero image",
});

// Generate srcset for responsive images
const srcSet = laroux.inferSrcSet("/images/photo.jpg", [400, 800, 1200]);
// "/images/photo-400w.jpg 400w, /images/photo-800w.jpg 800w, ..."

// Parse image source: the extension comes from the file name only
const { basePath, ext } = laroux.parseImageSrc("/images/photo.jpg");
// { basePath: "/images/photo", ext: "jpg" }
laroux.parseImageSrc("https://img.example.com/avatar");
// { basePath: "https://img.example.com/avatar", ext: "" }

// Build picture element sources, AVIF first
const sources = laroux.buildPictureSources({
  basePath,
  ext,
  formats: ["avif", "webp"],
  srcSet,
  sizes: "100vw",
});

// Blur placeholder styles, only for a "blur" placeholder with a data URL
const blurDataURL = "data:image/webp;base64,UklGRhQAAABXRUJQ";
laroux.shouldShowPlaceholder("blur", blurDataURL); // true
laroux.shouldShowPlaceholder("blur", ""); // false
const styles = laroux.buildPlaceholderStyles("blur", blurDataURL);
// { backgroundImage: 'url("data:image/webp;base64,UklGRhQAAABXRUJQ")', backgroundSize: "cover", backgroundPosition: "center" }
```

`buildPictureSources()` takes one options object, so the optional `srcSet` and
`sizes` strings cannot be swapped by position. When `srcSet` is absent, each
format's srcset is inferred from `basePath`.

### Configuration

Default configuration values for Laroux applications.

```typescript
import * as laroux from "@eserstack/laroux";

// Access default configurations
const serverConfig = laroux.DEFAULT_SERVER;
const buildConfig = laroux.DEFAULT_BUILD;
const ssrConfig = laroux.DEFAULT_SSR;
const imageConfig = laroux.DEFAULT_IMAGES;
```

`DEFAULT_BROWSER_SHIMS` lists the modules that client bundles replace, in
development and production builds alike. `@eserstack/logging` writes through a
native library a browser cannot load, so it becomes a browser logger with the
same API: `logger.getLogger(category)` returns a logger with `trace()` through
`emergency()`, `log()`, `with()` and `getChild()`, records at `Warning` and
above go to the browser console, and `config.configure()` takes the package's
options to change the level or send records to other sinks. Its `context`,
`sinks`, `filters`, `formatters` and `tracer` modules are not part of the shim.
`node:process` becomes a minimal `process.env`. Client code logs the way server
code does:

```typescript
import * as logging from "@eserstack/logging";

const logger = logging.logger.getLogger(["app", "checkout"]);

export async function reportSlowPayment(orderId: string): Promise<void> {
  // In the browser: console.warn("[app.checkout] payment took longer than a second", { orderId })
  await logger.with({ orderId }).warn("payment took longer than a second");
}
```

### Chunk Manifest

`ChunkManifest`, `ComponentChunkInfo` and `FileInfo` describe a client build:
laroux-bundler writes the manifest to `dist/client/manifest.json`, laroux-server
puts it into the page as `globalThis.__CHUNK_MANIFEST__`, and the laroux-react
client reads it to load client components. The types live in this package so the
three share the format without depending on each other.

```typescript
import * as laroux from "@eserstack/laroux";

// The chunk files a client component needs, main chunk first
export function chunksOf(
  manifest: laroux.ChunkManifest,
  componentPath: string,
): string[] {
  const info = manifest.chunks[componentPath];
  return info === undefined ? [] : [info.main, ...info.deps];
}
```

## 🔌 API Reference

### Navigation

| Export                  | Description                               |
| ----------------------- | ----------------------------------------- |
| `analyzeNavigation()`   | Analyze a navigation target URL           |
| `buildLinkConfig()`     | Build configuration for a link element    |
| `isExternalUrl()`       | Check if a URL is an absolute http(s) URL |
| `isSpecialProtocol()`   | Check for mailto:, tel:, etc.             |
| `NAVIGATION_EVENT_NAME` | Event name constant for navigation events |

### Router

| Export                | Description                         |
| --------------------- | ----------------------------------- |
| `matchRoute()`        | Match a URL against a route pattern |
| `findMatchingRoute()` | Find first matching route in a set  |
| `normalizePath()`     | Normalize URL path                  |
| `jsonResponse()`      | Create a JSON Response              |
| `errorResponse()`     | Create an error Response            |
| `HttpError`           | Named helpers for error Responses   |
| `parseCookieHeader()` | Parse a Cookie header into a Map    |
| `createPageRequest()` | Build the `request` prop of a page  |

### Image

| Export                      | Description                            |
| --------------------------- | -------------------------------------- |
| `buildImageAttributes()`    | Build HTML img attributes              |
| `buildPictureSources()`     | Build picture element source entries   |
| `buildPlaceholderStyles()`  | Build placeholder CSS styles           |
| `shouldShowPlaceholder()`   | Check if a blur placeholder applies    |
| `inferSrcSet()`             | Generate srcset from widths            |
| `parseImageSrc()`           | Parse image source URL                 |
| `buildFormatSrcSet()`       | Build srcset for a specific format     |
| `shouldUsePictureElement()` | Determine if picture element is needed |

### Configuration

| Export                  | Description                                  |
| ----------------------- | -------------------------------------------- |
| `DEFAULT_CONFIG`        | Complete default configuration               |
| `DEFAULT_SERVER`        | Default server settings                      |
| `DEFAULT_BUILD`         | Default build settings                       |
| `DEFAULT_SSR`           | Default SSR settings                         |
| `DEFAULT_IMAGES`        | Default image optimization settings          |
| `DEFAULT_BROWSER_SHIMS` | Modules client bundles replace, logging shim |

### Chunk Manifest

| Export               | Description                                    |
| -------------------- | ---------------------------------------------- |
| `ChunkManifest`      | A client build's manifest                      |
| `ComponentChunkInfo` | The main chunk and dependencies of a component |
| `FileInfo`           | Name, size and hash of a bundled file          |

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- Pages and layouts receive a `request` prop (`PageProps`, `LayoutProps`). Type
  them with the laroux types:

  ```typescript
  import type * as React from "react";
  import type * as laroux from "@eserstack/laroux";

  // Before: export function StoryPage(props: Record<string, unknown>)
  export function StoryPage(props: laroux.PageProps) {
    /* ... */
  }
  // Before: export function RootLayout(props: { children: React.ReactNode })
  export function RootLayout(props: laroux.LayoutProps<React.ReactNode>) {
    /* ... */
  }
  ```

- `matchRoute` and `findMatchingRoute` decode params and let a catch-all match
  its bare prefix, as in `@eserstack/standards`. Remove your own
  `decodeURIComponent` on params.
- `buildPictureSources` takes one options object (`PictureSourcesOptions`):

  ```typescript
  import * as laroux from "@eserstack/laroux";

  // Before
  laroux.buildPictureSources(basePath, ext, ["avif", "webp"], srcSet, sizes);
  // After
  laroux.buildPictureSources({
    ...laroux.parseImageSrc(src),
    formats: ["avif", "webp"],
    srcSet,
    sizes,
  });
  ```

- `buildPlaceholderStyles` writes `backgroundImage` as a quoted, escaped
  `url("...")` instead of `url(...)`. Only code that compares the exact string
  changes.
- `DEFAULT_BROWSER_SHIMS` gives client bundles a real `@eserstack/logging` that
  writes Warning and above to the browser console, instead of a no-op. To keep
  the browser silent, call `config.configure()` with a higher `lowestLevel` in
  client code, or map `@eserstack/logging` to another module in the app's
  `browserShims`.
- The chunk manifest types (`ChunkManifest`, `ComponentChunkInfo`, `FileInfo`)
  live in `@eserstack/laroux` (root and `./chunk-manifest`);
  `@eserstack/laroux-bundler` still re-exports them. Before: `ChunkManifest`
  from laroux-bundler. After: `laroux.ChunkManifest`.

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
