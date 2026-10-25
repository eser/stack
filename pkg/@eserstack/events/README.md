# 📡 [@eserstack/events](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/events` is published
> on npm under the same name (`pnpm add @eserstack/events`); the JSR versions
> stay available but get no updates.

> **eserstack Foundation** —
> [eser/stack on GitHub](https://github.com/eser/stack) **Install:**
> `pnpm add jsr:@eserstack/events`

Type-safe event handling with a fluent API built on top of the DOM EventTarget.

## Features

- **Fluent API**: Chainable event registration with `add()` and `remove()`
- **Type-Safe Dispatch**: Dispatch custom events with typed payloads
- **Global Registry**: Pre-configured global event system for convenience
- **DOM Compatible**: Built on standard EventTarget for familiar behavior

## Quick Start

```typescript
import * as events from "@eserstack/events";

// Register event listeners
events.registry
  .add(
    "user:login",
    (e) => console.log("User logged in:", (e as CustomEvent).detail),
  )
  .add("user:logout", () => console.log("User logged out"));

// Dispatch events with data
events.dispatcher.dispatch("user:login", { detail: { userId: 123 } });

// One-time listeners
events.registry.add("init", () => console.log("Initialized"), { once: true });
```

## Custom Event Registry

```typescript
import * as events from "@eserstack/events";

// Create an isolated event system
const myEvents = new events.Registry();

myEvents.add("data:update", (e) => {
  console.log("Data updated:", (e as CustomEvent).detail);
});

const dispatcher = myEvents.build();
dispatcher.dispatch("data:update", { detail: { id: 1, value: "new" } });
```

## Removing Listeners

```typescript
import * as events from "@eserstack/events";

const registry = new events.Registry();

const handler = (e: Event) => console.log(e);
registry.add("click", handler);
registry.remove("click", handler);
```

## API Reference

### Registry

| Method                             | Description                            |
| ---------------------------------- | -------------------------------------- |
| `add(type, listener, options?)`    | Add event listener (chainable)         |
| `remove(type, listener, options?)` | Remove event listener (chainable)      |
| `build()`                          | Create a Dispatcher from this registry |

### Dispatcher

| Method                           | Description             |
| -------------------------------- | ----------------------- |
| `dispatch(type, eventInitDict?)` | Dispatch a custom event |

### Global Exports

| Export       | Description                            |
| ------------ | -------------------------------------- |
| `registry`   | Pre-configured global Registry         |
| `dispatcher` | Pre-configured global Dispatcher       |
| `events`     | Factory function for the global system |

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- The `default` export (the global `events` factory) is removed from the package
  root and from `@eserstack/events/events`. Use the namespace import:

  ```typescript
  // Before
  import events from "@eserstack/events";
  // After
  import * as events from "@eserstack/events";

  events.events; // the factory that was the default export
  ```

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
