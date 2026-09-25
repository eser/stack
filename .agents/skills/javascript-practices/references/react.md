# React and UI

Components for apps built on laroux (`@eserstack/laroux-react`,
`laroux-bundler`) and UI surfaces such as `noskills-web`. File names are
kebab-case like every other file (`user-profile.tsx`); the `validate-filenames`
check in `.eser/manifest.yml` enforces it.

## Contents

- CSS Modules with @apply
- Interaction States
- Accessibility Baseline
- Use Existing Design Tokens
- Single Props Object Pattern
- Named Exports for Components
- React Compiler Compatibility

---

## CSS Modules with @apply

Scope: Styling React components in laroux apps

Rule: Style a component with a co-located `*.module.css` file that uses semantic
class names and Tailwind `@apply`; `laroux-bundler` expands `@apply` when it
processes CSS modules. Use Tailwind classes directly only for one-off layout
adjustments, and no inline `style` objects.

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
</div>;
```

**Why:** semantic class names keep markup readable and put a component's styles
in one file.

---

## Interaction States

Scope: Every UI surface: laroux-rendered pages, the noskills-web dashboard, and
terminal UIs

Rule: Every view that loads, lists or submits data implements five states:
loading, empty, error, success and partial (some items failed or are still
arriving). A missing state is a bug, not a TODO. The empty state says what is
missing and gives the next action (a button, a link or the exact command to
run). The error state says what failed and how to retry; it never shows a raw
exception. Check each view with a very long name, zero results and a network
failure in the middle of an action. Placeholder copy ("Lorem ipsum", "TBD", "No
data") does not ship.

Correct:

```tsx
if (props.specs.length === 0) {
  return (
    <p>
      No specs yet. Run <code>noskills spec new</code> to create one.
    </p>
  );
}
```

Incorrect:

```tsx
if (items.length === 0) return <p>No data</p>;
```

---

## Accessibility Baseline

Scope: Web UI (laroux-rendered pages, noskills-web)

Rule: Every action can be done with the keyboard alone, and focus is visible on
every interactive element. A modal traps focus while open and returns focus to
the element that opened it when it closes. Interactive elements have an
accessible name (visible label, `aria-label` or `aria-labelledby`). Text
contrast meets WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text and UI
component boundaries. Touch targets are at least 44x44 CSS px, and layouts work
at phone width without horizontal scroll.

Correct:

```tsx
<button type="button" aria-label="Close panel" onClick={props.onClose}>
  ×
</button>;
```

Incorrect:

```tsx
<div onClick={props.onClose}>×</div>;
```

---

## Use Existing Design Tokens

Scope: Web UI styles

Rule: Colors, spacing and typography come from the surface's existing tokens. In
noskills-web these are the custom properties in `static/style.css` (`--bg`,
`--bg-surface`, `--text`, ...). Do not write a literal color or size where a
token exists. Add a new token only when no existing one fits, and define it next
to the others.

Correct:

```css
.card {
  background: var(--bg-surface);
  color: var(--text);
}
```

Incorrect:

```css
.card {
  background: #161b22;
  color: #e6edf3;
}
```

---

## Single Props Object Pattern

Scope: React components

Rule: Take one `props` parameter and read `props.name`; do not destructure in
the signature.

Correct:

```tsx
type UserProfileProps = {
  userId: string;
  showActions: boolean;
};

export function UserProfile(props: UserProfileProps) {
  return (
    <div>
      <h1>User: {props.userId}</h1>
      {props.showActions ? <button type="button">Edit</button> : null}
    </div>
  );
}
```

Incorrect:

```tsx
export function UserProfile({ userId, showActions }: UserProfileProps) {
  return <h1>User: {userId}</h1>;
}
```

**Why:** `props.` marks which values come from the parent, and adding a prop
does not touch the signature.

---

## Named Exports for Components

Scope: React components

Rule: Components are named exports. Use a default export only in a file whose
framework contract requires one: laroux loads route, config and middleware
modules through their `default` export.

Correct:

```tsx
// user-profile.tsx
export function UserProfile(props: UserProfileProps) {
  return <div>{props.name}</div>;
}
```

Incorrect:

```tsx
function UserProfile(props: UserProfileProps) {
  return <div>{props.name}</div>;
}
export default UserProfile;
```

---

## React Compiler Compatibility

Scope: React 19 components

Rule: Write plain idiomatic components and let the React compiler memoize. Add
`useMemo` or `useCallback` only when a profile shows the benefit, with a comment
that says so.

Correct:

```tsx
export function SortedList(props: { items: readonly Item[] }) {
  const sorted = props.items.toSorted((a, b) => a.name.localeCompare(b.name));
  return <ul>{sorted.map((item) => <li key={item.id}>{item.name}</li>)}</ul>;
}
```

Incorrect:

```tsx
const sorted = useMemo(() => props.items.toSorted(byName), [props.items]); // no profile
```

**Why:** manual memoization adds dependency arrays that go stale, and the
compiler already does it.
