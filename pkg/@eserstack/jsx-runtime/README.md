# ⚙️ [@eserstack/jsx-runtime](./)

> **Note:** JSR is frozen at 4.5.x. `@eserstack/jsx-runtime` is removed in 5.0.0
> and is not published to npm; its JSR versions stay available but get no
> updates. The CHANGELOG Migration section names its replacement.

> **eserstack Library** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/jsx-runtime`

JSX runtime with React compatibility and precompiled template support.

## Features

- **React Compatible**: Re-exports `jsx`, `jsxs`, and `Fragment` from React
- **XSS Protection**: Automatic HTML entity encoding for safe rendering
- **Precompiled Templates**: `jsxTemplate` for optimized JSX transforms

## Quick Start

### Standard JSX Usage

Point the compiler at this runtime in `deno.json` (or `tsconfig.json`):

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@eserstack/jsx-runtime"
  }
}
```

```tsx
// JSX is automatically transformed by the compiler
const element = (
  <>
    <h1>Hello, World!</h1>
    <p>Welcome to the app.</p>
  </>
);
```

The same calls are available without JSX:

```typescript
import * as jsxRuntime from "@eserstack/jsx-runtime";

const element = jsxRuntime.jsxs(jsxRuntime.Fragment, {
  children: [
    jsxRuntime.jsx("h1", { children: "Hello, World!" }),
    jsxRuntime.jsx("p", { children: "Welcome to the app." }),
  ],
});
```

### Safe Content Escaping

```typescript
import * as jsxRuntime from "@eserstack/jsx-runtime";

// Escape user input to prevent XSS
const userInput = '<script>alert("xss")</script>';
const safe = jsxRuntime.jsxEscape(userInput);
// "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"

// Handles various types safely
jsxRuntime.jsxEscape(null); // null (filtered out)
jsxRuntime.jsxEscape(true); // null (filtered out)
jsxRuntime.jsxEscape(42); // "42"
jsxRuntime.jsxEscape(["a", "b"]); // ["a", "b"] (recursively escaped)
```

### Precompiled Templates

```typescript
import * as jsxRuntime from "@eserstack/jsx-runtime";

// Used by precompile JSX transforms for optimized rendering
const vnode = jsxRuntime.jsxTemplate(
  ["<div>", " - ", "</div>"],
  "Hello",
  "World",
);
```

## API Reference

### Core Exports

| Export     | Description                                           |
| ---------- | ----------------------------------------------------- |
| `jsx`      | Create JSX elements (from React)                      |
| `jsxs`     | Create JSX elements with static children (from React) |
| `Fragment` | Group elements without wrapper (from React)           |

### Template Utilities

| Function                           | Description                                    |
| ---------------------------------- | ---------------------------------------------- |
| `jsxEscape(value)`                 | Escape dynamic content for safe HTML rendering |
| `jsxTemplate(templates, ...exprs)` | Create template VNode for precompiled JSX      |

### Encoding

`jsxEscape` encodes the HTML entities `"`, `&`, `<` and `>` in string content.
The encoder itself is internal and not exported.

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
