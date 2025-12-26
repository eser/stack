# ⚙️ [@eser/jsx-runtime](./)

JSX runtime with React compatibility and precompiled template support.

## Features

- **React Compatible**: Re-exports `jsx`, `jsxs`, and `Fragment` from React
- **XSS Protection**: Automatic HTML entity encoding for safe rendering
- **Precompiled Templates**: `jsxTemplate` for optimized JSX transforms

## Quick Start

### Standard JSX Usage

```tsx
import { Fragment, jsx } from "@eser/jsx-runtime";

// JSX is automatically transformed by the compiler
const element = (
  <Fragment>
    <h1>Hello, World!</h1>
    <p>Welcome to the app.</p>
  </Fragment>
);
```

### Safe Content Escaping

```typescript
import { jsxEscape } from "@eser/jsx-runtime";

// Escape user input to prevent XSS
const userInput = '<script>alert("xss")</script>';
const safe = jsxEscape(userInput);
// "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"

// Handles various types safely
jsxEscape(null); // null (filtered out)
jsxEscape(true); // null (filtered out)
jsxEscape(42); // "42"
jsxEscape(["a", "b"]); // ["a", "b"] (recursively escaped)
```

### Precompiled Templates

```typescript
import { jsxTemplate } from "@eser/jsx-runtime";

// Used by precompile JSX transforms for optimized rendering
const vnode = jsxTemplate(
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

### Encoder

| Function              | Description                               |
| --------------------- | ----------------------------------------- |
| `encodeEntities(str)` | Encode HTML entities (`"`, `&`, `<`, `>`) |

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
