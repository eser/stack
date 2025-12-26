# ⚡ [@eser/functions](./)

Functional programming patterns for pipelines, middleware, and result handling.

## Features

- **Pipeline Pattern**: Composable middleware chains with async generator
  support
- **Result Types**: `Ok` and `Fail` for explicit error handling without
  exceptions
- **Context & State**: Shared state across pipeline functions

## Quick Start

### Pipeline Pattern

```typescript
import { fn } from "@eser/functions";

// Create a pipeline with middleware
const pipeline = fn(
  // Middleware: logging
  async function* (ctx, ...args) {
    console.log("Before:", args);
    yield* ctx.next();
    console.log("After");
  },
  // Target function
  async function* (_ctx, name: string) {
    yield `Hello, ${name}!`;
  },
);

// Run the pipeline
const results = await pipeline.run("World");
// results = ["Hello, World!"]
```

### Result Types

```typescript
import { Fail, Ok, type Result } from "@eser/functions";

function divide(a: number, b: number): Result<number> {
  if (b === 0) {
    return Fail(new Error("Division by zero"));
  }
  return Ok(a / b);
}

const result = divide(10, 2);
if (result.error) {
  console.error(result.error.message);
} else {
  console.log(result.payload); // 5
}
```

### Chainable Pipeline

```typescript
import { fn } from "@eser/functions";

const pipeline = fn()
  .use(authMiddleware)
  .use(loggingMiddleware)
  .set(targetHandler);

for await (const item of pipeline.iterate(request)) {
  console.log(item);
}
```

## API Reference

### Pipeline

| Method             | Description                          |
| ------------------ | ------------------------------------ |
| `use(...fns)`      | Add middleware functions (chainable) |
| `set(fn)`          | Set the target function (chainable)  |
| `iterate(...args)` | Execute as async generator           |
| `run(...args)`     | Execute and collect all results      |

### Result Functions

| Function                | Description             |
| ----------------------- | ----------------------- |
| `Ok(payload?)`          | Create a success result |
| `Fail(error, payload?)` | Create an error result  |

### Result Type

```typescript
type Result<T> = {
  error?: Error;
  payload?: T;
  extraData?: Record<string | symbol, any>;
};
```

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
