# @eser/bundler

A unified bundler abstraction for Deno with multiple backend support and
comprehensive CSS processing utilities.

## Features

- **Multi-Backend Support**: Switch between Rolldown and Deno.bundle backends
- **Unified API**: Consistent configuration across bundler backends
- **CSS Processing**: Tailwind CSS, Lightning CSS, CSS Modules
- **Font Optimization**: Google Fonts self-hosting with preload hints
- **Code Splitting**: Advanced chunking strategies for optimal loading
- **Plugin System**: Extensible with resolve, load, and transform hooks

## Installation

```typescript
import { createBundler } from "@eser/bundler";
import {
  createTailwindRoot,
  optimizeGoogleFonts,
  processCssModule,
} from "@eser/bundler/css";
```

## Quick Start

### Basic Bundling

```typescript
import { createBundler } from "@eser/bundler";

// Create bundler (Rolldown is default)
const bundler = createBundler("rolldown");

const result = await bundler.bundle({
  entrypoints: {
    main: "./src/main.ts",
    worker: "./src/worker.ts",
  },
  outputDir: "./dist",
  format: "esm",
  platform: "browser",
  codeSplitting: true,
  minify: true,
  sourcemap: true,
});

if (result.success) {
  console.log(`Bundle size: ${result.totalSize} bytes`);
  for (const [path, output] of result.outputs) {
    console.log(`  ${path}: ${output.size} bytes`);
  }
}
```

### Using Deno.bundle Fallback

```typescript
import { createBundler } from "@eser/bundler";

// Use native Deno.bundle API
const bundler = createBundler("deno-bundler");

const result = await bundler.bundle({
  entrypoints: { app: "./src/app.tsx" },
  outputDir: "./dist",
  format: "esm",
  platform: "browser",
  codeSplitting: true,
  minify: false,
  sourcemap: "inline",
});
```

## Bundler Backends

### Rolldown (Default)

Rolldown is a Rust-based bundler that's 10-30x faster than Rollup with
Rollup-compatible plugin API.

```typescript
import {
  createRolldownBundlerBackend,
  createRolldownWithPreset,
  RolldownPresets,
} from "@eser/bundler";

// Basic usage
const bundler = createRolldownBundlerBackend();

// With advanced chunking
const bundler = createRolldownBundlerBackend({
  treeshake: true,
  advancedChunks: {
    minSize: 20000,
    groups: [
      { name: "vendor", test: /node_modules/, priority: 10 },
      { name: "react", test: /react|react-dom/, priority: 20 },
    ],
  },
});

// Using presets
const bundler = createRolldownWithPreset("react");
// Available presets: "default", "react", "library", "ssr", "performance"
```

### Deno Bundler

Uses the native `Deno.bundle()` API (requires `--unstable-bundle` flag).

```typescript
import { createDenoBundlerBackend } from "@eser/bundler";

const bundler = createDenoBundlerBackend({
  buildId: "abc123", // Optional build ID for cache busting
});
```

### Backend Comparison

| Feature              | Rolldown              | Deno Bundler  |
| -------------------- | --------------------- | ------------- |
| **Performance**      | 10-30x faster         | Native Deno   |
| **Format**           | ESM, CJS, IIFE        | ESM only      |
| **External Modules** | ✓                     | ✓             |
| **Plugins**          | ✓ (Rollup-compatible) | ✗             |
| **Code Splitting**   | ✓ (Advanced)          | ✓             |
| **Watch Mode**       | ✓                     | ✓             |
| **Sourcemaps**       | ✓                     | ✓             |
| **basePath Rewrite** | ✓                     | ✓             |
| **Dependencies**     | npm:rolldown          | None (native) |

**When to use Rolldown:**

- Production builds requiring maximum performance
- Need CJS or IIFE output format
- Advanced code splitting with vendor chunking
- Plugin support (e.g., custom transformations)

**When to use Deno Bundler:**

- Simple builds without external dependencies
- Native Deno integration preferred
- Fallback when Rolldown is unavailable

## CSS Processing

### Tailwind CSS

Process CSS with Tailwind using `@tailwindcss/node` (same pattern as
`@tailwindcss/vite`).

```typescript
import {
  createTailwindRoot,
  hasTailwindDirectives,
  processCssModule,
} from "@eser/bundler/css";

// Create a Tailwind compiler root (reuse across files)
const tailwind = createTailwindRoot({
  base: ".",
  minify: true,
});

// Process CSS modules with @apply support
const result = await processCssModule("src/Button.module.css", {
  tailwind,
  generateDts: true,
});

console.log(result.exports); // { button: "button_abc123" }

// Clean up when done
tailwind.dispose();

// Check if CSS contains Tailwind directives
if (hasTailwindDirectives(cssContent)) {
  // Process with Tailwind
}
```

### Lightning CSS

Advanced CSS transformation with browser targeting and minification.

```typescript
import {
  BrowserTargetPresets,
  browserVersion,
  minifyCss,
  transformWithLightningCss,
} from "@eser/bundler/css";

// Basic transformation
const result = transformWithLightningCss(cssContent, {
  filename: "styles.css",
  minify: true,
  targets: {
    chrome: browserVersion(90),
    firefox: browserVersion(88),
    safari: browserVersion(14),
  },
});

console.log(result.code);

// Using presets
const result = transformWithLightningCss(cssContent, {
  minify: true,
  targets: BrowserTargetPresets.modern(),
});

// Simple minification
const minified = minifyCss(cssContent);
```

### CSS Modules

Process `.module.css` files with scoped class names and TypeScript definitions.

```typescript
import {
  buildCssModules,
  createTailwindRoot,
  generateTypeScriptDefinition,
  processCssModule,
} from "@eser/bundler/css";

// Process single module (without Tailwind)
const result = await processCssModule("src/Button.module.css", {
  generateDts: true,
  minify: true,
});

console.log(result.exports);
// { button: "button_abc123", primary: "primary_def456" }

console.log(result.dts);
// declare const styles: { readonly button: string; readonly primary: string; };
// export default styles;

// Build all CSS modules in a directory
const results = await buildCssModules("src", "dist", {
  generateDts: true,
});
```

CSS Modules with Tailwind `@apply`:

```typescript
// Create Tailwind compiler (reuse across files)
const tailwind = createTailwindRoot({ base: "." });

// Process CSS module with @apply support
const result = await processCssModule("src/Card.module.css", {
  tailwind,
  generateDts: true,
});

tailwind.dispose();
```

Note: CSS files using `@apply` need `@reference "tailwindcss";` directive
(Tailwind v4 requirement).

### Google Fonts Optimization

Download and self-host Google Fonts for better performance.

```typescript
import {
  generatePreloadHints,
  optimizeGoogleFonts,
  optimizeMultipleGoogleFonts,
} from "@eser/bundler/css";

// Optimize single font
const result = await optimizeGoogleFonts(
  "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700",
  {
    outputDir: "dist/fonts",
    publicPath: "/fonts",
    maxPreloadFonts: 2,
  },
);

console.log(result.fontFaceCSS); // Rewritten @font-face declarations
console.log(result.preloadHints); // HTML preload link tags
console.log(result.totalSize); // Total bytes downloaded

// Optimize multiple fonts
const result = await optimizeMultipleGoogleFonts(
  [
    "https://fonts.googleapis.com/css2?family=Roboto:wght@400;700",
    "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600",
  ],
  { outputDir: "dist/fonts" },
);
```

## Configuration Reference

### BundlerConfig

```typescript
interface BundlerConfig {
  // Named entrypoints (name -> file path)
  entrypoints: Record<string, string>;

  // Output directory
  outputDir: string;

  // Output format: "esm" | "cjs" | "iife"
  format: "esm" | "cjs" | "iife";

  // Target platform: "browser" | "node" | "neutral"
  platform: "browser" | "node" | "neutral";

  // Enable code splitting
  codeSplitting: boolean;

  // Minify output
  minify: boolean;

  // Sourcemap: true | "inline" | "external" | false
  sourcemap: boolean | "inline" | "external";

  // Optional: Target environments
  target?: string[];

  // Optional: External modules
  external?: string[];

  // Optional: Bundler plugins
  plugins?: BundlerPlugin[];

  // Optional: Base path for URL rewriting
  basePath?: string;

  // Optional: Development mode
  dev?: boolean;
}
```

### BundleResult

```typescript
interface BundleResult {
  success: boolean;
  outputs: Map<string, BundleOutput>;
  errors?: BundleError[];
  warnings?: BundleWarning[];
  metafile?: BundleMetafile;
  entrypointManifest?: Record<string, string[]>;
  entrypoint?: string;
  totalSize?: number;
}
```

## Plugins

Create custom plugins with resolve, load, and transform hooks:

```typescript
import type { BundlerPlugin } from "@eser/bundler";

const myPlugin: BundlerPlugin = {
  name: "my-plugin",
  setup(build) {
    // Resolve hook - customize module resolution
    build.onResolve({ filter: /^virtual:/ }, (args) => {
      return { path: args.path, namespace: "virtual" };
    });

    // Load hook - provide module contents
    build.onLoad({ filter: /.*/, namespace: "virtual" }, (args) => {
      return {
        contents: `export default "virtual module: ${args.path}"`,
        loader: "js",
      };
    });

    // Transform hook - modify source code
    build.onTransform?.({ filter: /\.tsx?$/ }, (args) => {
      return {
        code: args.code.replace(/DEBUG/g, "false"),
      };
    });
  },
};

const bundler = createBundler("rolldown");
await bundler.bundle({
  // ...config
  plugins: [myPlugin],
});
```

## Rolldown Presets

Pre-configured settings for common use cases:

| Preset        | Description                                 |
| ------------- | ------------------------------------------- |
| `default`     | Sensible defaults for web apps              |
| `react`       | React apps with vendor splitting            |
| `library`     | Libraries with minimal chunking             |
| `ssr`         | Server-side rendering with aggressive split |
| `performance` | Maximum optimization for production         |

```typescript
import { createRolldownWithPreset, RolldownPresets } from "@eser/bundler";

// Use preset directly
const bundler = createRolldownWithPreset("react");

// Customize preset
const bundler = createRolldownWithPreset("react", {
  advancedChunks: { minSize: 5000 },
});

// Access preset options
const options = RolldownPresets.performance();
```

## Watch Mode

Both backends support watch mode for development:

```typescript
const bundler = createBundler("rolldown");

const watcher = await bundler.watch(
  {
    entrypoints: { main: "./src/main.ts" },
    outputDir: "./dist",
    format: "esm",
    platform: "browser",
    codeSplitting: false,
    minify: false,
    sourcemap: "inline",
    dev: true,
  },
  (result) => {
    if (result.success) {
      console.log("Rebuild complete!");
    } else {
      console.error("Build failed:", result.errors);
    }
  },
);

// Stop watching
await watcher.stop();
```

## Browser Targets

Use `browserVersion()` to create target numbers for Lightning CSS:

```typescript
import { BrowserTargetPresets, browserVersion } from "@eser/bundler/css";

// Manual targets
const targets = {
  chrome: browserVersion(100), // Chrome 100
  firefox: browserVersion(95), // Firefox 95
  safari: browserVersion(15, 4), // Safari 15.4
};

// Or use presets
BrowserTargetPresets.modern(); // Chrome 90+, Firefox 88+, Safari 14+
BrowserTargetPresets.wide(); // Chrome 80+, Firefox 75+, Safari 13+
BrowserTargetPresets.latest(); // Chrome 120+, Firefox 120+, Safari 17+
```

---

For further details such as requirements, licensing and support guide, please
visit the [main eserstack repository](https://github.com/eser/stack).
