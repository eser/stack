# 🌐 [@eser/laroux](./)

Framework-agnostic core utilities for **Laroux.js** — a full-stack web framework
built on React Server Components. This package provides the shared logic used
across the Laroux ecosystem without any runtime or framework dependencies.

## 🚀 Quick Start

```typescript
import * as laroux from "@eser/laroux";

// Navigation analysis
const analysis = laroux.analyzeNavigation("/about", {
  currentUrl: "/home",
  baseUrl: "https://example.com",
});

// Route matching
const match = laroux.matchRoute("/users/:id", "/users/123");
console.log(match); // { id: "123" }

// Check if URL is external
laroux.isExternalUrl("https://other.com", "https://example.com"); // true
```

## 🛠 Features

- **Navigation** — URL analysis, link configuration, modifier key detection
- **Routing** — Path matching, normalization, API route definitions
- **Image Optimization** — Responsive images, format detection, srcset building
- **Configuration** — Default configs for SSR, builds, server, and more

## 📦 Laroux Ecosystem

`@eser/laroux` is the core package in a family of four:

| Package                  | Purpose                                               |
| ------------------------ | ----------------------------------------------------- |
| **@eser/laroux**         | Framework-agnostic core (this package)                |
| **@eser/laroux-server**  | HTTP server, SSR, and React Server Components runtime |
| **@eser/laroux-react**   | React client runtime, hydration, and protocol         |
| **@eser/laroux-bundler** | Build tooling, CSS, Tailwind, and asset processing    |

## 📋 Modules

### Navigation

Client-side navigation utilities for SPA-style routing.

```typescript
import * as laroux from "@eser/laroux";

// Build link configuration
const link = laroux.buildLinkConfig("/dashboard", {
  currentUrl: "/home",
  baseUrl: "https://example.com",
});

// Analyze navigation intent
const nav = laroux.analyzeNavigation("/external", {
  currentUrl: "/home",
  baseUrl: "https://example.com",
});

// Check URL types
laroux.isExternalUrl("https://other.com", "https://example.com"); // true
laroux.isSpecialProtocol("mailto:user@example.com"); // true
```

### Router

URL pattern matching and API route handling.

```typescript
import * as laroux from "@eser/laroux";

// Match routes with parameters
const match = laroux.matchRoute("/users/:id", "/users/123");
// { id: "123" }

// Find matching route from a set
const route = laroux.findMatchingRoute(
  [{ pattern: "/api/users/:id", handler: getUser }],
  "/api/users/42",
);

// Normalize paths
laroux.normalizePath("//foo//bar//"); // "/foo/bar"

// Create HTTP responses
laroux.jsonResponse({ ok: true }); // Response with JSON body
laroux.errorResponse(404, "Not found"); // Error response
```

### Image

Responsive image utilities for optimized delivery.

```typescript
import * as laroux from "@eser/laroux";

// Build image attributes
const attrs = laroux.buildImageAttributes({
  src: "/images/hero.jpg",
  width: 800,
  height: 600,
  alt: "Hero image",
});

// Generate srcset for responsive images
const srcSet = laroux.inferSrcSet("/images/photo.jpg", [400, 800, 1200]);

// Build picture element sources
const sources = laroux.buildPictureSources({
  src: "/images/photo.jpg",
  formats: ["avif", "webp"],
  widths: [400, 800, 1200],
});

// Parse image source
const parsed = laroux.parseImageSrc("/images/photo.jpg?w=800");
```

### Configuration

Default configuration values for Laroux applications.

```typescript
import * as laroux from "@eser/laroux";

// Access default configurations
const serverConfig = laroux.DEFAULT_SERVER;
const buildConfig = laroux.DEFAULT_BUILD;
const ssrConfig = laroux.DEFAULT_SSR;
const imageConfig = laroux.DEFAULT_IMAGES;
```

## 🔌 API Reference

### Navigation

| Export                  | Description                                 |
| ----------------------- | ------------------------------------------- |
| `analyzeNavigation()`   | Analyze a navigation target URL             |
| `buildLinkConfig()`     | Build configuration for a link element      |
| `isExternalUrl()`       | Check if a URL points to an external domain |
| `isSpecialProtocol()`   | Check for mailto:, tel:, etc.               |
| `NAVIGATION_EVENT_NAME` | Event name constant for navigation events   |

### Router

| Export                | Description                         |
| --------------------- | ----------------------------------- |
| `matchRoute()`        | Match a URL against a route pattern |
| `findMatchingRoute()` | Find first matching route in a set  |
| `normalizePath()`     | Normalize URL path                  |
| `jsonResponse()`      | Create a JSON Response              |
| `errorResponse()`     | Create an error Response            |
| `HttpError`           | HTTP error class with status code   |

### Image

| Export                      | Description                            |
| --------------------------- | -------------------------------------- |
| `buildImageAttributes()`    | Build HTML img attributes              |
| `buildPictureSources()`     | Build picture element source entries   |
| `buildPlaceholderStyles()`  | Build placeholder CSS styles           |
| `buildFallbackHandler()`    | Build image load error handler         |
| `inferSrcSet()`             | Generate srcset from widths            |
| `parseImageSrc()`           | Parse image source URL                 |
| `buildFormatSrcSet()`       | Build srcset for a specific format     |
| `shouldUsePictureElement()` | Determine if picture element is needed |

### Configuration

| Export           | Description                         |
| ---------------- | ----------------------------------- |
| `DEFAULT_CONFIG` | Complete default configuration      |
| `DEFAULT_SERVER` | Default server settings             |
| `DEFAULT_BUILD`  | Default build settings              |
| `DEFAULT_SSR`    | Default SSR settings                |
| `DEFAULT_IMAGES` | Default image optimization settings |

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
