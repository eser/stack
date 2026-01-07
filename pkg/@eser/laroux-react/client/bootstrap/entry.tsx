// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Client Entry Point
 * Bootstraps the React app with React Server Components
 */

/// <reference path="./globals.d.ts" />

// Type definition for log level (inlined to avoid import issues when bundled)
type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * No-op logger for production builds
 * Provides same interface as LogTape without any overhead
 */
const NoopLogManager = {
  getLogger: () => ({
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
  }),
};

// Get chunk manifest first to determine log level
const chunkManifest = globalThis.__CHUNK_MANIFEST__;

if (!chunkManifest) {
  console.error(
    "❌ [CLIENT] Chunk manifest not found! Server must inject __CHUNK_MANIFEST__",
  );
  throw new Error("Chunk manifest not found");
}

// Configure @eser/logging only in development (using dynamic import to avoid bundling in production)
// This avoids overhead in production builds
if (chunkManifest.hmrEnabled) {
  const logging = await import("@eser/logging");

  const mapLogLevel = (level: LogLevel): number => {
    const mapping: Record<LogLevel, number> = {
      "trace": logging.Severities.Debug,
      "debug": logging.Severities.Debug,
      "info": logging.Severities.Info,
      "warn": logging.Severities.Warning,
      "error": logging.Severities.Error,
      "fatal": logging.Severities.Critical,
    };
    return mapping[level] ?? logging.Severities.Info;
  };

  await logging.config.configure({
    sinks: {
      console: logging.sinks.getConsoleSink({
        formatter: logging.formatters.ansiColorFormatter(),
      }),
    },
    loggers: [
      {
        category: ["laroux-bundler"],
        lowestLevel: mapLogLevel(chunkManifest.logLevel ?? "info"),
        sinks: ["console"],
      },
    ],
  });
}

// Create loggers (dynamic import in dev, no-op in production)
const logging = chunkManifest.hmrEnabled ? await import("@eser/logging") : null;

const getLogger = logging
  ? (category: string[]) => logging.logger.getLogger(category)
  : NoopLogManager.getLogger;

const clientLogger = getLogger(["laroux-bundler", "client"]);
const rscClientLogger = getLogger(["laroux-bundler", "rsc-client"]);
const loaderLogger = getLogger(["laroux-bundler", "loader"]);
const bootstrapLogger = getLogger(["laroux-bundler", "bootstrap"]);
const actionsLogger = getLogger(["laroux-bundler", "actions"]);

/**
 * Global __callServer function for server actions
 *
 * This is the React-native way to invoke server actions:
 * 1. Client stubs call __callServer(actionId, args)
 * 2. We POST to /_rsc with RSC-Action header
 * 3. Server executes the action and returns RSC-encoded result
 * 4. We parse and return the result
 *
 * This enables native `<form action={fn}>` and `useActionState(fn, state)` support.
 */
async function callServer(actionId: string, args: unknown[]): Promise<unknown> {
  actionsLogger.debug(`🎯 Calling server action: ${actionId}`);

  try {
    // Determine content type based on args
    // If first arg is FormData, send as multipart/form-data
    // Otherwise send as JSON
    const isFormData = args.length > 0 && args[0] instanceof FormData;

    let body: BodyInit;
    const headers: HeadersInit = {
      "Accept": "text/x-component",
      "RSC-Action": actionId,
    };

    if (isFormData) {
      // For FormData, browser sets Content-Type with boundary automatically
      body = args[0] as FormData;
      actionsLogger.debug(`📤 Sending FormData to action ${actionId}`);
    } else {
      // For regular args, send as JSON
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(args);
      actionsLogger.debug(`📤 Sending JSON args to action ${actionId}:`, {
        args,
      });
    }

    const response = await fetch("/_rsc", {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      actionsLogger.error(`❌ Server action failed: ${actionId}`, {
        errorText,
      });
      throw new Error(
        `Server action failed: ${response.status} ${response.statusText}`,
      );
    }

    // Parse RSC response
    // For now, we expect JSON response (can enhance to full RSC parsing later)
    const contentType = response.headers.get("Content-Type");

    if (contentType?.includes("application/json")) {
      const result = await response.json();
      actionsLogger.debug(`✅ Action ${actionId} returned:`, { result });
      return result;
    }

    // RSC response (text/x-component) - for now just parse as JSON
    // TODO: Full RSC response parsing for complex return values
    const text = await response.text();

    // Try to extract JSON from RSC format (J0:{"result":...})
    const jsonMatch = text.match(/^J\d+:(.+)$/m);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[1]);
      actionsLogger.debug(`✅ Action ${actionId} returned (RSC format):`, {
        result,
      });
      return result;
    }

    // Fallback: try parsing entire response as JSON
    try {
      const result = JSON.parse(text);
      actionsLogger.debug(`✅ Action ${actionId} returned:`, { result });
      return result;
    } catch {
      actionsLogger.warn(
        `⚠️ Could not parse action response as JSON, returning raw text`,
      );
      return text;
    }
  } catch (error) {
    actionsLogger.error(`❌ Server action error: ${actionId}`, { error });
    throw error;
  }
}

// Register global __callServer for server action stubs
if (typeof globalThis !== "undefined") {
  (globalThis as unknown as { __callServer: typeof callServer }).__callServer =
    callServer;
  actionsLogger.debug("✅ __callServer registered globally");
}

import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import {
  createElementFromChunk,
  createFromFetch,
  createHybridRSCTree,
  getEmbeddedPayload,
  hasEmbeddedPayload,
  hasStreamingOptimalRSC,
  type ModuleLoader,
} from "@eser/laroux-react/client";
import type { RSCChunk } from "@eser/laroux-react/protocol";
import { startTransition, Suspense, use } from "react";
import { ErrorBoundary } from "./error-boundary.tsx";
import { LazyChunkLoader } from "./lazy-loader.ts";
import { initializeHMR } from "./hmr-client.tsx";
import { initializeSmartRefresh } from "./smart-refresh.tsx";

/**
 * Check if we're running in a browser environment
 * Inlined to avoid bundler issues with @eser/standards
 */
function isBrowser(): boolean {
  return typeof globalThis !== "undefined" &&
    typeof globalThis.window !== "undefined" &&
    typeof globalThis.document !== "undefined";
}

/**
 * Log client initialization
 */
clientLogger.info(
  `🎬 Entry script loading with log level: ${chunkManifest.logLevel}`,
);
clientLogger.debug("📦 Chunk manifest loaded:", { chunkManifest });

// Initialize HMR and Smart Refresh only if enabled (dev mode with runtime bundler)
if (chunkManifest.hmrEnabled) {
  clientLogger.debug("🔥 Initializing HMR...");
  initializeSmartRefresh();
  initializeHMR();
} else {
  clientLogger.debug("📦 Production mode - HMR disabled");
}

const lazyLoader = new LazyChunkLoader(chunkManifest);

/**
 * Module loader that uses lazy chunk loading
 * Components are loaded on-demand via dynamic imports
 */
const customModuleLoader: ModuleLoader = async (id: string, name: string) => {
  loaderLogger.debug(`📦 Request: id="${id}", name="${name}"`);

  try {
    const module = await lazyLoader.loadModule(id, name);
    loaderLogger.debug(`✅ Successfully loaded module: ${id}#${name}`);
    return module;
  } catch (err) {
    loaderLogger.error(`❌ Failed to load ${id}#${name}:`, { error: err });
    throw err;
  }
};

/**
 * Lazy RSC promise - created only once when first accessed
 */
let rscPromiseCache: Promise<unknown> | null = null;

function getRSCPromise() {
  rscClientLogger.debug("🔄 getRSCPromise called, cache exists:", {
    cached: !!rscPromiseCache,
  });

  if (!rscPromiseCache) {
    rscClientLogger.debug("🔄 Creating RSC promise (first time)...");
    rscClientLogger.debug("🔄 Fetching /rsc with custom module loader");

    // Create the fetch promise ONCE and reuse it
    // Add cache-busting to ensure fresh data and send current pathname
    const timestamp = Date.now();
    const pathname = isBrowser() ? globalThis.window.location.pathname : "/";
    // Also extract locale from URL search params to pass to RSC endpoint
    const searchParams = isBrowser()
      ? new URLSearchParams(globalThis.window.location.search)
      : null;
    const locale = searchParams?.get("locale");
    const fetchPromise = fetch(
      `/rsc?pathname=${encodeURIComponent(pathname)}&t=${timestamp}${
        locale ? `&locale=${encodeURIComponent(locale)}` : ""
      }`,
    );

    rscPromiseCache = createFromFetch(fetchPromise, customModuleLoader);

    rscClientLogger.debug("🔄 Promise created successfully");
  }
  return rscPromiseCache;
}

/**
 * Clear RSC cache - used by HMR for smart refresh
 * @param changedModules - Optional array of changed module paths
 */
function clearRSCCache(changedModules?: string[]) {
  if (changedModules && changedModules.length > 0) {
    rscClientLogger.debug(
      `🔄 Clearing RSC cache (${changedModules.length} modules changed)`,
    );
  } else {
    rscClientLogger.debug("🔄 Clearing RSC cache for refresh");
  }
  rscPromiseCache = null;
}

// Export cache clearing function for HMR
if (typeof globalThis !== "undefined") {
  globalThis.__clearRSCCache__ = clearRSCCache;
}

/**
 * RSCRoot - Unwraps the RSC promise using React's use() hook
 *
 * The Promise resolves to a COMPONENT FUNCTION (not an element!).
 * We render that component, which re-initializes the tree on each render.
 * This allows React to encounter PENDING chunks and retry when they resolve.
 */
function RSCRoot() {
  rscClientLogger.debug("⚛️  RSCRoot component rendering...");

  // Lazy load the RSC - only fetches on first render
  // This returns a component FUNCTION (RSCTreeRoot)
  const RSCTreeRoot = use(getRSCPromise());

  rscClientLogger.debug("⚛️  RSCTreeRoot component received");

  // Render the RSCTreeRoot component - it will initialize the tree each time it renders
  // If it encounters a PENDING chunk, it throws, React Suspense catches it,
  // and when the chunk resolves, React automatically retries rendering RSCTreeRoot
  return <RSCTreeRoot />;
}

/**
 * Global React root instance for HMR (used in CSR mode)
 */
let reactRoot: Root | null = null;

/**
 * Island roots for selective hydration (used in SSR mode)
 * Maps container elements to their React roots for cleanup during navigation
 */
const islandRoots: Map<HTMLElement, Root> = new Map();

/**
 * Refresh the RSC root - used by HMR for smart refresh and navigation
 * @param changedModules - Optional array of changed module paths
 */
function refreshRSCRoot(changedModules?: string[]) {
  if (changedModules && changedModules.length > 0) {
    bootstrapLogger.debug(
      `🔄 Refreshing RSC root (${changedModules.length} modules changed)`,
    );
  } else {
    bootstrapLogger.debug("🔄 Refreshing RSC root");
  }

  // After initial islands hydration, switch to CSR for navigation
  // This ensures client-side navigation works even if the page was SSR'd
  if (isSSRHydration) {
    bootstrapLogger.debug(
      "🔄 Switching from islands hydration to CSR mode for navigation",
    );
    isSSRHydration = false;

    // Clean up island roots before switching to full CSR
    cleanupIslandRoots();

    // Create a new full React root for CSR navigation
    const rootElement = document.getElementById("root");
    if (!rootElement) {
      bootstrapLogger.fatal("❌ Root element not found during navigation!");
      return;
    }

    reactRoot = createRoot(rootElement);
  }

  if (!reactRoot) {
    bootstrapLogger.warn("⚠️  React root not initialized, cannot refresh");
    return;
  }

  // Re-render with fresh RSC data (cache was cleared)
  // Use null fallback to allow server-rendered Loading components to show through
  reactRoot.render(
    <ErrorBoundary>
      <Suspense fallback={null}>
        <RSCRoot />
      </Suspense>
    </ErrorBoundary>,
  );

  bootstrapLogger.debug("✅ RSC root refreshed");
}

// Export refresh function for HMR
if (typeof globalThis !== "undefined") {
  globalThis.__refreshRSCRoot__ = refreshRSCRoot;
}

/**
 * Track if we're in SSR/islands hydration mode
 * Used to determine navigation behavior
 */
let isSSRHydration = false;

/**
 * Cached RSC payload for islands hydration
 * Populated once when first island is hydrated
 */
let cachedRscPayload: RSCChunk[] | null = null;

/**
 * Hydrate a single island (client component)
 * Creates an isolated React root for just this component
 *
 * Uses RSC payload when chunk ID is available for proper prop/children resolution.
 * Falls back to simple JSON props when chunk ID is not present.
 */
async function hydrateIsland(
  container: HTMLElement,
  moduleId: string,
  exportName: string,
  propsJson: string,
  chunkId: string | null,
): Promise<void> {
  try {
    bootstrapLogger.debug(
      `🏝️ Hydrating island: ${moduleId}#${exportName} (chunk: ${
        chunkId ?? "none"
      })`,
    );

    let element: React.ReactElement;

    if (chunkId !== null) {
      // Use RSC payload for proper prop/children resolution
      if (!cachedRscPayload) {
        cachedRscPayload = getEmbeddedPayload();
        if (!cachedRscPayload) {
          throw new Error("RSC payload not found for chunk-based hydration");
        }
        bootstrapLogger.debug(
          `📦 Loaded RSC payload with ${cachedRscPayload.length} chunks`,
        );
      }

      // Parse the element from the specific chunk
      const parsedElement = await createElementFromChunk(
        cachedRscPayload,
        parseInt(chunkId, 10),
        customModuleLoader,
      );

      element = <ErrorBoundary>{parsedElement}</ErrorBoundary>;
    } else {
      // Fallback: use simple JSON props (no children/complex props support)
      const props = JSON.parse(propsJson);
      const Component = await customModuleLoader(moduleId, exportName);
      element = (
        <ErrorBoundary>
          <Component {...props} />
        </ErrorBoundary>
      );
    }

    // Use hydrateRoot since we have server-rendered content
    const root = hydrateRoot(container, element, {
      onRecoverableError: (error) => {
        bootstrapLogger.warn(`⚠️ Island hydration mismatch (${moduleId}):`, {
          error,
        });
      },
    });

    islandRoots.set(container, root);
    bootstrapLogger.debug(`✅ Island hydrated: ${moduleId}#${exportName}`);
  } catch (err) {
    bootstrapLogger.error(`❌ Failed to hydrate island ${moduleId}:`, {
      error: err,
    });
  }
}

/**
 * Hydrate all client component islands on the page
 * Instead of hydrating the entire root, we only hydrate elements marked with data-client-component
 * This is more efficient as server-rendered static content doesn't need React
 *
 * Uses RSC payload for proper prop/children resolution via data-chunk-id attribute.
 */
async function hydrateIslands(): Promise<void> {
  const islands = document.querySelectorAll("[data-client-component]");

  bootstrapLogger.debug(`🏝️ Found ${islands.length} islands to hydrate`);

  // Hydrate all islands in parallel for faster TTI
  const hydrationPromises: Promise<void>[] = [];

  for (const island of islands) {
    const moduleId = island.getAttribute("data-client-component");
    const exportName = island.getAttribute("data-export-name") ?? "default";
    const propsJson = island.getAttribute("data-props") ?? "{}";
    const chunkId = island.getAttribute("data-chunk-id"); // RSC chunk ID for proper resolution

    if (!moduleId) {
      bootstrapLogger.warn("⚠️ Island missing data-client-component attribute");
      continue;
    }

    hydrationPromises.push(
      hydrateIsland(
        island as HTMLElement,
        moduleId,
        exportName,
        propsJson,
        chunkId,
      ),
    );
  }

  await Promise.all(hydrationPromises);
  bootstrapLogger.info(`✅ All ${islands.length} islands hydrated`);
}

/**
 * Clean up all island roots (used during navigation)
 */
function cleanupIslandRoots(): void {
  bootstrapLogger.debug(`🧹 Cleaning up ${islandRoots.size} island roots`);

  for (const [, root] of islandRoots) {
    try {
      root.unmount();
    } catch (err) {
      bootstrapLogger.warn("⚠️ Error unmounting island root:", { error: err });
    }
  }

  islandRoots.clear();
  cachedRscPayload = null; // Clear cached payload for fresh navigation
}

/**
 * Hydrate from streaming-optimal mode with full root hydration
 *
 * CRITICAL: Wait for RSC tree to resolve BEFORE calling hydrateRoot!
 * If we hydrate while root chunk is PENDING, React suspends and clears SSR content.
 *
 * Flow:
 * 1. SSR HTML shows immediately (fast first paint)
 * 2. Client.js loads, starts /rsc fetch
 * 3. WAIT for RSC tree promise to resolve (root chunk ready)
 * 4. THEN call hydrateRoot - no suspension, no flicker!
 * 5. Async Suspense boundaries update as more /rsc chunks arrive
 */
async function hydrateFromStreamingOptimal(): Promise<void> {
  bootstrapLogger.debug(
    "🚀 Starting streaming-optimal hydration...",
  );

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element not found");
  }

  try {
    // Get inline RSC payload (for potential future optimization)
    const inlinePayload = getEmbeddedPayload();
    if (inlinePayload) {
      bootstrapLogger.debug(
        `📦 Found ${inlinePayload.length} inline RSC chunks`,
      );
    }

    // Start /rsc fetch - required for component tree
    const pathname = isBrowser() ? globalThis.window.location.pathname : "/";
    const searchParams = isBrowser()
      ? new URLSearchParams(globalThis.window.location.search)
      : null;
    const locale = searchParams?.get("locale");
    const timestamp = Date.now();

    bootstrapLogger.debug("📡 Starting /rsc fetch...");
    const rscFetchPromise = fetch(
      `/rsc?pathname=${encodeURIComponent(pathname)}&t=${timestamp}${
        locale ? `&locale=${encodeURIComponent(locale)}` : ""
      }`,
    );

    // Create hybrid RSC tree promise
    const treePromise = createHybridRSCTree(
      inlinePayload,
      rscFetchPromise,
      customModuleLoader,
    );

    // CRITICAL: Wait for the RSC tree to resolve BEFORE hydrating!
    // This ensures the root chunk is ready, preventing Suspense from
    // clearing SSR content (which causes flicker).
    // SSR HTML remains visible while we wait.
    bootstrapLogger.debug("⏳ Waiting for RSC tree to resolve...");
    const RSCTreeRoot = await treePromise;
    bootstrapLogger.debug("✅ RSC tree resolved, now hydrating...");

    // Now hydrate with the resolved tree - no suspension at root level!
    // Use hydrateRoot to attach to existing SSR DOM without clearing it.
    // Inner Suspense boundaries for async components will still work.
    const root = hydrateRoot(
      rootElement,
      <ErrorBoundary>
        <RSCTreeRoot />
      </ErrorBoundary>,
      {
        onRecoverableError: (error) => {
          // Hydration mismatches are expected for async components
          bootstrapLogger.debug("⚠️ Hydration mismatch (expected for async):", {
            error,
          });
        },
      },
    );

    // Store root for HMR and navigation
    reactRoot = root;
    isSSRHydration = true;

    bootstrapLogger.info(
      "✅ Streaming-optimal hydration complete",
    );
  } catch (err) {
    bootstrapLogger.error("❌ Streaming-optimal hydration failed:", {
      error: err,
    });
    throw err;
  }
}

/**
 * Bootstrap in CSR mode (fallback)
 */
function bootstrapCSR() {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element not found");
  }

  reactRoot = createRoot(rootElement);
  reactRoot.render(
    <ErrorBoundary>
      <Suspense fallback={null}>
        <RSCRoot />
      </Suspense>
    </ErrorBoundary>,
  );

  bootstrapLogger.info("✅ React app mounted with CSR");
}

/**
 * Bootstrap the application
 * Renders React app with Suspense boundary
 * Supports inline streaming, SSR hydration, and CSR modes
 */
function bootstrap() {
  bootstrapLogger.debug("🚀 Starting bootstrap...");
  bootstrapLogger.debug("🚀 Document ready state:", {
    readyState: document.readyState,
  });

  const rootElement = document.getElementById("root");
  bootstrapLogger.debug("🚀 Root element found:", { found: !!rootElement });

  if (!rootElement) {
    bootstrapLogger.fatal("❌ Root element not found!");
    return;
  }

  // Check hydration mode:
  // 1. Streaming-optimal (sync inline + async via /rsc - recommended)
  // 2. Embedded RSC payload (islands hydration)
  // 3. CSR mode (fetch /rsc)
  const isStreamingOptimal = hasStreamingOptimalRSC();
  isSSRHydration = isStreamingOptimal || hasEmbeddedPayload();

  if (isStreamingOptimal) {
    bootstrapLogger.debug(
      "🚀 Streaming-optimal mode detected, using hybrid hydration...",
    );

    // Use streaming-optimal: sync chunks inline + async via /rsc
    try {
      hydrateFromStreamingOptimal();
    } catch (err) {
      bootstrapLogger.error(
        "❌ Streaming-optimal hydration failed, falling back to CSR:",
        { error: err },
      );

      try {
        bootstrapCSR();
      } catch (err) {
        bootstrapLogger.error(
          "❌ CSR error:",
          { error: err },
        );
      }
    }
  } else if (hasEmbeddedPayload()) {
    bootstrapLogger.debug(
      "🏝️ SSR content detected, using islands hydration mode...",
    );

    // Use islands architecture: only hydrate client components
    // Server-rendered static content doesn't need React
    hydrateIslands().catch((err) => {
      bootstrapLogger.error(
        "❌ Islands hydration failed, falling back to CSR:",
        {
          error: err,
        },
      );

      // Fall back to CSR if hydration fails
      // Keep SSR content visible - don't clear the DOM
      isSSRHydration = false;
      cleanupIslandRoots();

      // Use createRoot to take over the existing DOM without clearing it
      // This preserves the SSR content while enabling client-side updates
      reactRoot = createRoot(rootElement);
      reactRoot.render(
        <ErrorBoundary>
          <Suspense fallback={null}>
            <RSCRoot />
          </Suspense>
        </ErrorBoundary>,
      );

      bootstrapLogger.info(
        "✅ React app mounted with CSR (hydration fallback, SSR content preserved)",
      );
    });
  } else {
    bootstrapLogger.debug("🚀 No SSR content, using CSR mode...");

    try {
      // Create React root and store it globally for HMR
      reactRoot = createRoot(rootElement);
      bootstrapLogger.debug("🚀 React root created");

      // Render with ErrorBoundary and Suspense to handle async RSC loading
      // Use null fallback to allow server-rendered Loading components to show through
      reactRoot.render(
        <ErrorBoundary>
          <Suspense fallback={null}>
            <RSCRoot />
          </Suspense>
        </ErrorBoundary>,
      );

      bootstrapLogger.info("✅ React app mounted with RSC");
    } catch (err) {
      bootstrapLogger.fatal("❌ Bootstrap error:", { error: err });

      // Show error to user
      rootElement.innerHTML = `
        <div class="error">
          <h2>⚠️ Bootstrap Error</h2>
          <pre>${err instanceof Error ? err.message : String(err)}</pre>
          <button onclick="globalThis.location.reload()">Reload Page</button>
        </div>
      `;
    }
  }
}

/**
 * Setup navigation event listeners
 * Handles route changes from both programmatic navigation and browser back/forward
 */
function setupNavigationListeners() {
  clientLogger.debug("🧭 Setting up navigation listeners...");

  // Listen for custom navigation events (programmatic navigation from Link component)
  if (isBrowser()) {
    // Track current pathname to detect hash-only changes
    let currentPathname = globalThis.window.location.pathname;

    globalThis.window.addEventListener("__laroux_navigate", () => {
      clientLogger.debug("🧭 Navigation event detected, refreshing RSC...");
      // Update tracked pathname on navigation
      currentPathname = globalThis.window.location.pathname;
      // Use startTransition to keep old UI visible during RSC fetch
      // This prevents layout flash by allowing React to render concurrently
      startTransition(() => {
        clearRSCCache();
        refreshRSCRoot();
      });
    });

    // Listen for browser back/forward navigation
    globalThis.window.addEventListener("popstate", () => {
      const newPathname = globalThis.window.location.pathname;

      // Skip RSC refresh for hash-only changes (same pathname, different hash)
      if (newPathname === currentPathname) {
        clientLogger.debug(
          "🧭 Popstate event detected (hash-only change), skipping RSC refresh",
        );
        return;
      }

      currentPathname = newPathname;
      clientLogger.debug("🧭 Popstate event detected, refreshing RSC...");
      // Use startTransition to keep old UI visible during RSC fetch
      startTransition(() => {
        clearRSCCache();
        refreshRSCRoot();
      });
    });

    clientLogger.debug("✅ Navigation listeners registered");
  }
}

// Start the app when DOM is ready
clientLogger.debug("🎬 Checking document ready state:", {
  readyState: document.readyState,
});

if (document.readyState === "loading") {
  clientLogger.debug(
    "🎬 Document still loading, adding DOMContentLoaded listener",
  );
  document.addEventListener("DOMContentLoaded", () => {
    clientLogger.debug("🎬 DOMContentLoaded event fired");
    bootstrap();
    setupNavigationListeners();
  });
} else {
  clientLogger.debug("🎬 Document already ready, bootstrapping immediately");
  bootstrap();
  setupNavigationListeners();
}
