// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as fs from "@std/fs"; // symlinks are not available in runtime
import { runtime } from "@eserstack/standards/cross-runtime";
import * as larouxConfig from "@eserstack/laroux/config";
import * as react from "./adapters/react/mod.ts";
import * as rscClientEntry from "./adapters/react/rsc-client-entry.ts";
import type * as chunkManifest from "./domain/chunk-manifest.ts";
import type { CssPlugin } from "./domain/css-plugin.ts";
import type { FrameworkPlugin } from "./domain/framework-plugin.ts";
import * as virtualSource from "./domain/virtual-source.ts";
import * as system from "./system.ts";
import type * as types from "./types.ts";

/** A framework plugin whose client entry step fails, as a broken app would. */
const failingClientEntryPlugin: FrameworkPlugin = {
  name: "failing-client-entry",
  createClientEntry: () =>
    Promise.reject(new Error("create client entry: fixture failure")),
};

function createBuildConfig(projectRoot: string): types.BuildConfig {
  return {
    projectRoot,
    srcDir: runtime.path.join(projectRoot, "src"),
    distDir: runtime.path.join(projectRoot, "dist"),
    logLevel: "error",
    fonts: [],
    images: larouxConfig.DEFAULT_IMAGES,
    cssModuleTypes: false,
    noCssModuleAutoReference: false,
    browserShims: larouxConfig.DEFAULT_BROWSER_SHIMS,
    serverExternals: larouxConfig.DEFAULT_SERVER_EXTERNALS,
  };
}

/** Write a one-page laroux app to a temp directory and remove it after fn. */
async function withApp(fn: (projectRoot: string) => Promise<void>) {
  const projectRoot = await runtime.fs.makeTempDir({ prefix: "laroux-build-" });

  try {
    const pagePath = runtime.path.join(
      projectRoot,
      "src/app/routes/home/page.tsx",
    );
    await runtime.fs.ensureDir(runtime.path.dirname(pagePath));
    await runtime.fs.writeTextFile(
      pagePath,
      "export function HomePage() {\n  return <h1>Home</h1>;\n}\n",
    );

    await fn(projectRoot);
  } finally {
    await runtime.fs.remove(projectRoot, { recursive: true });
  }
}

Deno.test("build reports a failed client bundle and removes the virtual source", async () => {
  await withApp(async (projectRoot) => {
    const config = createBuildConfig(projectRoot);
    const context = system.createBuildContext(config, {
      framework: failingClientEntryPlugin,
      bundlerBackend: "rolldown",
    });

    const result = await system.build(context);

    assert.assertEquals(result.success, false);
    assert.assertEquals(
      await runtime.fs.exists(
        runtime.path.join(config.distDir, virtualSource.VIRTUAL_SRC_DIR),
      ),
      false,
    );
  });
});

const LAYOUT_SOURCE = `export function Layout(props: { children: unknown }) {
  return <html><body>{props.children as never}</body></html>;
}
`;

const PAGE_SOURCE = `import { Counter } from "../../components/counter.tsx";

export function HomePage() {
  return <main><h1>Home</h1><Counter /></main>;
}
`;

const COUNTER_SOURCE = `"use client";

import * as React from "react";
import * as logging from "@eserstack/logging";

const logger = logging.logger.getLogger(["app", "counter"]);

export function Counter() {
  const [count, setCount] = React.useState(0);
  return (
    <button type="button" onClick={() => setCount(count + 1)}>{count}</button>
  );
}

export function reportSlowRender(durationMs: number): Promise<unknown> {
  return logger.with({ durationMs }).warn("counter rendered slowly");
}
`;

/**
 * The packages the client bundle imports by bare specifier, which an
 * installed laroux app has in its node_modules. @eserstack/logging is not
 * among them: the browser shim replaces it.
 */
const APP_DEPENDENCIES = ["react", "react-dom", "@eserstack/laroux"];

/**
 * The root of the laroux-react package. The test app links laroux-react from
 * there, and APP_DEPENDENCIES from its node_modules.
 */
function larouxReactRoot(): string {
  const bootstrapIndex = rscClientEntry.fileUrlToPath(
    import.meta.resolve("@eserstack/laroux-react/client/bootstrap"),
  );
  // <package root>/client/bootstrap/index.ts
  return runtime.path.resolve(bootstrapIndex, "../../..");
}

/** Write a laroux app with a layout, a page and one client component. */
async function writeReactApp(projectRoot: string): Promise<void> {
  const sources = {
    "package.json": JSON.stringify({
      name: "laroux-test-app",
      type: "module",
      dependencies: {
        "@eserstack/laroux": "^4.5.2",
        "@eserstack/laroux-react": "^4.5.2",
        "react": "^19.3.0",
        "react-dom": "^19.3.0",
      },
    }),
    "src/app/layout.tsx": LAYOUT_SOURCE,
    "src/app/routes/home/page.tsx": PAGE_SOURCE,
    "src/app/components/counter.tsx": COUNTER_SOURCE,
  };
  await Promise.all(
    Object.entries(sources).map(async ([file, content]) => {
      const filePath = runtime.path.join(projectRoot, file);
      await runtime.fs.ensureDir(runtime.path.dirname(filePath));
      await runtime.fs.writeTextFile(filePath, content);
    }),
  );
  const larouxReact = larouxReactRoot();
  await Promise.all([
    ...APP_DEPENDENCIES.map((name) =>
      fs.ensureSymlink(
        runtime.path.join(larouxReact, "node_modules", name),
        runtime.path.join(projectRoot, "node_modules", name),
      )
    ),
    // The server bundle imports the client component references' protocol
    // from laroux-react
    fs.ensureSymlink(
      larouxReact,
      runtime.path.join(projectRoot, "node_modules", "@eserstack/laroux-react"),
    ),
  ]);
}

async function readChunkManifest(
  distDir: string,
): Promise<chunkManifest.ChunkManifest> {
  return JSON.parse(
    await runtime.fs.readTextFile(
      runtime.path.join(distDir, "client", "manifest.json"),
    ),
  );
}

Deno.test("build of a minimal laroux app with the React plugin succeeds", async () => {
  await withApp(async (projectRoot) => {
    await writeReactApp(projectRoot);

    const config = createBuildConfig(projectRoot);
    const context = system.createBuildContext(config, {
      framework: react.reactPlugin,
      bundlerBackend: "rolldown",
    });

    const result = await system.build(context);

    assert.assertEquals(result.success, true);
    assert.assertEquals(result.clientComponents, 1);
    const manifest = await readChunkManifest(config.distDir);
    assert.assertEquals(Object.keys(manifest.chunks), [
      "src/app/components/counter.tsx",
    ]);
  });
});

/** A file URL for a path on the local file system, for a dynamic import. */
const toFileUrl = (filePath: string): string => {
  const slashed = filePath.replaceAll("\\", "/");
  return new URL(`file://${slashed.startsWith("/") ? "" : "/"}${slashed}`)
    .href;
};

/** Run fn with console.warn replaced by a recorder, and return its calls. */
async function recordWarnings(
  fn: () => Promise<unknown>,
): Promise<readonly unknown[][]> {
  const calls: unknown[][] = [];
  const original = globalThis.console.warn;
  globalThis.console.warn = (...args: unknown[]) => {
    calls.push(args);
  };

  try {
    await fn();
  } finally {
    globalThis.console.warn = original;
  }

  return calls;
}

Deno.test("a dev build gives client code the browser logger, with() included", async () => {
  await withApp(async (projectRoot) => {
    await writeReactApp(projectRoot);

    // laroux dev bundles with rolldown, as serve does; the client bundle of a
    // dev build still has to get the browser shims.
    const config = createBuildConfig(projectRoot);
    const context = system.createBuildContext(config, {
      framework: react.reactPlugin,
      bundlerBackend: "rolldown",
    });

    const result = await system.build(context);
    assert.assertEquals(result.success, true);

    // Load the component's chunk the way the client's lazy loader names it.
    const manifest = await readChunkManifest(config.distDir);
    const main = manifest.chunks["src/app/components/counter.tsx"]?.main;
    assert.assertExists(main);
    const chunkFile = main.includes("/") ? `${main}.js` : `chunk-${main}.js`;
    const counterModule = await import(
      toFileUrl(runtime.path.join(config.distDir, "client", chunkFile))
    ) as { reportSlowRender: (durationMs: number) => Promise<unknown> };

    const warnings = await recordWarnings(() =>
      counterModule.reportSlowRender(1200)
    );

    assert.assertEquals(warnings, [
      ["[app.counter] counter rendered slowly", { durationMs: 1200 }],
    ]);
  });
});

Deno.test("ensureBuildIsReady skips an unchanged project and rebuilds after a nested change", async () => {
  await withApp(async (projectRoot) => {
    await writeReactApp(projectRoot);

    const context = system.createBuildContext(createBuildConfig(projectRoot), {
      framework: react.reactPlugin,
      bundlerBackend: "rolldown",
    });

    const first = await system.ensureBuildIsReady(context);
    const second = await system.ensureBuildIsReady(context);

    assert.assertEquals(first.success, true);
    // A skipped build hands back the existing build: same build id,
    // timestamp, module map and client bundle, and no build time
    assert.assertEquals(second, {
      success: true,
      buildId: first.buildId,
      clientBundle: first.clientBundle,
      moduleMap: first.moduleMap,
      clientComponents: first.clientComponents,
      duration: 0,
      timestamp: first.timestamp,
    });

    // counter.tsx sits two directories below src/
    const nestedSource = runtime.path.join(
      projectRoot,
      "src/app/components/counter.tsx",
    );
    const afterBuild = new Date(first.timestamp + 1000);
    await Deno.utime(nestedSource, afterBuild, afterBuild);

    const third = await system.ensureBuildIsReady(context);

    assert.assertEquals(third.success, true);
    assert.assertGreater(third.timestamp, first.timestamp);
  });
});

Deno.test("a build that fails after bundling the client writes no chunk manifest, so the next ensureBuildIsReady builds again", async () => {
  await withApp(async (projectRoot) => {
    await writeReactApp(projectRoot);
    // public/ is copied into dist/ last; a file named like the client
    // output directory cannot replace it, so that copy fails.
    await runtime.fs.ensureDir(runtime.path.join(projectRoot, "public"));
    await runtime.fs.writeTextFile(
      runtime.path.join(projectRoot, "public", "client"),
      "not a directory",
    );

    const context = system.createBuildContext(createBuildConfig(projectRoot), {
      framework: react.reactPlugin,
      bundlerBackend: "rolldown",
    });

    const first = await system.build(context);
    const manifestExists = await runtime.fs.exists(context.chunkManifestFile);
    const retried = await system.ensureBuildIsReady(context);

    assert.assertEquals(first.success, false);
    assert.assertEquals(manifestExists, false);
    // A skipped build would report success; this one ran and failed again
    assert.assertEquals(retried.success, false);
  });
});

/** Records the requests a build makes to the optional ports. */
type PortCalls = {
  fonts: { fonts: unknown; options: unknown }[];
  images: unknown[];
  stylesheets: { css: string; filename: string; minify: boolean }[];
};

/** Ports that record their calls and return fixed results. */
function createRecordingPorts(calls: PortCalls): system.BuildPlugins {
  return {
    cssProcessor: {
      name: "recording-css",
      process: (css, options) => {
        calls.stylesheets.push({ css, ...options });
        return `/* processed */\n${css}`;
      },
    },
    fontOptimizer: {
      name: "recording-fonts",
      optimize: (fonts, options) => {
        calls.fonts.push({ fonts, options });
        return Promise.resolve({
          fontFaceCss: "@font-face { font-family: Inter; }",
          preloadHints: ['<link rel="preload" href="/fonts/inter.woff2">'],
          fileCount: 1,
          totalSize: 1024,
        });
      },
    },
    imageOptimizer: {
      name: "recording-images",
      optimize: (request) => {
        calls.images.push(request);
        return Promise.resolve({ timestamp: 0, images: {} });
      },
    },
  };
}

/** A CSS plugin that leaves every stylesheet to the CSS processor. */
const decliningCssPlugin: CssPlugin = {
  name: "declining",
  shouldProcess: () => false,
};

const INTER: types.FontDefinition = { provider: "google", family: "Inter" };

/** Add a global stylesheet and one image to the app. */
async function writeStylesAndImage(projectRoot: string): Promise<void> {
  const stylesheet = runtime.path.join(
    projectRoot,
    "src/app/styles/global.css",
  );
  const image = runtime.path.join(projectRoot, "public/images/logo.png");
  await Promise.all([
    runtime.fs.ensureDir(runtime.path.dirname(stylesheet)),
    runtime.fs.ensureDir(runtime.path.dirname(image)),
  ]);
  await Promise.all([
    runtime.fs.writeTextFile(stylesheet, "a { color: red; }\n"),
    runtime.fs.writeFile(image, new Uint8Array([137, 80, 78, 71])),
  ]);
}

Deno.test("build hands the stylesheet, the fonts and the images to the ports it is given", async () => {
  await withApp(async (projectRoot) => {
    await writeReactApp(projectRoot);
    await writeStylesAndImage(projectRoot);

    const config = { ...createBuildConfig(projectRoot), fonts: [INTER] };
    const calls: PortCalls = { fonts: [], images: [], stylesheets: [] };
    const context = system.createBuildContext(config, {
      framework: react.reactPlugin,
      css: decliningCssPlugin,
      bundlerBackend: "rolldown",
      ...createRecordingPorts(calls),
    });

    const result = await system.build(context);

    const clientDir = runtime.path.join(config.distDir, "client");
    const readClientFile = (name: string) =>
      runtime.fs.readTextFile(runtime.path.join(clientDir, name));

    assert.assertEquals(result.success, true);
    assert.assertEquals(calls.stylesheets, [{
      css: "a { color: red; }\n",
      filename: runtime.path.join(projectRoot, "src/app/styles/global.css"),
      minify: true,
    }]);
    assert.assertEquals(
      await readClientFile("styles.css"),
      "/* processed */\na { color: red; }\n",
    );
    assert.assertEquals(calls.fonts, [{
      fonts: [INTER],
      options: {
        outputDir: runtime.path.join(clientDir, "fonts"),
        publicPath: "/fonts",
      },
    }]);
    assert.assertEquals(
      await readClientFile("fonts.css"),
      "@font-face { font-family: Inter; }",
    );
    assert.assertEquals(
      JSON.parse(await readClientFile("font-preloads.json")),
      [
        '<link rel="preload" href="/fonts/inter.woff2">',
      ],
    );
    assert.assertEquals(calls.images, [{
      inputDir: runtime.path.join(projectRoot, "public/images"),
      outputDir: runtime.path.join(clientDir, "images"),
      publicPath: "/images",
      config: config.images,
    }]);
  });
});

Deno.test("build without the optional ports copies the stylesheet as written and self-hosts no fonts", async () => {
  await withApp(async (projectRoot) => {
    await writeReactApp(projectRoot);
    await writeStylesAndImage(projectRoot);

    const config = { ...createBuildConfig(projectRoot), fonts: [INTER] };
    const context = system.createBuildContext(config, {
      framework: react.reactPlugin,
      css: decliningCssPlugin,
      bundlerBackend: "rolldown",
    });

    const result = await system.build(context);

    const clientDir = runtime.path.join(config.distDir, "client");
    assert.assertEquals(result.success, true);
    assert.assertEquals(
      await runtime.fs.readTextFile(runtime.path.join(clientDir, "styles.css")),
      "a { color: red; }\n",
    );
    assert.assertEquals(
      await runtime.fs.exists(runtime.path.join(clientDir, "fonts.css")),
      false,
    );
    assert.assertEquals(
      await runtime.fs.exists(runtime.path.join(clientDir, "images")),
      false,
    );
  });
});

const referenceCases = [
  {
    name: "build lets the CSS plugin add @reference to CSS modules by default",
    noCssModuleAutoReference: false,
    expected: true,
  },
  {
    name:
      "build tells the CSS plugin not to add @reference when the config says so",
    noCssModuleAutoReference: true,
    expected: false,
  },
];

for (const { name, noCssModuleAutoReference, expected } of referenceCases) {
  Deno.test(name, async () => {
    await withApp(async (projectRoot) => {
      await writeReactApp(projectRoot);
      const cssModule = runtime.path.join(
        projectRoot,
        "src/app/components/card.module.css",
      );
      await runtime.fs.writeTextFile(cssModule, ".card { color: red; }\n");

      const seen: (boolean | undefined)[] = [];
      const recordingPlugin: CssPlugin = {
        name: "recording",
        preprocess: (css, context) => {
          seen.push(context.injectReference);
          return css;
        },
      };
      const config = {
        ...createBuildConfig(projectRoot),
        noCssModuleAutoReference,
      };
      const context = system.createBuildContext(config, {
        framework: react.reactPlugin,
        css: recordingPlugin,
        bundlerBackend: "rolldown",
      });

      const result = await system.build(context);

      assert.assertEquals(result.success, true);
      assert.assertEquals(seen, [expected]);
    });
  });
}

// ============================================================================
// Watch-mode rebuilds
// ============================================================================

/**
 * A CSS plugin that leaves every stylesheet to the CSS processor and defers
 * all of styles.css, so styles.deferred.css repeats it.
 */
const deferringCssPlugin: CssPlugin = {
  name: "deferring",
  shouldProcess: () => false,
  extractCriticalCss: (compiledCss) => ({
    critical: "",
    deferred: compiledCss,
  }),
};

const STYLED_COUNTER_SOURCE = `"use client";

import * as React from "react";
import styles from "./counter.module.css";

export function Counter() {
  const [count, setCount] = React.useState(0);
  return (
    <button type="button" className={styles.counter} onClick={() => setCount(count + 1)}>
      {count}
    </button>
  );
}
`;

/**
 * Give the app a global stylesheet and a client component styled by a CSS
 * module, and return the module's path.
 */
async function writeStyledCounter(
  projectRoot: string,
  color: string,
): Promise<string> {
  const files = {
    "src/app/styles/global.css": "a { color: red; }\n",
    "src/app/components/counter.tsx": STYLED_COUNTER_SOURCE,
    "src/app/components/counter.module.css": `.counter { color: ${color}; }\n`,
  };
  await Promise.all(
    Object.entries(files).map(async ([file, content]) => {
      const filePath = runtime.path.join(projectRoot, file);
      await runtime.fs.ensureDir(runtime.path.dirname(filePath));
      await runtime.fs.writeTextFile(filePath, content);
    }),
  );
  return runtime.path.join(
    projectRoot,
    "src/app/components/counter.module.css",
  );
}

const readClientFile = (distDir: string, name: string): Promise<string> =>
  runtime.fs.readTextFile(runtime.path.join(distDir, "client", name));

Deno.test("a CSS-only rebuild writes the styles.css a full build writes, CSS module styles included", async () => {
  await withApp(async (projectRoot) => {
    await writeReactApp(projectRoot);
    const cssModulePath = await writeStyledCounter(projectRoot, "green");
    const config = createBuildConfig(projectRoot);
    const context = system.createBuildContext(config, {
      framework: react.reactPlugin,
      css: deferringCssPlugin,
      bundlerBackend: "rolldown",
    });
    const first = await system.build(context);

    // Only the CSS module changes, so the watcher takes the CSS-only path
    await runtime.fs.writeTextFile(
      cssModulePath,
      ".counter { color: blue; }\n",
    );
    const cssOnly = await system.build(context, {
      cssOnly: true,
      changedFiles: new Set([cssModulePath]),
    });
    const stylesAfterCssOnly = await readClientFile(
      config.distDir,
      "styles.css",
    );
    const deferredAfterCssOnly = await readClientFile(
      config.distDir,
      "styles.deferred.css",
    );
    const full = await system.build(context);
    const stylesAfterFull = await readClientFile(config.distDir, "styles.css");

    assert.assertEquals(first.success, true);
    assert.assertEquals(cssOnly.success, true);
    assert.assertEquals(full.success, true);
    // The JavaScript in dist/ is the first build's, and so is the build id
    assert.assertEquals(cssOnly.buildId, first.buildId);
    assert.assertStringIncludes(stylesAfterCssOnly, "a { color: red; }");
    assert.assertStringIncludes(stylesAfterCssOnly, "_counter{color:#00f}");
    assert.assertEquals(stylesAfterCssOnly.includes("green"), false);
    assert.assertEquals(stylesAfterCssOnly, stylesAfterFull);
    // The pages load the deferred CSS, so it follows the change too
    assert.assertEquals(deferredAfterCssOnly, stylesAfterCssOnly);
  });
});

Deno.test("a JS-only rebuild of an app with CSS modules succeeds and keeps their styles once", async () => {
  await withApp(async (projectRoot) => {
    await writeReactApp(projectRoot);
    await writeStyledCounter(projectRoot, "green");
    const config = createBuildConfig(projectRoot);
    const context = system.createBuildContext(config, {
      framework: react.reactPlugin,
      css: deferringCssPlugin,
      bundlerBackend: "rolldown",
    });
    const first = await system.build(context);
    const stylesBefore = await readClientFile(config.distDir, "styles.css");

    // Only a component changes, so the watcher skips the CSS steps
    const pagePath = runtime.path.join(
      projectRoot,
      "src/app/routes/home/page.tsx",
    );
    await runtime.fs.writeTextFile(
      pagePath,
      PAGE_SOURCE.replace("<h1>Home</h1>", "<h1>Welcome</h1>"),
    );
    const rebuilt = await system.build(context, {
      skipCss: true,
      changedFiles: new Set([pagePath]),
    });
    const stylesAfter = await readClientFile(config.distDir, "styles.css");
    const generatedRoutes = await runtime.fs.readTextFile(
      runtime.path.join(config.distDir, "server", "_generated-routes.ts"),
    );

    assert.assertEquals(first.success, true);
    // The client bundle imports the counter's class names from its CSS
    // module, which a JS-only rebuild compiles too
    assert.assertEquals(rebuilt.success, true);
    assert.assertNotEquals(rebuilt.buildId, first.buildId);
    assert.assertEquals(stylesAfter, stylesBefore);
    assert.assertEquals(stylesAfter.split("_counter{").length, 2);
    // The server imports the rebuilt pages under the new build id
    assert.assertStringIncludes(
      generatedRoutes,
      `"./src/app/routes/home/page.js?v=${rebuilt.buildId}"`,
    );
  });
});
