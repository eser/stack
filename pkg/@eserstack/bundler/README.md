# 📦 [@eserstack/bundler](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/bundler` is
> published on npm under the same name (`pnpm add @eserstack/bundler`); the JSR
> versions stay available but get no updates.

> **eserstack Tool** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/bundler`

A bundler abstraction on Rolldown, with CSS processing utilities.

## Features

- **Rolldown Backend**: One configuration and output shape for every build
- **CSS Processing**: Tailwind CSS, Lightning CSS, CSS Modules
- **Font Optimization**: Google Fonts self-hosting with preload hints
- **Code Splitting**: Advanced chunking strategies for optimal loading
- **Plugin System**: Extensible with resolve, load, and transform hooks

## Installation

```typescript
import * as bundler from "@eserstack/bundler";
import * as css from "@eserstack/bundler/css";
```

The CSS tools live in their own `@eserstack/bundler/css` entry, so importing the
bundler does not load Lightning CSS or Tailwind.

## Quick Start

### Basic Bundling

```typescript
import * as bundler from "@eserstack/bundler";

// Create bundler (Rolldown is default)
const backend = bundler.createBundler("rolldown");

const result = await backend.bundle({
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

## Bundler Backends

### Rolldown (Default)

[Rolldown](https://rolldown.rs) is a Rust-based bundler with a Rollup-compatible
plugin API. Its site publishes benchmarks against Rollup.

```typescript
import * as bundler from "@eserstack/bundler";

// Basic usage
const basic = bundler.createRolldownBackend();

// With advanced chunking
const chunked = bundler.createRolldownBackend({
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
const react = bundler.createRolldownWithPreset("react");
// Available presets: "default", "react", "library", "ssr", "performance"
```

## CSS Processing

### Tailwind CSS

Process CSS with Tailwind using `@tailwindcss/node` (same pattern as
`@tailwindcss/vite`).

```typescript
import * as css from "@eserstack/bundler/css";

// Create a Tailwind compiler root (reuse across files)
const tailwind = css.createTailwindRoot({
  base: ".",
  minify: true,
});

// Process CSS modules with @apply support
const result = await css.processCssModule("src/Button.module.css", {
  tailwind,
  generateDts: true,
});

console.log(result.exports); // { button: "button_abc123" }

// Clean up when done
tailwind.dispose();

// Check if CSS contains Tailwind directives
const cssContent = ".button { @apply px-4 py-2; }";
if (css.hasTailwindDirectives(cssContent)) {
  // Process with Tailwind
}
```

### Lightning CSS

Advanced CSS transformation with browser targeting and minification.

```typescript
import * as css from "@eserstack/bundler/css";

const cssContent = ".card { display: flex; & .title { font-weight: bold; } }";

// Basic transformation
const result = css.transformWithLightningCss(cssContent, {
  filename: "styles.css",
  minify: true,
  targets: {
    chrome: css.browserVersion(90),
    firefox: css.browserVersion(88),
    safari: css.browserVersion(14),
  },
});

console.log(result.code);

// Using presets
const modernResult = css.transformWithLightningCss(cssContent, {
  minify: true,
  targets: css.BrowserTargetPresets.modern(),
});

// Simple minification
const minified = css.minifyCss(cssContent);
```

### CSS Modules

Process `.module.css` files with scoped class names and TypeScript definitions.

```typescript
import * as css from "@eserstack/bundler/css";

// Process single module (without Tailwind)
const result = await css.processCssModule("src/Button.module.css", {
  generateDts: true,
  minify: true,
});

console.log(result.exports);
// { button: "button_abc123", primary: "primary_def456" }

console.log(result.dts);
// declare const styles: { readonly button: string; readonly primary: string; };
// export default styles;

// Build all CSS modules in a directory
const results = await css.buildCssModules("src", "dist", {
  generateDts: true,
});
```

CSS Modules with Tailwind `@apply`:

```typescript
import * as css from "@eserstack/bundler/css";

// Create Tailwind compiler (reuse across files)
const tailwind = css.createTailwindRoot({ base: "." });

// Process CSS module with @apply support
const result = await css.processCssModule("src/Card.module.css", {
  tailwind,
  generateDts: true,
});

tailwind.dispose();
```

Note: Tailwind v4 needs a `@reference "tailwindcss";` directive in CSS files
that use `@apply`. `createTailwindRoot` adds it when it is missing; pass
`autoInjectReference: false` to turn that off.

### Google Fonts Optimization

Download and self-host Google Fonts for better performance.

```typescript
import * as css from "@eserstack/bundler/css";

// Optimize single font
const result = await css.optimizeGoogleFonts(
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
const combined = await css.optimizeMultipleGoogleFonts(
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
import * as bundler from "@eserstack/bundler";

interface BundlerConfig {
  // Named entrypoints (name -> file path)
  entrypoints: Record<string, string>;

  // Output directory
  outputDir: string;

  // Optional: Project root for module resolution (Rolldown adds its
  // node_modules to the resolve paths)
  projectRoot?: string;

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

  // Optional: Global replacements (e.g. process.env.NODE_ENV)
  define?: Record<string, string>;

  // Optional: External modules
  external?: string[];

  // Optional: Bundler plugins
  plugins?: bundler.BundlerPlugin[];

  // Optional: Path to deno.json or tsconfig.json
  configPath?: string;

  // Optional: Base path for URL rewriting
  basePath?: string;
}
```

### BundleResult

```typescript
import * as bundler from "@eserstack/bundler";

interface BundleResult {
  success: boolean;
  outputs: Map<string, bundler.BundleOutput>;
  errors?: bundler.BundleError[];
  warnings?: bundler.BundleWarning[];
  metafile?: bundler.BundleMetafile;
  entrypointManifest?: Record<string, string[]>;
  entrypoint?: string;
  totalSize?: number;
}
```

## Plugins

Create custom plugins with resolve, load, and transform hooks:

```typescript
import * as bundler from "@eserstack/bundler";

const myPlugin: bundler.BundlerPlugin = {
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

const backend = bundler.createBundler("rolldown");
await backend.bundle({
  entrypoints: { main: "./src/main.ts" },
  outputDir: "./dist",
  format: "esm",
  platform: "browser",
  codeSplitting: true,
  minify: false,
  sourcemap: false,
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
import * as bundler from "@eserstack/bundler";

// Use preset directly
const react = bundler.createRolldownWithPreset("react");

// Customize preset
const customReact = bundler.createRolldownWithPreset("react", {
  advancedChunks: { minSize: 5000 },
});

// Access preset options
const options = bundler.RolldownPresets.performance();
```

## Watch Mode

Both backends support watch mode for development:

```typescript
import * as bundler from "@eserstack/bundler";

const backend = bundler.createRolldownBackend();

const watcher = await backend.watch(
  {
    entrypoints: { main: "./src/main.ts" },
    outputDir: "./dist",
    format: "esm",
    platform: "browser",
    codeSplitting: false,
    minify: false,
    sourcemap: "inline",
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
import * as css from "@eserstack/bundler/css";

// Manual targets
const targets = {
  chrome: css.browserVersion(100), // Chrome 100
  firefox: css.browserVersion(95), // Firefox 95
  safari: css.browserVersion(15, 4), // Safari 15.4
};

// Or use presets
css.BrowserTargetPresets.modern(); // Chrome 90+, Firefox 88+, Safari 14+
css.BrowserTargetPresets.wide(); // Chrome 80+, Firefox 75+, Safari 13+
css.BrowserTargetPresets.latest(); // Chrome 120+, Firefox 120+, Safari 17+
```

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- The backend on Deno's native bundle API is removed, together with
  `createDenoBundlerBackend`, `DenoBundlerBackend`, `DenoBundlerBackendOptions`
  and its subpath export; `BundlerBackend` is only `"rolldown"`. Call
  `createBundler("rolldown")` or `createRolldownBackend()` instead; it names
  each entry's output `${key}.js` as the removed backend did.

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
