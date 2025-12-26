# 📦 [@eser/cache](./)

Cross-platform cache management with XDG-compliant directory structure.

## Features

- **XDG Compliance**: Follows XDG Base Directory Specification on Linux
- **Cross-Platform**: Platform-specific paths for macOS and Windows
- **Versioned Caching**: Built-in support for version-based cache isolation
- **Simple API**: Create, check, list, and clear cached items

## Quick Start

```typescript
import { createCacheManager } from "@eser/cache";

// Create a cache manager for your application
const cache = createCacheManager({
  app: { name: "my-cli", org: "eser" },
});

// Get versioned cache path
const binaryPath = cache.getVersionedPath("1.0.0", "binary");
// Linux: ~/.cache/eser/my-cli/v1.0.0/binary
// macOS: ~/Library/Caches/eser/my-cli/v1.0.0/binary
// Windows: %LOCALAPPDATA%/eser/my-cli/v1.0.0/binary

// Check if cached item exists
if (await cache.exists(binaryPath)) {
  console.log("Using cached binary");
} else {
  await cache.ensureDir(cache.getCacheDir());
  // Download and cache...
}

// List cached items
const entries = await cache.list();

// Clear cache
await cache.clear();
```

## XDG Directory Access

```typescript
import * as xdg from "@eser/cache/xdg";

const cacheHome = xdg.getXdgCacheHome(); // ~/.cache or ~/Library/Caches
const dataHome = xdg.getXdgDataHome(); // ~/.local/share or ~/Library/Application Support
const configHome = xdg.getXdgConfigHome(); // ~/.config or ~/Library/Preferences
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

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
