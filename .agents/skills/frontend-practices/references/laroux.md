# laroux

How code runs on laroux (`@eserstack/laroux`, `laroux-react`, `laroux-bundler`,
`laroux-server`), checked against their source. These rules apply when this
codebase uses laroux; the rest of this skill applies either way.

## Contents

- Route Files and Exports
- The "use client" Boundary
- Props Crossing the Boundary
- Server Actions
- CSS Modules with @apply
- Navigation With Link and useRouter
- Images With the Image Component
- Per-Request Data Under laroux

---

## Route Files and Exports

Scope: Files under the routes directory (`src/app/routes`)

Rule: The directory path is the URL. `home/` maps to `/`, `[slug]` is a dynamic
segment and `[...slug]` a catch-all, which also matches the bare directory: for
`docs/[...slug]/`, `/docs` and `/docs/` give `slug: []`. Pages and `route.ts`
handlers get `params` percent-decoded; a decoded value can hold `/` or `..`, so
validate it before it reaches a file path or a query. Only the four file names
below become routes, so helpers can sit next to them. A file or directory whose
name starts with `_` is skipped, along with everything under that directory, so
`_private/` can hold helpers that never become routes. Each directory may hold:

| File         | What laroux loads                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `page.tsx`   | A named component, preferably ending in `Page` (`StoriesPage`)                                             |
| `layout.tsx` | A named component ending in `Layout`; it wraps this directory's page and pages below without their own one |
| `route.ts`   | Named handlers `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`: `(ctx: ApiContext) => Response` |
| `proxy.ts`   | A `default` function that runs for requests under this directory                                           |

`laroux.config.ts` at the app root also exports `default`. Only the closest
layout wraps a page; layouts do not nest. laroux finds exports with regular
expressions, so declare them as `export function` or `export const`; an export
it cannot see is not registered.

Correct:

```tsx
// src/app/routes/stories/[slug]/page.tsx
export async function StoryPage(props: StoryPageProps) {
  const story = await getStory(props.params.slug);
  return <Story title={story.title} body={story.body} />;
}
```

Incorrect:

```tsx
function StoryPage(props: StoryPageProps) {
  /* ... */
}
export default StoryPage; // pages are loaded by name, not through default
```

---

## The "use client" Boundary

Scope: Every component file in a laroux app

Rule: A component is a server component unless its file starts with the
`"use client";` directive. laroux recognizes the directive only as the first
statement, written with the semicolon that oxfmt adds; comments may come
before it. Mark the smallest leaf that needs state, effects, event handlers or
browser APIs, and keep data fetching and heavy dependencies in server
components, since everything a client file imports ships to the browser.

laroux calls server components as plain functions, outside React's renderer, so
a server component cannot call any hook, `React.use` included: make it `async`
and `await` instead.

Correct:

```tsx
// Copyright header
"use client";

import * as React from "react";

export function LikeButton(props: { initialCount: number }) {
  const [count, setCount] = React.useState(props.initialCount);
  return (
    <button type="button" onClick={() => setCount((c) => c + 1)}>
      Like ({count})
    </button>
  );
}
```

Incorrect:

<!-- prettier-ignore -->
```tsx
import * as React from "react";

"use client"; // after an import: laroux treats the file as a server component
```

---

## Props Crossing the Boundary

Scope: Props that server components pass to client components

Rule: laroux serializes a client component's props with `JSON.stringify`. Pass
strings, numbers, booleans, `null`, arrays and plain objects; React elements
only as `children` or `fallback`; server actions only as top-level props.
Anything else changes without an error:

- functions are dropped;
- a React element in any other prop (`icon={<Check />}`) arrives broken;
- a `Date` becomes an ISO string, `Map` and `Set` become `{}`, class instances
  lose their methods, and `undefined` fields disappear;
- a promise arrives as `{}`, so it cannot be passed to `React.use` on the
  client.

Convert on the server (`createdAt: post.createdAt.toISOString()`) and parse in
the client component.

Correct:

```tsx
<PostMeta title={post.title} createdAt={post.createdAt.toISOString()} />
```

Incorrect:

```tsx
<PostMeta post={post} onShare={() => share(post.id)} /> // onShare is dropped
```

---

## Server Actions

Scope: Files with the `"use server"` directive

Rule: Put actions in a file that starts with `"use server";` and export each one
as a named `async function`. laroux registers every named export of that file as
an action with the id `<path>#<name>`, ignores its default export and does not
transform a `"use server"` directive inside a function body, so export nothing
but actions from it. Client components import actions directly; the bundler
replaces them with stubs that `POST` to `/_rsc` with an `RSC-Action` header, and
the arguments arrive as a JSON array or as `FormData`. The result reaches the
client encoded as RSC: Dates, Maps, Sets, BigInts, `undefined`, React elements
and other server actions arrive as themselves, while a symbol, a promise, a
plain function or an object that contains itself fails the call with an error
naming where it sits. Every argument is untrusted input
(data-fetching-and-server.md: Server Actions Are Public Endpoints).

Correct:

```ts
"use server";

export async function addComment(formData: FormData) {
  const session = await requireSession();
  const comment = parseComment(formData.get("comment"));
  await comments.add(session.userId, comment);
  return { ok: true };
}
```

---

## CSS Modules with @apply

Scope: Styling React components in laroux apps

Rule: Style a component with a co-located `*.module.css` file that uses semantic
class names and Tailwind `@apply`; laroux-bundler expands `@apply` against the
global stylesheet (`src/app/styles/global.css` by default) when it processes CSS
modules. Import the module with a default import: laroux-bundler compiles it to
a JSON module whose only export is `default`, so this is the one exception to
javascript-practices: Imports besides `runtime`. Use Tailwind classes directly
only for one-off layout adjustments, and no inline `style` objects.

Correct:

```css
/* product-card.module.css */
.product-card {
  @apply border rounded-lg p-4 shadow-md flex flex-col gap-2;

  & .title {
    @apply text-xl font-bold mb-2;
  }
}
```

```tsx
// product-card.tsx
import styles from "./product-card.module.css";

export function ProductCard(props: ProductCardProps) {
  return (
    <div className={styles["product-card"]}>
      <h3 className={styles.title}>{props.product.name}</h3>
    </div>
  );
}
```

Incorrect:

```tsx
<div className="border rounded-lg p-4 shadow-md flex flex-col gap-2">
  <h3 style={{ fontSize: "20px" }}>{props.product.name}</h3>
</div>
```

**Why:** semantic class names keep markup readable and put a component's styles
in one file.

---

## Navigation With Link and useRouter

Scope: Links and programmatic navigation

Rule: Link to internal pages with `Link` from `@eserstack/laroux-react` and a
relative `href`. It renders a real `<a href>` and navigates client-side, but
leaves URLs with a scheme (`http(s)` on the same origin included, `mailto:`,
`tel:`) or a leading `//`, hash links, modifier-key and non-primary-button
clicks, clicks an `onClick` handler already prevented, and links with `download`
or a `target` other than `_self` to the browser; `onClick` runs first. There is
no `prefetch` prop. It navigates on the client from server and client components
alike: laroux drops the functions a server component renders, so the anchor also
carries its options in `data-laroux-link` and `data-laroux-scroll` attributes,
which the laroux client bootstrap reads, and no client wrapper is needed.
`useRouter()` (`push`, `replace`, `back`, `forward`, `refresh`) is for
navigation that follows an action, such as a successful submit; `refresh`
reloads the whole page. `Link` and `push` or `replace` scroll to the top unless
`scroll` is `false` (`scroll={false}` on `Link`, `{ scroll: false }` for the
router).

Correct:

```tsx
import * as larouxReact from "@eserstack/laroux-react";

<larouxReact.Link href={`/stories/${props.slug}`}>
  {props.title}
</larouxReact.Link>;
```

---

## Images With the Image Component

Scope: Content images in laroux apps

Rule: Render content images with `Image` from `@eserstack/laroux-react`. `alt`
is required, empty for decorative images. Pass `width` and `height`; the
component does not infer them, and without them the layout shifts. Images load
lazily with async decoding by default; set `priority` on the above-the-fold hero
image to load it eagerly with `fetchpriority="high"`.
`formats={["avif", "webp"]}` renders a `<picture>` whose sources are the same
path with those extensions, so the files must exist. `ResponsiveImage` adds an
aspect-ratio box. `fallback` replaces an empty `src` right away, and a source
that fails to load in the browser; it travels as a data attribute that the
client bootstrap reads, so it also works when a server component renders the
`Image`.

Correct:

```tsx
<larouxReact.Image
  src="/images/hero.jpg"
  alt="Team at the 2025 offsite"
  width={1600}
  height={900}
  priority
/>
```

---

## Per-Request Data Under laroux

Scope: Data several server components need in one request

Rule: laroux passes the request a page renders for as the `request` prop of the
page and of its layout (`PageProps` and `LayoutProps` from `@eserstack/laroux`).
`request.cookies` is a `ReadonlyMap` of the decoded cookie values;
`request.host` and `request.locale` (the page URL's `locale` parameter) are
`null` when the request has none. Read request data from that prop and pass what
deeper server components need down as props. A page or layout that is a client
component gets no `request`; pass a client component only the values it renders,
never `request` or a cookie, since its props reach the browser, HttpOnly cookies
included. laroux renders server components with its own RSC renderer, which does
not provide React's request cache, so `React.cache` calls the function every
time: fetch shared data once in the closest common server component and pass the
result, or its promise for async children to await, down as props. Request data
never goes into module scope: concurrent requests share it
(data-fetching-and-server.md: No Request State in Module Scope).

Correct:

```tsx
// src/app/routes/account/page.tsx
import type * as laroux from "@eserstack/laroux";

export async function AccountPage(props: laroux.PageProps) {
  const sessionId = props.request.cookies.get("session_id");
  if (sessionId === undefined) {
    return <SignInPrompt />;
  }

  const account = await getAccount(sessionId);
  return <AccountMenu name={account.name} />;
}
```

Incorrect:

```tsx
// AccountMenu is a client component: the cookies reach the browser
<AccountMenu request={props.request} />
```
