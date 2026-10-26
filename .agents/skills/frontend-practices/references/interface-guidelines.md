# Interface Guidelines

What every web interface in this codebase does for its users: interaction
states, accessibility, tokens, forms, motion, copy, content, media, navigation,
touch and locale, with a list of flags for UI reviews.

Adapted from vercel-labs/web-interface-guidelines (e3d624b).

## Contents

- Interaction States
- Accessibility Baseline
- Use Existing Design Tokens
- Forms
- Motion
- Typography and Copy
- Content Overflow
- Images and Media
- URL State and Navigation
- Touch and Layout
- Locale and Formatting
- Review Flags

---

## Interaction States

Scope: Every UI surface: laroux-rendered pages, dashboards and terminal UIs

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
if (props.projects.length === 0) {
  return (
    <p>
      No projects yet. Run <code>eser kit new</code> to create one.
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

Scope: Web UI (laroux-rendered pages and other browser UIs)

Rule: Every action can be done with the keyboard alone, and focus is visible on
every interactive element. Text contrast meets WCAG 2.1 AA: 4.5:1 for normal
text, 3:1 for large text and UI component boundaries. Touch targets are at least
44x44 CSS px, and layouts work at phone width without horizontal scroll. In
detail:

- Semantic HTML before ARIA: `<button>` for actions, `<a>` for navigation,
  `<label>`, `<table>`; never a `<div>` or `<span>` with a click handler. A
  custom widget that cannot be a native element gets a role and keyboard
  handlers.
- Every interactive element has an accessible name (visible label, `aria-label`
  or `aria-labelledby`); icon-only buttons need `aria-label`. Decorative icons
  get `aria-hidden="true"`.
- Images have `alt`, empty (`alt=""`) when decorative. Meaningful media has
  captions, a transcript or a description, and keyboard-operable controls.
- Headings go in order (`<h1>` to `<h6>`), the page has a skip link to the main
  content, and heading anchors set `scroll-margin-top`.
- Async updates (toasts, inline validation) are announced through an
  `aria-live="polite"` region.
- Focus rings use `:focus-visible` (or `focus-visible:ring-*`), never a bare
  `outline: none`; compound controls use `:focus-within`. Sticky headers,
  footers and overlays never cover the focused element.
- A modal traps focus while open and returns it to the element that opened it
  when it closes.

Correct:

```tsx
<button type="button" aria-label="Close panel" onClick={props.onClose}>
  ×
</button>
```

Incorrect:

```tsx
<div onClick={props.onClose}>×</div>
```

---

## Use Existing Design Tokens

Scope: Web UI styles and theming

Rule: Colors, spacing and typography come from the surface's existing tokens,
usually CSS custom properties (`--bg`, `--bg-surface`, `--text`, ...). Do not
write a literal color or size where a token exists. Add a new token only when no
existing one fits, and define it next to the others. A dark theme also sets
`color-scheme: dark` on `<html>` (scrollbars and form controls follow it), a
`<meta name="theme-color">` that matches the page background, and explicit
`background-color` and `color` on native `<select>` elements.

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

## Forms

Scope: Inputs, form submission and validation

Rule:

- Every control has a clickable label (`htmlFor` or a wrapping `<label>`); a
  checkbox or radio and its label share one hit target with no dead zone.
- Inputs have a meaningful `name`, the right `autocomplete` (`"off"` on fields
  that are not credentials, so password managers stay out), and the right `type`
  and `inputMode` (`email`, `tel`, `url`, `numeric`).
- Never block paste. Turn spellcheck off (`spellCheck={false}`) for emails,
  codes and usernames.
- The submit button stays enabled until the request starts and shows progress
  while it runs.
- Errors appear inline next to their fields, and submit moves focus to the first
  one.
- Placeholders show an example of the expected pattern and end with `…`.
- Leaving a page with unsaved changes asks first (`beforeunload` or a router
  guard).
- Prefer uncontrolled inputs; a controlled input does only cheap work per
  keystroke.

---

## Motion

Scope: Animations and transitions

Rule:

- Honor `prefers-reduced-motion`: provide a reduced variant or none, and stop
  decorative loops.
- Animate `transform` and `opacity` only, and list the properties; never
  `transition: all`.
- Animate a wrapper (a `<div>`, or a `<g>` with `transform-box: fill-box` and
  `transform-origin: center`), not the `<svg>` element: many browsers do not
  accelerate transforms on SVG elements. Set `transform-origin` deliberately.
- Animations can be interrupted by user input.
- Motion that plays automatically for more than five seconds next to other
  content has a pause, stop or hide control.

---

## Typography and Copy

Scope: Text in the interface: labels, buttons, messages, numbers

Rule:

- Use `…` instead of `...`, and curly quotes (`“ ”`, `‘ ’`) instead of straight
  ones. Loading states end with `…` ("Loading…", "Saving…").
- Use non-breaking spaces where a break would split a unit: `10&nbsp;MB`,
  `⌘&nbsp;K`, brand names.
- Number columns use `font-variant-numeric: tabular-nums`; headings use
  `text-wrap: balance` (or `pretty`) to avoid a lone last word.
- Write in active voice and second person: "Install the CLI", not "The CLI will
  be installed".
- Headings and buttons use title case. Counts use numerals ("8 deployments").
- Button labels name the action ("Save API Key", not "Continue"). Error messages
  include the fix or the next step, not only the problem.
- Use `&` instead of "and" only where space is tight.

General prose rules are in documentation-conventions: Plain Prose.

---

## Content Overflow

Scope: Containers that show user or remote content

Rule: Design for short, average and very long content. Text containers truncate
(`truncate`, `line-clamp-*`) or wrap (`break-words`); flex children that
truncate need `min-w-0`. Empty strings and empty arrays render an empty state
(Interaction States), never a broken layout.

---

## Images and Media

Scope: `<img>`, video and animated media

Rule:

- Every `<img>` has explicit `width` and `height`, so the browser reserves its
  space before it loads.
- Images below the fold use `loading="lazy"`; the above-the-fold hero image uses
  `fetchpriority="high"`. On laroux, the `Image` component does both (laroux.md:
  Images With the Image Component).
- Use `<video autoplay muted loop playsinline>` instead of an animated GIF, with
  a still image as the reduced-motion and fallback version.

---

## URL State and Navigation

Scope: Stateful UI and links

Rule:

- The URL holds the state a user would share or return to: filters, tabs,
  pagination, expanded panels go into query parameters.
- Links are `<a>` elements (or a component that renders one), so Cmd/Ctrl-click
  and middle-click open new tabs. No navigation from `onClick` on other
  elements.
- A destructive action asks for confirmation or offers an undo window; it never
  happens on a single click.

---

## Touch and Layout

Scope: Pointer, touch and layout behavior

Rule:

- Set `touch-action: manipulation` to remove the double-tap zoom delay, and set
  `-webkit-tap-highlight-color` deliberately.
- Modals, drawers and sheets use `overscroll-behavior: contain`.
- While dragging, disable text selection and mark the dragged element `inert`.
  Drag, swipe and pinch gestures have a click and keyboard alternative.
- `autoFocus` only on the single primary input of a desktop view, never on
  mobile.
- Buttons and links have a hover state, and hover, active and focus states have
  more contrast than the resting state.
- Full-bleed layouts respect `env(safe-area-inset-*)`. Fix the overflow that
  causes an unwanted scrollbar instead of hiding it.
- Lay out with flex and grid, not with measurements taken in JavaScript.

---

## Locale and Formatting

Scope: Dates, numbers, currency and language

Rule: Format dates and times with `Intl.DateTimeFormat` and numbers and currency
with `Intl.NumberFormat`, never by hand. Detect the language from
`Accept-Language` or `navigator.languages`, not from the IP address. Wrap brand
names, code tokens and identifiers in `translate="no"` so page translation does
not garble them.

---

## Review Flags

Scope: Reviewing UI code

Rule: Flag each of these with its `file:line`:

- `user-scalable=no` or `maximum-scale=1`, which disable zoom
- `onPaste` with `preventDefault`
- `transition: all`
- `outline: none` (or `outline-none`) without a `:focus-visible` replacement
- a `<div>` or `<span>` with a click handler, or navigation in an `onClick`
  without an `<a>`
- images without `width` and `height`
- form controls without a label, icon buttons without `aria-label`
- `.map()` over a large list without virtualization (hot-paths.md: Long Lists)
- hand-written date or number formats
- `autoFocus` without a reason
- an animated GIF where a video would do
- a gesture-only action without a click and keyboard alternative
