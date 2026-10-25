# ⚛️ [@eserstack/laroux-react](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/laroux-react` is
> published on npm under the same name (`pnpm add @eserstack/laroux-react`); the
> JSR versions stay available but get no updates.

> **eserstack Product-Candidate** — React integration for laroux ·
> [eser/stack](https://github.com/eser/stack) **Install:**
> `pnpm add jsr:@eserstack/laroux-react`

React Server Components adapter for laroux.js framework.

## Overview

This package implements the React Server Components (RSC) protocol for the
laroux.js framework. It provides the necessary adapters and utilities to enable
server-side rendering with React 19.x's Server Components architecture on Deno.
Pages in a laroux app use its `Link`, `useRouter` and `Image` exports; the
laroux server and client bootstrap use its RSC protocol and client parser.

## 🚀 Quick Start

Render an image and link to another page from a laroux page:

```tsx
import * as larouxReact from "@eserstack/laroux-react";

export function HomePage() {
  return (
    <main>
      <larouxReact.Image
        src="/images/hero.jpg"
        alt="Team at the 2025 offsite"
        width={1600}
        height={900}
        priority
      />
      <larouxReact.Link href="/stories">Read the stories</larouxReact.Link>
    </main>
  );
}
```

## Features

- **React Server Components**: Full support for RSC protocol
- **Streaming SSR**: Stream React components from server to client
- **Client Components**: Automatic code splitting for client-side interactivity
- **Server Actions**: Type-safe server-side mutations
- **Deno-first**: Built specifically for the Deno runtime

## Installation

```bash
pnpm add jsr:@eserstack/laroux-react
```

## Usage

The RSC protocol and client parser are typically used internally by
`@eserstack/cli` (via `eser laroux` commands) and `@eserstack/laroux-server`.
You generally won't need to import them directly unless you're building custom
tooling. Pages and components import `Link`, `useRouter` and `Image`.

### Navigation

`Link` renders a real `<a href>` and navigates on the client for internal paths.
The browser handles URLs with a scheme (`http(s)` on the same origin included,
`mailto:`, `tel:` and others) or a leading `//`, hash links, a `target` other
than `_self`, `download`, clicks with a modifier key or a button other than the
primary one, and clicks whose `onClick` calls `event.preventDefault()`.
`replace` swaps the history entry instead of adding one, and `scroll={false}`
keeps the scroll position. `Link` navigates on the client in server and client
components alike. laroux drops the functions a server component renders, so the
anchor also carries its options in `data-laroux-link` and `data-laroux-scroll`
attributes, and the laroux client script handles clicks on such anchors under
the same rules. `useRouter()` returns `push`, `replace`, `back`, `forward` and
`refresh` for navigation that follows an action:

```tsx
"use client";

import * as larouxReact from "@eserstack/laroux-react";

export function BackButton() {
  const router = larouxReact.useRouter();

  return (
    <button type="button" onClick={() => router.back()}>
      Back
    </button>
  );
}
```

### Images

`Image` renders an `<img>` that loads lazily with async decoding. `alt` is
required (empty for decorative images), and `width` and `height` prevent layout
shift. `priority` loads an above-the-fold image eagerly with
`fetchpriority="high"`, `formats={["avif", "webp"]}` renders a `<picture>` with
those variants of the same path, and `ImageSizes` holds common `sizes` values.
`ResponsiveImage` wraps the image in an aspect-ratio box:

```tsx
import * as larouxReact from "@eserstack/laroux-react";

export function StoryCover(props: { readonly src: string }) {
  return (
    <larouxReact.ResponsiveImage
      src={props.src}
      alt=""
      aspectRatio="16/9"
      sizes={larouxReact.ImageSizes.halfWidth}
      fallback="/images/cover-placeholder.jpg"
    />
  );
}
```

`placeholder="blur"` with a `blurDataURL` shows that small image as the
element's background while the image loads; without a `blurDataURL`, or with an
empty one, there is no placeholder. `ResponsiveImage` turns the blur on whenever
`blurDataURL` is not empty. The prop types (`ImageProps`,
`ResponsiveImageProps`, `ImageFormat`, `ObjectFitValue`, `PlaceholderType`,
`AspectRatioValue`) are exported from the package root.

`fallback` is shown instead of `src` when `src` is empty or fails to load, in
server and client components alike. The image carries it as a
`data-laroux-fallback` attribute, and the laroux client script swaps it in when
the image fails, including an image that failed before the script loaded.

### Client-Side Hydration

The client parser lives in the `./client` entry point, which the package root
does not re-export:

```typescript
import * as larouxClient from "@eserstack/laroux-react/client";

// Hydrate client components from RSC stream
const RSCTreeRoot = await larouxClient.createFromFetch(fetch("/rsc"));
```

`createFromFetch()` resolves to a component function that reads the stream as
React renders it, so parts that have not arrived suspend. When the stream fails,
every part React still waits for fails with the stream's error, and the nearest
error boundary shows it instead of a fallback that never goes away. A stream
that ends without a part fails that part with an error naming it.

`createValueFromReadableStream()` reads a stream that carries a value instead of
a page tree. The client bootstrap uses it for server action results: it resolves
once the value is complete, and Dates, Maps, Sets, BigInts, `undefined` and
React elements come back as themselves. Code in a page calls the action itself;
this is for custom tooling that posts to `/_rsc`:

```typescript
import * as larouxClient from "@eserstack/laroux-react/client";

const response = await fetch("/_rsc", {
  method: "POST",
  headers: {
    "RSC-Action": "src/app/actions#saveDraft",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(["draft_text"]),
});

if (response.body !== null) {
  const result = await larouxClient.createValueFromReadableStream(
    response.body,
  );
}
```

In the wire format, a string that starts with `$` is a reference or a tagged
value (`protocol.RSC_VALUE_TAGS`), so the laroux server sends strings that start
with `$` with a second `$` in front, and this parser removes it.

### Span Rendering

Render `@eserstack/streams` Span trees as React elements. The same formatting
that produces ANSI terminal output or Markdown can produce React components:

```tsx
import * as larouxReact from "@eserstack/laroux-react";
import * as streams from "@eserstack/streams";

export function RecipeHeader(props: { readonly name: string }) {
  return (
    <larouxReact.SpanView>
      {[streams.span.bold("Recipe: "), streams.span.cyan(props.name)]}
    </larouxReact.SpanView>
  );
  // Renders: <strong>Recipe: </strong><span class="text-cyan-500" data-color="cyan">name</span>
}
```

Block spans render as HTML elements: a code block as `<pre><code>`, a table as
`<table>`, a list as `<ul>`, a gauge as a `<meter>` with its percentage, a
separator as `<hr>` and an alert as a note that names its level in text.

The `reactRenderer()` renderer implements `@eserstack/streams`'s
`Renderer<React.ReactElement>` interface — the same interface that `ansi()`,
`markdown()`, and `plain()` implement for strings:

```tsx
import * as larouxReact from "@eserstack/laroux-react";
import * as streams from "@eserstack/streams";

const renderer = larouxReact.reactRenderer();
const element = renderer.render([
  streams.span.bold("hello"),
  streams.span.text(" world"),
]);
// <><strong>hello</strong> world</>
```

### Running Handlers in Server Components

Use `runFunction()` to run `@eserstack/functions` handlers inside React Server
Components. The same handler that powers `eser kit list` in the terminal can
fetch data for a web page:

```tsx
// src/app/routes/recipes/[lang]/page.tsx
import * as larouxReact from "@eserstack/laroux-react";
import * as kitHandlers from "@eserstack/kit/recipes/handlers";

type RecipesPageProps = { readonly params: { readonly lang: string } };

export async function RecipesPage(props: RecipesPageProps) {
  const output = await larouxReact.runFunction(
    kitHandlers.listRecipes.listRecipes({ language: props.params.lang }),
  );

  return (
    <ul>
      {output.recipes.map((recipe) => (
        <li key={recipe.name}>
          {recipe.name}: {recipe.description}
        </li>
      ))}
    </ul>
  );
}
```

`runFunction()` creates a buffer-backed Output context, runs the handler's Task,
and returns the success value. On failure, it throws — React Error Boundaries
handle the error.

## Exports

| Export               | Purpose                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `./mod.ts`           | Main: Link, useRouter, Image, ResponsiveImage, SpanView, runFunction |
| `./client`           | Client-side hydration and rendering                                  |
| `./protocol`         | Shared RSC wire protocol utilities                                   |
| `./span-renderer`    | React Span renderer + SpanView component                             |
| `./use-function`     | `runFunction()` for running handlers in server components            |
| `./client/bootstrap` | Client bootstrap utilities, including `installLinkNavigation()`      |

## Dependencies

- `react` ^19.3.0
- `react-dom` ^19.3.0
- `@eserstack/laroux` (navigation, image and router helpers, chunk manifest
  types)
- `@eserstack/streams` (Span types, renderers, Output)
- `@eserstack/functions` (Task, handler execution)
- `@eserstack/primitives` (Result types)
- `@eserstack/logging` (client warnings and errors)

laroux-bundler copies the client bootstrap into the app's `dist/` directory and
bundles it from there, so its imports resolve from the app: install `react`,
`react-dom` and `@eserstack/laroux` in the app itself.

## Architecture

This package bridges React's Server Components implementation with Deno's
runtime and integrates with the eser stack handler architecture:

1. **Server**: Renders Server Components to RSC protocol streams
2. **Client**: Hydrates and renders Client Components in the browser
3. **Protocol**: Implements RSC wire format for streaming components
4. **Span Renderer**: Converts `@eserstack/streams` Span trees to React elements
5. **Function Runner**: Runs `@eserstack/functions` handlers inside server
   components

The client parser and bootstrap log warnings and errors through
`@eserstack/logging` under the `laroux-bundler` category. Client builds, in
development and production, replace `@eserstack/logging` with laroux's browser
logger, which keeps the package's logger API (`logger.with(...)` included) and
writes warnings and errors to the browser console. The app's `browserShims`
setting can map `@eserstack/logging` to another module.

## Related Packages

- [`@eserstack/laroux`](https://jsr.io/@eserstack/laroux) - Framework-agnostic
  core utilities (navigation, image, router, config)

## Documentation

- [JSR Package](https://jsr.io/@eserstack/laroux-react) — symbol-level API
  reference, generated from source
- [React Server Components](https://react.dev/reference/rsc/server-components)

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- Server action results arrive as an RSC stream (`text/x-component`) instead of
  JSON, and the client bootstrap accepts only that content type. Deploy
  laroux-server and laroux-react from the same release. A newer client with an
  older server fails each call with an error saying to run the same laroux
  version on both sides. Custom code that read JSON from `/_rsc` decodes the
  body instead:

  ```typescript
  import * as larouxClient from "@eserstack/laroux-react/client";

  // Before: const result = await response.json();
  if (response.body !== null) {
    const result = await larouxClient.createValueFromReadableStream(
      response.body,
    );
  }
  ```

- RSC wire format: a string in a J chunk that starts with `$` is sent with a
  second `$`, values JSON cannot hold travel as tags (`$D`, `$n`, `$Q`, `$W`,
  `$undefined`, `$NaN`, `$Infinity`, `$-Infinity`, `$-0`; see
  `protocol.RSC_VALUE_TAGS`), and array children are `"$<id>"` references. A
  custom RSC parser strips the extra `$` and decodes the tags, or uses
  `@eserstack/laroux-react/client`.
- `createFromReadableStream` and `createHybridRSCTree` fail every pending chunk
  when the stream fails or ends without it; its Suspense boundary used to wait
  forever. Render an error boundary above Suspense boundaries that stream data.
- `Link` has no `prefetch` prop; it was accepted and ignored. Before:
  `<Link href="/about" prefetch>`. After: `<Link href="/about">`.
- `Link` runs the app's `onClick` on every click before it decides anything, and
  `event.preventDefault()` there stops its client navigation. An `onClick` that
  assumed a client navigation checks `event.defaultPrevented` or the href.
  Clicks with a `target` other than `_self`, with `download`, or with a
  non-primary button are left to the browser.
- `Link` writes `data-laroux-link` (and `data-laroux-scroll="false"` with
  `scroll={false}`) on its anchor, and the client bootstrap handles clicks on
  them, so a `Link` that a server component renders now navigates on the client
  instead of loading the whole page. Render a plain `<a>` for a full page load.
- `Image` has no `onError` handler and no `data-onerror` attribute; it renders
  the fallback as `data-laroux-fallback`, which laroux's client bootstrap
  applies. An empty `src` with a fallback renders the fallback directly. A React
  app that renders `Image` without laroux's bootstrap adds its own error
  listener that reads `data-laroux-fallback`.
- The client bootstrap that laroux-bundler copies into the build imports
  `@eserstack/laroux/navigation`, and laroux-react no longer depends on
  laroux-bundler. Add `@eserstack/laroux` to the app's dependencies.
- Client log records carry their fields as logger properties set with
  `with(...)` instead of an `args` attribute. Custom sinks read
  `record.properties` instead of `record.args`.

## License

Apache-2.0

## Contributing

Contributions are welcome! Please see the
[main repository](https://github.com/eser/stack) for contribution guidelines.

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
