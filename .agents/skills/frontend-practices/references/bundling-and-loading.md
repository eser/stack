# Bundling and Loading

What ships to the browser and when it loads: imports and tree shaking, import
paths, lazy loading, preloading, resource hints, scripts and static assets.

## Contents

- Namespace Imports and Tree Shaking
- Statically Analyzable Paths
- Load Heavy and Optional Code on Demand
- Preload on User Intent
- Resource Hints
- Scripts Never Block Parsing
- Small SVG Assets

---

## Namespace Imports and Tree Shaking

Scope: Imports in code that ships to the browser

Rule: Keep namespace imports (javascript-practices: Imports) and access their
members by name (`icons.Check`). Rolldown, the backend of laroux-bundler, drops
the unused exports of a namespace whose members are accessed by name; an access
by computed key (`icons[name]`) keeps the whole module. When the choice is
dynamic, write an explicit map of the members you use. For a large third-party
library (an icon set, a component kit) whose entry pulls in modules with side
effects, or that a dev server or test runner loads unbundled, import from the
library's documented per-module entry point instead, and compare the bundle size
before and after.

Correct:

```tsx
import * as icons from "lucide-react";

const STATUS_ICONS = { done: icons.Check, failed: icons.X } as const;

<icons.Check aria-hidden="true" />;
```

Incorrect:

```tsx
const Icon = icons[props.iconName]; // keeps every icon in the bundle
```

**Why:** the bundler can prove which members a static access uses; a computed
key could be any of them, so every export stays.

---

## Statically Analyzable Paths

Scope: Dynamic `import()` and file reads with computed paths

Rule: Give bundlers and file tracers literal paths. Choose between known modules
with an explicit map of `() => import("./x.ts")` loaders, not a template string,
and read files from literal or constant-joined paths. Code that loads a user's
modules at runtime on purpose (a framework loading route files) is the exception
and builds its specifier deliberately.

Correct:

```ts
const LOCALE_LOADERS = {
  en: () => import("./locales/en.ts"),
  tr: () => import("./locales/tr.ts"),
} as const;

const messages = await LOCALE_LOADERS[locale]();
```

Incorrect:

```ts
const messages = await import(`./locales/${locale}.ts`); // every file the pattern matches, or none
```

**Why:** a computed path makes the bundler include every file the pattern could
match, or miss the one that is needed at runtime.

---

## Load Heavy and Optional Code on Demand

Scope: Code the first render does not need

Rule: Load it when it is needed:

- A heavy component (an editor, a chart, a map) loads through `React.lazy`
  behind `Suspense`. `React.lazy` expects a module with a `default` export, so
  map the named export in the loader.
- A feature that the user turns on loads with `import()` in the handler or
  effect that turns it on.
- Analytics and error reporting load after hydration, not in the initial bundle.

laroux already loads each client component's chunk when the server payload
references it; `React.lazy` is for code inside client components that only some
interactions need.

Correct:

```tsx
const CodeEditor = React.lazy(async () => {
  const module = await import("./code-editor.tsx");
  return { default: module.CodeEditor };
});

<React.Suspense fallback={<EditorSkeleton />}>
  <CodeEditor value={props.source} />
</React.Suspense>;
```

---

## Preload on User Intent

Scope: Lazy chunks behind a control the user is about to use

Rule: Start loading the chunk when the user signals intent (pointer enter or
focus on the control), so the click finds it ready. Call the same `import()` the
lazy component uses; the module cache makes the second call free.

Correct:

```tsx
function preloadEditor(): void {
  // A failed preload is retried and reported when the lazy component renders.
  import("./code-editor.tsx").catch(() => {});
}

<button
  type="button"
  onPointerEnter={preloadEditor}
  onFocus={preloadEditor}
  onClick={openEditor}
>
  Edit
</button>;
```

---

## Resource Hints

Scope: Origins, fonts, styles and chunks the page needs early

Rule: Tell the browser before it discovers them, with `<link>` tags in the
document head or React DOM's `preconnect`, `prefetchDNS`, `preload`, `preinit`
and `preloadModule` called during render:

- `preconnect` for an API or CDN origin the page calls right away; `prefetchDNS`
  for one it calls later.
- `preload` for a critical font (served with `font-display: swap`) or the hero
  image.
- `preinit` for a stylesheet or script that must run early.
- `preloadModule` for the chunk of the likely next step.

Hint only what the current page uses; every hint competes for bandwidth with the
page itself.

---

## Scripts Never Block Parsing

Scope: `<script src>` tags in documents

Rule: Every classic script has `defer` (runs in order after parsing; for scripts
that use the DOM or each other) or `async` (runs as soon as it loads; for
independent scripts such as analytics). Module scripts (`type="module"`) defer
by default.

Incorrect:

```html
<script src="https://analytics.example.com/script.js"></script>
```

---

## Small SVG Assets

Scope: SVG files and inline SVG that ship to the browser

Rule: Reduce path precision to what the view box needs, often one decimal, with
SVGO (`pnpm dlx svgo --precision=1 --multipass icon.svg`). Large static SVGs are
served as files or hoisted to a module constant, not rebuilt in every render.
