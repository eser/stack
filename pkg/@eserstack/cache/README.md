# 📦 [@eserstack/cache](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/cache` is published
> on npm under the same name (`pnpm add @eserstack/cache`); the JSR versions
> stay available but get no updates.

> **eserstack Library** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/cache`

Cross-platform cache management with XDG-compliant directory structure.

## Features

- **XDG Compliance**: Follows XDG Base Directory Specification on Linux
- **Cross-Platform**: Platform-specific paths for macOS and Windows
- **Versioned Caching**: Built-in support for version-based cache isolation
- **Simple API**: Create, check, list, and clear cached items

## Quick Start

```typescript
import * as cache from "@eserstack/cache";

// Create a cache manager for your application
const manager = cache.createCacheManager({
  app: { name: "my-cli", org: "eser" },
});

// Get versioned cache path
const binaryPath = manager.getVersionedPath("1.0.0", "binary");
// Linux: ~/.cache/eser/my-cli/v1.0.0/binary
// macOS: ~/Library/Caches/eser/my-cli/v1.0.0/binary
// Windows: %LOCALAPPDATA%/eser/my-cli/v1.0.0/binary

// Check if cached item exists
if (await manager.exists(binaryPath)) {
  console.log("Using cached binary");
} else {
  await manager.ensureDir(manager.getCacheDir());
  // Download and cache...
}

// List cached items
const entries = await manager.list();

// Clear cache
await manager.clear();
```

## XDG Directory Access

```typescript
import * as cache from "@eserstack/cache";

const cacheHome = cache.getXdgCacheHome(); // ~/.cache or ~/Library/Caches
const dataHome = cache.getXdgDataHome(); // ~/.local/share or ~/Library/Application Support
const configHome = cache.getXdgConfigHome(); // ~/.config or ~/Library/Preferences
```

## API Reference

### `createCacheManager(options)`

Creates a cache manager instance.

- `options.app.name` - Application name
- `options.app.org` - Organization name (optional)
- `options.baseDir` - Custom base directory (optional)

### CacheManager Methods

| Method                            | Description                          |
| --------------------------------- | ------------------------------------ |
| `getCacheDir()`                   | Get the base cache directory path    |
| `getVersionedPath(version, name)` | Get a versioned cache path           |
| `exists(path)`                    | Check if a path exists               |
| `ensureDir(path)`                 | Create directory if it doesn't exist |
| `list()`                          | List all cache entries               |
| `remove(path)`                    | Remove a cached item                 |
| `clear()`                         | Clear the entire cache               |

`list()`, `remove()` and `clear()` call the `@eserstack/ajan` native library and
throw when it cannot be loaded; the path methods, `exists()` and `ensureDir()`
work without it.

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
