---
name: frontend-practices
description: "React and web UI conventions of this codebase, laroux included: components and composition, state and effects, server components and actions, bundling, accessibility and interface rules. Use when building or reviewing .tsx components (with javascript-practices), pages, forms or styles, accessibility, bundle size or rendering speed. Not for .ts files without UI (use javascript-practices)."
---

# Frontend Practices

How this codebase builds React 19 user interfaces: on laroux when it uses
laroux, and the same way in any other React or browser UI. TypeScript syntax,
imports and tests are in javascript-practices; HTTP hardening is in
security-practices.

## Always

- Components take one `props` object, are declared at module level and are named
  exports; a default export only where laroux loads `default` (`proxy.ts`,
  `laroux.config.ts`)
- Compose explicit variants and compound components instead of adding boolean
  mode props; accept `children` rather than `renderX` props
- Derive values during render; effects only synchronize with external systems,
  and user actions run in their event handlers
- No `useMemo`, `useCallback` or `memo` without a profile; laroux-bundler does
  not run the React Compiler, so structure is what keeps renders cheap
- Every view that loads, lists or submits data has loading, empty, error,
  success and partial states
- Keyboard access, visible focus, accessible names and WCAG 2.1 AA contrast on
  every surface; semantic elements before ARIA
- Colors, spacing and type come from existing design tokens
- Start independent async work before awaiting it; put slow parts behind
  `Suspense`
- Server actions and `route.ts` handlers are public endpoints: validate and
  authorize inside each one
- Only the fields a client component renders cross the server/client boundary,
  as plain JSON data
- Render conditionally with explicit conditions (`count > 0 ? … : null`), never
  `&&` on a number or string
- The micro-optimizations in hot-paths.md apply only to a profiled hot path

## References

| File                                                                      | Read when                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [components-and-composition.md](references/components-and-composition.md) | Writing a component, designing its props or a component family |
| [rendering-and-state.md](references/rendering-and-state.md)               | State, effects, memoization, hydration, browser storage        |
| [data-fetching-and-server.md](references/data-fetching-and-server.md)     | Fetching data, server components, server actions, caching      |
| [bundling-and-loading.md](references/bundling-and-loading.md)             | Bundle size, lazy loading, preloading, scripts and assets      |
| [interface-guidelines.md](references/interface-guidelines.md)             | Building or reviewing UI: states, accessibility, forms, copy   |
| [laroux.md](references/laroux.md)                                         | Routes, "use client", server actions, CSS modules on laroux    |
| [hot-paths.md](references/hot-paths.md)                                   | Optimizing loops, DOM work or listeners a profile flagged      |
