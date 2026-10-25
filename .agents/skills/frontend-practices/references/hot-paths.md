# Profiled Hot Paths

Optimizations for code a profile shows is hot: render loops over large lists,
handlers that fire every frame, DOM work and main-thread scheduling. Outside a
profiled hot path, write the plain version (coding-practices: Performance Claims
Need Measurement); fix the data structure before the constants
(design-principles: Choose Data Structures by Access Pattern).

## Contents

- Index Before Looping
- One Pass Over a Collection
- Hoist Invariant Work
- Batch DOM Reads and Writes
- Long Lists
- Event Listeners
- Defer Non-Critical Main-Thread Work

---

## Index Before Looping

Scope: Lookups inside a loop or a list render

Rule: Build the `Map` or `Set` once, before the loop or the `.map()` over rows,
then look up inside it. A `.find()` or `.includes()` per row turns a list render
quadratic.

Correct:

```ts
const userById = new Map(users.map((user) => [user.id, user]));
const rows = orders.map((order) => ({
  ...order,
  user: userById.get(order.userId) ?? null,
}));
```

Incorrect:

```ts
const rows = orders.map((order) => ({
  ...order,
  user: users.find((user) => user.id === order.userId), // O(n) per row
}));
```

---

## One Pass Over a Collection

Scope: Arrays processed on a hot path

Rule: Walk the data once:

- Several `.filter()` calls over the same array become one loop that pushes into
  several results.
- `.map()` followed by `.filter()` becomes one `.flatMap()` that returns `[]`
  for skipped items.
- The minimum or maximum is one loop, not a sort; `Math.min(...values)` throws
  on very large arrays.
- Return as soon as the answer is known.
- Compare lengths before an expensive comparison of two arrays.

Correct:

```ts
const activeNames = users.flatMap((user) => (user.isActive ? [user.name] : []));

function latest(projects: readonly Project[]): Project | null {
  let result: Project | null = null;
  for (const project of projects) {
    if (result === null || project.updatedAt > result.updatedAt) {
      result = project;
    }
  }
  return result;
}
```

Incorrect:

```ts
const activeNames = users
  .map((user) => (user.isActive ? user.name : null))
  .filter(Boolean); // two passes and a truthiness check
const latest = projects.toSorted((a, b) => b.updatedAt - a.updatedAt)[0];
```

---

## Hoist Invariant Work

Scope: Loop bodies and render functions on a hot path

Rule: Compute once what does not change per iteration or per render: a deep
property read, a `RegExp`, a formatter (`Intl.NumberFormat`). Literal regular
expressions go to module scope; one built from props is memoized on its input. A
module-level regex with the `g` or `y` flag keeps `lastIndex` between calls, so
do not share one across `test` or `exec` calls. Results of a pure function
called repeatedly with the same input (`slugify(name)`) go into a module-level
cache with a size bound (coding-practices: Bound Every Resource).

Correct:

```ts
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRICE_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
```

Incorrect:

```tsx
function PriceCell(props: { value: number }) {
  const format = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }); // per cell, per render
  return <td>{format.format(props.value)}</td>;
}
```

---

## Batch DOM Reads and Writes

Scope: Code that measures or styles DOM elements

Rule: Never read layout (`getBoundingClientRect`, `offsetWidth`, `offsetHeight`,
`scrollTop`, `getComputedStyle`) during render. In effects and handlers, do all
reads first and all writes after: a read after a write forces a synchronous
layout, once per pair. Prefer toggling a class over writing several inline
styles.

Correct:

```ts
const rect = element.getBoundingClientRect();
const height = element.offsetHeight;
element.classList.add("expanded");
```

Incorrect:

```ts
element.style.width = "100px";
const width = element.offsetWidth; // forces layout
element.style.height = "200px";
const height = element.offsetHeight; // forces layout again
```

---

## Long Lists

Scope: Lists of more than about 50 items

Rule: Virtualize a list that renders more than about 50 rows, so only visible
rows exist in the DOM. When virtualizing is not possible, let the browser skip
off-screen rows with `content-visibility: auto` and a `contain-intrinsic-size`
close to the row height. A virtualization library is a dependency like any other
(tooling-standards: Adding a Dependency).

Correct:

```css
.message-row {
  content-visibility: auto;
  contain-intrinsic-size: 0 80px;
}
```

---

## Event Listeners

Scope: `scroll`, `wheel`, `touch*`, `resize` and other window or document
listeners

Rule:

- Register `touchstart`, `touchmove` and `wheel` listeners with
  `{ passive: true }` unless the handler calls `preventDefault()`; a non-passive
  listener makes the browser wait for it before scrolling.
- When many component instances need the same global event, keep one listener
  and a set of subscribers in a shared module. The listener is attached when the
  first subscriber arrives and removed with the last one, never at import time
  (design-principles: Module-Level Side Effects).
- Every listener an effect adds is removed in the effect's cleanup.

Correct:

```ts
const subscribers = new Set<(event: KeyboardEvent) => void>();

function onKeyDown(event: KeyboardEvent): void {
  for (const subscriber of subscribers) {
    subscriber(event);
  }
}

export function subscribeKeyDown(
  handler: (event: KeyboardEvent) => void,
): () => void {
  if (subscribers.size === 0) {
    globalThis.addEventListener("keydown", onKeyDown);
  }
  subscribers.add(handler);
  return () => {
    subscribers.delete(handler);
    if (subscribers.size === 0) {
      globalThis.removeEventListener("keydown", onKeyDown);
    }
  };
}
```

---

## Defer Non-Critical Main-Thread Work

Scope: Work after an interaction that the user is not waiting for

Rule: Schedule analytics, saving to storage, prefetching and other non-urgent
work with `requestIdleCallback`, with a `timeout` when it must run eventually,
and fall back to `setTimeout` where the API is missing. Split a long job into
chunks that stop when `deadline.timeRemaining()` reaches zero. Work whose result
the user is waiting for (the response to a click, a render) is never deferred.

Correct:

```ts
const scheduleIdle =
  globalThis.requestIdleCallback ??
  ((callback: () => void, _options?: IdleRequestOptions) =>
    setTimeout(callback, 1));

function handleSearch(query: string): void {
  setResults(searchItems(query));
  scheduleIdle(() => analytics.track("search", { query }), { timeout: 2000 });
}
```
