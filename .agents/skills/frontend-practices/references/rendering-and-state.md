# Rendering and State

How components hold state, run effects and re-render: memoization, derived
values, effect dependencies, transitions, hydration and browser storage.

## Contents

- Memoize Only With a Profile
- Derive State During Render
- Interactions Run in Event Handlers
- Narrow Effect Dependencies
- Functional State Updates
- Lazy State Initialization
- Effect Events for Latest Values
- Refs for Transient Values
- Transitions and Deferred Values
- Explicit Conditional Rendering
- Never Mutate Props or State
- Keep Hidden UI Alive With Activity
- Initialize the App Once
- Hydration-Safe Client Values
- Browser Storage Is Versioned and Guarded

---

## Memoize Only With a Profile

Scope: `useMemo`, `useCallback`, `memo` and hoisted JSX

Rule: Write plain components and add `useMemo`, `useCallback` or `memo` only
when a profile (the React DevTools Profiler) shows a slow render, with a comment
that names the measurement. Keep every component compiler-ready anyway: render
is pure, props and state are never mutated, hooks follow the rules of hooks.
laroux-bundler does not run the React Compiler, so nothing is memoized
automatically in a laroux app; the other rules in this file are what keep
renders cheap. When a profile justifies memoization:

- Move the expensive part into its own `memo` component, so an early return
  (`if (props.isLoading)`) in the parent skips it.
- Give a `memo` component's non-primitive defaults a module constant
  (`const NO_ITEMS: readonly Item[] = [];`); a fresh `[]` or `() => {}` default
  fails the comparison on every render.
- Split a `useMemo` doing unrelated work into one per dependency set, so a sort
  order change does not refilter.
- Hoist large static JSX (an inline SVG) to a module constant.
- Never wrap a cheap expression with a primitive result in `useMemo`; the hook
  costs more than the expression.

Correct:

```tsx
export function SortedList(props: { items: readonly Item[] }) {
  const sorted = props.items.toSorted((a, b) => a.name.localeCompare(b.name));
  return <ul>{sorted.map((item) => <li key={item.id}>{item.name}</li>)}</ul>;
}
```

Incorrect:

```tsx
const sorted = React.useMemo(() => props.items.toSorted(byName), [props.items]); // no profile
```

**Why:** manual memoization adds dependency arrays that go stale and costs work
on every render; without a measurement nobody knows whether it pays.

---

## Derive State During Render

Scope: Values computable from props or other state

Rule: Compute such a value in render. Do not store it in state and sync it with
an effect. To reset a component's state when an identity changes, give it a
`key` instead of an effect that watches the prop.

Correct:

```tsx
const fullName = `${props.firstName} ${props.lastName}`;

<ProfileEditor key={props.userId} userId={props.userId} />;
```

Incorrect:

```tsx
const [fullName, setFullName] = React.useState("");
React.useEffect(() => {
  setFullName(`${props.firstName} ${props.lastName}`);
}, [props.firstName, props.lastName]);
```

**Why:** the effect renders twice and shows a stale value in between; a derived
value cannot drift from its source.

---

## Interactions Run in Event Handlers

Scope: Work caused by a user action (submit, click, drag)

Rule: Run it in that action's handler. Do not set a flag and react to it in an
effect. Effects synchronize with external systems: a subscription, a socket, the
document title.

Correct:

```tsx
async function handleSubmit() {
  await register(props.form);
  showToast("Registered", theme);
}
```

Incorrect:

```tsx
React.useEffect(() => {
  if (submitted) {
    register(props.form);
    showToast("Registered", theme);
  }
}, [submitted, theme]); // runs again when the theme changes
```

**Why:** the effect reruns on unrelated dependency changes and can repeat the
action.

---

## Narrow Effect Dependencies

Scope: `useEffect` and subscriptions

Rule: Depend on the primitive an effect uses (`props.user.id`, not
`props.user`). Compute a derived boolean before the effect so it reruns on a
transition, not on every value. Subscribe to the coarsest signal the render
needs: a `matchMedia("(max-width: 767px)")` match instead of the window width. A
value read only inside a callback is read there
(`new URLSearchParams(
location.search)` in the click handler), not subscribed
to during render. Give unrelated effects separate `useEffect` calls.

Correct:

```tsx
const isMobile = props.width < 768;
React.useEffect(() => {
  if (isMobile) {
    enableMobileMode();
  }
}, [isMobile]);
```

Incorrect:

```tsx
React.useEffect(() => {
  if (props.width < 768) {
    enableMobileMode();
  }
}, [props.width]); // reruns at 767, 766, 765...
```

---

## Functional State Updates

Scope: State updates that depend on the current state

Rule: Pass an updater: `setItems((current) => [...current, ...added])`. A value
from arguments or a constant (`setCount(0)`) needs none.

Correct:

```tsx
const removeItem = (id: string) =>
  setItems((current) => current.filter((item) => item.id !== id));
```

Incorrect:

```tsx
const removeItem = React.useCallback((id: string) => {
  setItems(items.filter((item) => item.id !== id)); // `items` from the first render
}, []);
```

**Why:** the updater always sees the latest state, so a callback stays correct
without listing the state as a dependency.

---

## Lazy State Initialization

Scope: `useState` with a costly initial value

Rule: Pass a function when the initial value parses storage, builds an index or
reads the DOM: `React.useState(() => buildSearchIndex(props.items))`. A literal
or a prop needs none. Without the function, the value is computed on every
render and thrown away after the first.

---

## Effect Events for Latest Values

Scope: Effects that call a callback whose identity changes every render

Rule: Wrap the callback in `React.useEffectEvent` and call it inside the effect,
so the effect sees the latest callback without resubscribing. Keep only reactive
values in the dependency array, never the effect event itself. This replaces
storing a handler in a ref.

Correct:

```tsx
export function SearchInput(props: { onSearch: (query: string) => void }) {
  const [query, setQuery] = React.useState("");
  const onSearch = React.useEffectEvent(props.onSearch);

  React.useEffect(() => {
    const timeout = setTimeout(() => onSearch(query), 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
}
```

Incorrect:

```tsx
React.useEffect(() => {
  const timeout = setTimeout(() => props.onSearch(query), 300);
  return () => clearTimeout(timeout);
}, [query, props.onSearch]); // restarts the debounce whenever the parent renders
```

---

## Refs for Transient Values

Scope: Values that change often without changing the output

Rule: Pointer positions, timer ids and "already sent" flags live in `useRef`;
updating a ref does not render. When the DOM must follow such a value, write to
the element through a ref (`node.style.transform`) instead of rendering each
change.

---

## Transitions and Deferred Values

Scope: Updates that are frequent or expensive but not urgent

Rule: Keep input responsive by marking the rest as non-urgent:

- `React.startTransition(() => setScrollY(window.scrollY))` for frequent updates
  from scroll or resize.
- `React.useTransition` for async work; its `isPending` replaces a hand-made
  `isLoading` flag and resets even when the work throws. State set after an
  `await` inside the transition needs its own `startTransition`.
- `React.useDeferredValue(query)` to render an expensive result from a lagging
  copy of the input; it helps only when the expensive computation is memoized on
  the deferred value, so it follows a profile like any memoization.

Correct:

```tsx
const [isPending, startTransition] = React.useTransition();

function handleSearch(value: string) {
  setQuery(value);
  startTransition(async () => {
    const data = await fetchResults(value);
    startTransition(() => setResults(data));
  });
}
```

---

## Explicit Conditional Rendering

Scope: Conditional JSX

Rule: Use an explicit condition and a ternary that returns `null`:
`{props.count > 0 ? <Badge count={props.count} /> : null}`. `{count && …}`
renders `0` when the count is zero, and `{text && …}` hides an intentional empty
string. This is javascript-practices: Explicit Checks applied to JSX.

---

## Never Mutate Props or State

Scope: Arrays and objects from props or state

Rule: Produce a new value with `toSorted`, `toReversed`, `toSpliced`, `with` or
spread. `props.items.sort()` reorders the parent's array in place
(design-principles: Immutability).

---

## Keep Hidden UI Alive With Activity

Scope: Expensive UI that toggles often (menus, tabs, side panels)

Rule: Wrap it in `<React.Activity mode={isOpen ? "visible" : "hidden"}>` instead
of unmounting it. Hidden content keeps its state and DOM, and its effects pause
until it is visible again.

---

## Initialize the App Once

Scope: App-wide setup (restoring a session, registering a service worker)

Rule: Run it once per page load, not in a component's `useEffect(() => …, [])`:
components remount, and React runs effects twice in development. Call it from
the client entry, or guard it with a lazily set promise (design-principles:
Module-Level Side Effects).

Correct:

```ts
let initPromise: Promise<void> | null = null;

export function initApp(): Promise<void> {
  if (initPromise === null) {
    initPromise = restoreSession();
  }
  return initPromise;
}
```

---

## Hydration-Safe Client Values

Scope: Server-rendered components that hydrate on the client

Rule: The server HTML and the first client render must match.

- Values only the browser knows (a stored theme, the local time zone, viewport
  size) are not in the first render. A value that must show without a flash (the
  stored theme) is set before hydration by a small inline script that is static
  text with no user data, catches its own errors, and is allowed by the page's
  CSP with a hash or nonce (security-practices: Security Headers).
- Ids come from `React.useId`, never from `Math.random()`.
- `suppressHydrationWarning` goes only on an element whose text differs by
  design (a rendered timestamp), never over a real mismatch.
- An input with `value` has `onChange`; otherwise it uses `defaultValue`.

**Why:** a mismatch makes React discard and re-render the server HTML, which
flashes wrong content and costs the time SSR saved.

---

## Browser Storage Is Versioned and Guarded

Scope: `localStorage`, `sessionStorage` and cookies read by client code

Rule:

- Version every key (`"user-config:v2"`) and store only the fields the UI reads.
  Never store tokens, secrets or personal data there.
- Wrap every read, write and `JSON.parse` in `try`/`catch`: storage throws in
  private mode, when full or when disabled. Validate what you read like any
  other input.
- Reads are synchronous and slow. Read once into memory, and drop the copy on
  the `storage` event when another tab writes.

Correct:

```ts
const CONFIG_KEY = "user-config:v2";

export function loadConfig(): UserConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw === null ? null : parseUserConfig(JSON.parse(raw));
  } catch {
    return null; // storage unavailable or old data: fall back to defaults
  }
}
```

**Why:** a stored shape outlives the code that wrote it, and an unguarded read
breaks the whole page in a private window.
