# SSR React Key Handling Strategy

## Status

Accepted

## Context and Problem Statement

During Server-Side Rendering (SSR) in `@eserstack/laroux-react-adapter`, React
generates "Each child in a list should have a unique key prop" warnings for
elements like `<aside>`, `<div>`, `<svg>`, etc. These warnings appear in the
server terminal during `renderToReadableStream` execution.

The root cause: when our `preprocessTree` function in `ssr-renderer.ts`
traverses the React tree, it:

1. Executes server components, which may return Fragments or arrays
2. Creates NEW React elements using `createElement()` for the processed tree
3. Passes these elements to `react-dom/server`'s `renderToReadableStream`

When server components return Fragments or arrays, preprocessing substitutes
those in place, **introducing array children where there weren't any before**.
For example:

```jsx
// Before preprocessing: <main> has ONE child (ServerComponent)
<main><ServerComponent /></main>

// After preprocessing: <main> has ARRAY children (from Fragment expansion)
<main>{[<div>A</div>, <div>B</div>]}</main>
```

Additionally, `createElement(type, { children: [...] })` treats children as a
**dynamic array** requiring keys, whereas Babel's JSX transform passes children
as rest arguments `createElement(type, props, child1, child2)` which React
handles differently.

## Decision Drivers

- **Zero warnings**: Must eliminate all React key warnings in SSR output
- **Performance**: Minimal overhead for the common case (arrays with existing
  keys)
- **Maintainability**: Solution should be understandable and localized
- **Correctness**: RSC payload and HTML element tree must remain consistent
- **Migration path**: Solution should not preclude future architectural
  improvements

## Considered Options

- **Option 1**: Targeted key injection with `ensureArrayKeys()` using
  `cloneElement`
- **Option 2**: Flight-based SSR (serialize via Flight Server, deserialize via
  Flight Client)
- **Option 3**: Use `React.Children.toArray()` at array boundaries
- **Option 4**: Pass children as rest arguments to `createElement`

## Decision Outcome

Chosen option: **Option 1 - Targeted key injection with `ensureArrayKeys()`**,
because it provides immediate resolution with minimal code changes, acceptable
performance characteristics, and does not preclude future migration to
Flight-based SSR.

### Consequences

#### Good

- Eliminates all React key warnings (reduced from 84 to 0)
- Minimal code footprint - single helper function
- Fast-path optimization avoids allocation when all elements have keys
- Uses existing `isReactElement` from protocol.ts for consistency
- No architectural changes required

#### Bad

- Addresses symptom rather than root cause
- Requires `cloneElement` calls for keyless elements (minor performance cost)
- Knowledge of why this is needed may be lost without documentation

#### Neutral

- Does not change the overall SSR architecture
- Compatible with future Flight-based refactoring

## Pros and Cons of the Options

### Option 1: Targeted Key Injection with `ensureArrayKeys()`

Implementation in `ssr-renderer.ts`:

```typescript
function ensureArrayKeys(arr: any[]): any[] {
  // Fast-path: check if any valid React element lacks a key
  let needsProcessing = false;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (isReactElement(item)) {
      if (item.key === null || item.key === undefined || item.key === "") {
        needsProcessing = true;
        break; // Early termination
      }
    }
  }

  // Fast-path: no changes needed, return original array (zero allocation)
  if (!needsProcessing) {
    return arr;
  }

  // Slow-path: create new array with keys added where needed
  const result = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (isReactElement(item)) {
      if (item.key === null || item.key === undefined || item.key === "") {
        result[i] = cloneElement(item, { key: `.${i}` });
        continue;
      }
    }
    result[i] = item;
  }
  return result;
}
```

- Good, because it's a targeted fix with minimal code changes
- Good, because fast-path optimization avoids overhead for keyed arrays
- Good, because it works immediately without architectural changes
- Bad, because it treats the symptom rather than the root cause
- Bad, because `cloneElement` has minor performance overhead

### Option 2: Flight-Based SSR

Architecture diagram:

```
┌─────────────────────────────────────────────────────────────┐
│  React Tree                                                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Flight Server (server.ts)                                  │
│  renderToReadableStream → Flight Wire Protocol (JSON)       │
│  • Executes server components                               │
│  • Serializes tree with chunk IDs                           │
│  • Keys are preserved in serialization                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Flight Client (client.ts) - RUNNING ON SERVER FOR SSR      │
│  createFromReadableStream → React Elements                  │
│  • Reconstructs elements from JSON                          │
│  • Uses createElement(type, props, ...children) ← spread!   │
│  • Children.toArray() for stable keys                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  React DOM Server                                           │
│  renderToReadableStream → HTML                              │
│  • Elements already have proper keys                        │
│  • No warnings!                                             │
└─────────────────────────────────────────────────────────────┘
```

Implementation sketch:

```typescript
// ssr-renderer.ts (refactored approach)
export async function renderSSR(
  element: any,
  bundlerConfig: BundlerConfig,
  options: SSROptions,
): Promise<SSRResult> {
  // 1. Create Flight stream (executes server components, builds RSC payload)
  const flightStream = rscServer.renderToReadableStream(element, bundlerConfig);

  // 2. Collect ALL chunks (wait for stream to complete for await-all mode)
  const chunks: RSCChunk[] = [];
  const reader = flightStream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Parse chunks from buffer...
  }

  // 3. Deserialize via Flight Client with SSR module loader
  const ssrModuleLoader: ModuleLoader = (id: string, name: string) => {
    return function ClientComponentPlaceholder(props: any) {
      const serializableProps: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(props)) {
        if (key === "children" || typeof value === "function") continue;
        serializableProps[key] = value;
      }
      return createElement("div", {
        "data-client-component": id,
        "data-export-name": name,
        "data-props": JSON.stringify(serializableProps),
        style: { display: "contents" },
      }, props.children);
    };
  };

  const RootComponent = await createFromPayload(chunks, ssrModuleLoader);

  // 4. Elements have proper keys - Flight client handles this
  const processedElement = RootComponent();

  // 5. Render to HTML
  const htmlStream = await renderToReadableStream(processedElement);
  // ... collect HTML string
}
```

#### Detailed Analysis

**Serialize → Deserialize Round Trip:**

| Aspect   | Assessment                                                        |
| -------- | ----------------------------------------------------------------- |
| Cost     | JSON.stringify → JSON.parse for each chunk                        |
| Overhead | Likely <10ms for typical pages                                    |
| Risk     | LOW - JSON operations highly optimized in V8/Deno                 |
| Note     | RSC payload serialization already happens, so partial cost exists |

**Flight Client Adaptation for Server:**

| Aspect           | Assessment                                                     |
| ---------------- | -------------------------------------------------------------- |
| DOM Access       | Already guarded with `typeof document === "undefined"`         |
| Module Loading   | `createFromReadableStream` accepts custom `moduleLoader` param |
| Required Changes | None in client.ts - pass SSR-specific loader                   |
| Risk             | LOW - API already supports this use case                       |

**Async Handling Complexity:**

| Aspect      | Assessment                                                     |
| ----------- | -------------------------------------------------------------- |
| Challenge   | Flight client throws Promises for Suspense                     |
| SSR Context | Not inside React render cycle when calling RootComponent()     |
| Mitigation  | Collect all chunks first via `createFromPayload` (synchronous) |
| Risk        | MEDIUM - requires careful handling of stream completion        |

Current `preprocessTree` has explicit control over async behavior via
`streamMode`:

- `"await-all"`: Wait for everything, then render
- `"streaming-classic"`: Return placeholders, client fetches via `/rsc`

Flight-based approach would need similar handling.

- Good, because it's the architecturally correct approach (how Next.js does it)
- Good, because single source of truth for tree traversal
- Good, because RSC payload and HTML elements guaranteed consistent
- Good, because Flight client already handles keys correctly
- Bad, because requires significant refactoring effort
- Bad, because serialize → deserialize has minor overhead
- Bad, because async handling needs careful implementation
- Neutral, because module loader adaptation is straightforward

### Option 3: Use `React.Children.toArray()` at Array Boundaries

```typescript
import { Children } from "react";

// In preprocessTree, when processing arrays:
if (Array.isArray(element)) {
  const processedItems = await Promise.all(
    element.map((item) => preprocessTree(item, context)),
  );
  const rawElements = processedItems.map((r) => r.processedElement);
  return {
    processedElement: Children.toArray(rawElements),
    chunkId: id,
  };
}
```

- Good, because it's React's standard utility for handling children
- Good, because automatically assigns stable keys
- Bad, because **did not eliminate warnings in testing** (84 warnings persisted)
- Bad, because keys like `.$.0` still triggered React warnings
- Bad, because doesn't address the fundamental createElement issue

### Option 4: Pass Children as Rest Arguments

```typescript
// Instead of:
createElement(type, { ...props, children: processedChildren });

// Use:
if (Array.isArray(processedChildren)) {
  createElement(type, propsWithoutChildren, ...processedChildren);
} else {
  createElement(type, { ...props, children: processedChildren });
}
```

- Good, because mimics Babel's JSX transform behavior
- Good, because React may treat rest args differently than array in props
- Bad, because requires changes throughout preprocessTree
- Bad, because **testing showed this alone doesn't fix the issue**
- Neutral, because can be combined with other options

## Implementation Details

### Current Implementation (Option 1)

Location: `pkg/@eserstack/laroux-react-adapter/runtime/ssr-renderer.ts`

Key aspects:

1. **Fast-path optimization**: Scans array first; if all elements have keys,
   returns original array with zero allocation

2. **Early termination**: Stops checking once a keyless element is found

3. **Uses `isReactElement`** from `protocol.ts` for consistent element detection
   (handles both `react.element` and `react.transitional.element` symbols)

4. **Applied at all array boundaries**:
   - Array processing case in `preprocessTree`
   - Client placeholder children
   - Built-in element children
   - Suspense boundary content
   - Fragment/symbol type children
   - Async boundary fallback

### Future Migration Path (Option 2)

If Flight-based SSR is pursued in the future:

1. **No changes needed to `server.ts`** - already implements Flight Server
   protocol

2. **No changes needed to `client.ts`** - already handles keys correctly via
   `applyChildKeys()` and spread arguments

3. **Changes to `ssr-renderer.ts`**:
   - Replace `preprocessTree` with Flight stream creation
   - Add chunk collection logic
   - Use `createFromPayload` with SSR module loader
   - Remove `ensureArrayKeys` (no longer needed)

4. **Testing considerations**:
   - Verify async component handling matches current behavior
   - Ensure RSC payload consistency
   - Performance benchmarking (serialize/deserialize overhead)

## Links

- [React Keys Documentation](https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key)
- [React Server Components RFC](https://github.com/reactjs/rfcs/blob/main/text/0188-server-components.md)
- [react-server-dom-webpack Source](https://github.com/facebook/react/tree/main/packages/react-server-dom-webpack)
- [MADR Template](https://adr.github.io/madr/)

## Related Files

- `pkg/@eserstack/laroux-react-adapter/runtime/ssr-renderer.ts` - SSR rendering
  with `ensureArrayKeys`
- `pkg/@eserstack/laroux-react-adapter/server.ts` - Flight Server implementation
- `pkg/@eserstack/laroux-react-adapter/client.ts` - Flight Client implementation
- `pkg/@eserstack/laroux-react-adapter/protocol.ts` - RSC protocol types and
  utilities

## Notes

### Why `Children.toArray()` Didn't Work (Option 3)

Despite being React's standard utility, `Children.toArray()` assigns keys like
`.$.0`, `.$.1`, etc. However, React's SSR renderer (`renderToReadableStream`)
still generated warnings. This suggests the issue is deeper than just key
assignment - it's related to how `createElement` interprets children passed in
the props object versus as rest arguments.

### Why `cloneElement` Works (Option 1)

`cloneElement` creates a new element with explicit props merged in. When we pass
`{ key: '.0' }`, React extracts the key during element creation and stores it on
the element object (not in props). This is the same behavior as JSX with
explicit key attribute.

### Performance Characteristics

For a typical page with ~100 array children total:

- **Best case** (all have keys): ~100 `isReactElement` checks, 0 allocations
- **Worst case** (none have keys): ~100 checks + ~100 `cloneElement` calls

The `cloneElement` overhead is minimal - it's essentially object spread with key
extraction. React's internal implementation is highly optimized.
