# ⚙️ [@eserstack/app-runtime](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/app-runtime` is
> published on npm under the same name (`pnpm add @eserstack/app-runtime`); the
> JSR versions stay available but get no updates.

> **eserstack Tool** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/app-runtime`

Application lifecycle runtime for the eserstack ecosystem. Manages modules,
channels, events, dependency injection, and run modes — providing a unified
container for composing application components.

## 🚀 Quick Start

```typescript
import * as appRuntime from "@eserstack/app-runtime";

// Create a new application runtime
const app = new appRuntime.AppRuntime();

// Add modules
app.addModule({
  name: "database",
  manifest: {},
  provides: [],
  entrypoint: () => {
    console.log("Database module initialized");
  },
});

// Set as the default runtime instance
app.setAsDefault();

// Await all pending operations
await app.awaitAll();
```

## 🛠 Features

- **Module System** — Register and manage application modules
- **Channel System** — Named communication channels between modules
- **Event System** — Built-in event bus via `@eserstack/events`
- **Dependency Injection** — Integrated DI container via `@eserstack/di`
- **Run Modes** — Environment-aware configuration (development, production,
  test)
- **Async Coordination** — Track and await pending async operations

## 🔌 API Reference

### `AppRuntime`

The main runtime container class.

```typescript
import * as appRuntime from "@eserstack/app-runtime";

const app = new appRuntime.AppRuntime();
```

#### Methods

| Method           | Description                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `addModule(mod)` | Register a module with the runtime                                                                                                        |
| `addChannel(ch)` | Register a communication channel                                                                                                          |
| `setAsDefault()` | Set this instance as the global default runtime                                                                                           |
| `awaitAll()`     | Await all pending async operations and empty the queue; rejects with the first failure, and work queued meanwhile waits for the next call |

#### State Properties

| Property   | Type                   | Description                        |
| ---------- | ---------------------- | ---------------------------------- |
| `runMode`  | `RunMode`              | Current run mode (dev, prod, test) |
| `events`   | `events.Factory`       | Event bus instance                 |
| `di`       | `services.di`          | Dependency injection container     |
| `channels` | `Map<string, Channel>` | Registered channels                |
| `modules`  | `Map<string, Module>`  | Registered modules                 |
| `awaits`   | `Array<Promise<any>>`  | Pending async operations           |

### `createAppRuntimeState()`

Create a fresh runtime state with default values.

```typescript
import * as appRuntime from "@eserstack/app-runtime";

const state = appRuntime.createAppRuntimeState();
const app = new appRuntime.AppRuntime(state);
```

### `Module`

The module interface for registering components with the runtime.

```typescript
import * as appRuntime from "@eserstack/app-runtime";

class MyService {}

const myModule: appRuntime.Module = {
  name: "my-module",
  manifest: { version: "1.0.0" },
  uses: ["database", "cache"],
  provides: [MyService],
  entrypoint: () => {
    // Module initialization logic
  },
};
```

| Property     | Type                     | Description                          |
| ------------ | ------------------------ | ------------------------------------ |
| `name`       | `string?`                | Module name (defaults to class name) |
| `manifest`   | `unknown`                | Module metadata                      |
| `uses`       | `ReadonlyArray<string>?` | Dependencies this module requires    |
| `provides`   | `ReadonlyArray<unknown>` | Services this module provides        |
| `entrypoint` | `() => void`             | Module initialization function       |

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `AppRuntime.awaitAll()` empties the queue before it waits: a rejected
  operation is reported once instead of on every later call, and work queued
  during the wait is kept for the next call. Handle the first rejection.

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
