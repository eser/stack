# 📡 [@eser/events](./)

Type-safe event handling with a fluent API built on top of the DOM EventTarget.

## Features

- **Fluent API**: Chainable event registration with `add()` and `remove()`
- **Type-Safe Dispatch**: Dispatch custom events with typed payloads
- **Global Registry**: Pre-configured global event system for convenience
- **DOM Compatible**: Built on standard EventTarget for familiar behavior

## Quick Start

```typescript
import * as events from "@eser/events";

// Register event listeners
events.registry
  .add("user:login", (e) => console.log("User logged in:", e.detail))
  .add("user:logout", () => console.log("User logged out"));

// Dispatch events with data
events.dispatcher.dispatch("user:login", { detail: { userId: 123 } });

// One-time listeners
events.registry.add("init", () => console.log("Initialized"), { once: true });
```

## Custom Event Registry

```typescript
import { Registry } from "@eser/events";

// Create an isolated event system
const myEvents = new Registry();

myEvents.add("data:update", (e) => {
  console.log("Data updated:", e.detail);
});

const dispatcher = myEvents.build();
dispatcher.dispatch("data:update", { detail: { id: 1, value: "new" } });
```

## Removing Listeners

```typescript
import { Registry } from "@eser/events";

const registry = new Registry();

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

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
