// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Client Entry Point
 * Bootstraps the React app with React Server Components
 */

import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import type { Root } from "react-dom/client";
import * as logging from "@eserstack/logging";
import * as client from "../../client.ts";
import type { ModuleLoader } from "../../client.ts";
import type { RSCChunk } from "../../protocol.ts";
import * as imageFallback from "../../runtime/image/fallback.ts";
import * as linkNavigation from "../../runtime/navigation/link-navigation.ts";
import * as errorBoundary from "./error-boundary.ts";
import * as lazyLoader from "./lazy-loader.ts";
import * as hmrClient from "./hmr-client.ts";
import * as smartRefresh from "./smart-refresh.ts";
import type { LarouxGlobalThis } from "./globals.d.ts";

// The page-wide state the laroux client keeps on globalThis, with its types.
const larouxGlobals = globalThis as LarouxGlobalThis;

// The server injects the manifest into the page before this script runs.
const chunkManifest = larouxGlobals.__CHUNK_MANIFEST__;

if (chunkManifest === undefined) {
  throw new Error(
    "start the laroux client: globalThis.__CHUNK_MANIFEST__ is not set; serve the page through laroux-server, which injects it before the client script",
  );
}

// Client builds replace @eserstack/logging with laroux's browser logger (see
// DEFAULT_BROWSER_SHIMS in @eserstack/laroux/config): the same logger API,
// writing warnings and errors to the browser console.
const clientLogger = logging.logger.getLogger(["laroux-bundler", "client"]);
const rscClientLogger = logging.logger.getLogger([
  "laroux-bundler",
  "rsc-client",
]);
const loaderLogger = logging.logger.getLogger(["laroux-bundler", "loader"]);
const bootstrapLogger = logging.logger.getLogger([
  "laroux-bundler",
  "bootstrap",
]);
const actionsLogger = logging.logger.getLogger(["laroux-bundler", "actions"]);

/** Content type of the RSC wire format that laroux-server answers with. */
const RSC_CONTENT_TYPE = "text/x-component";

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

  // Errors here are returned to the code that called the action (a form
  // action, useActionState or an event handler), which handles them; this
  // function adds context and does not log them.

  // Determine content type based on args
  // If first arg is FormData, send as multipart/form-data
  // Otherwise send as JSON
  const isFormData = args.length > 0 && args[0] instanceof FormData;

  let body: BodyInit;
  const headers: HeadersInit = {
    "Accept": RSC_CONTENT_TYPE,
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
    actionsLogger.with({
      args,
    }).debug(`📤 Sending JSON args to action ${actionId}`);
  }

  let response: Response;
  try {
    response = await fetch("/_rsc", {
      method: "POST",
      headers,
      body,
    });
  } catch (error) {
    throw new Error(
      `call server action ${actionId}: the request to /_rsc did not complete; check the network connection and that the laroux server is running`,
      { cause: error },
    );
  }

  if (!response.ok) {
    const serverMessage = await readActionErrorMessage(response);
    throw new Error(
      `call server action ${actionId}: the server answered ${response.status} ${response.statusText}${
        serverMessage === null ? "" : ` (${serverMessage})`
      }`,
    );
  }

  // laroux-server encodes the result as RSC, so Dates, Maps, Sets, BigInts,
  // undefined and React elements come back as themselves.
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes(RSC_CONTENT_TYPE)) {
    await response.body?.cancel();
    const received = contentType === ""
      ? "no Content-Type"
      : `Content-Type "${contentType}"`;
    throw new Error(
      `call server action ${actionId}: the response has ${received} instead of ${RSC_CONTENT_TYPE}; check that the server and the client run the same laroux version`,
    );
  }

  if (response.body === null) {
    throw new Error(
      `call server action ${actionId}: the response has no body; check that the server and the client run the same laroux version`,
    );
  }

  const result = await client.createValueFromReadableStream(
    response.body,
    customModuleLoader,
  );
  actionsLogger.with({ result }).debug(`✅ Action ${actionId} returned`);
  return result;
}

/**
 * Read the message from a failed action response.
 *
 * laroux-server answers a failed action with `{ "error": "..." }` and keeps the
 * message safe to show. Any other body (a proxy's error page, a cut
 * connection) gives no message.
 */
async function readActionErrorMessage(
  response: Response,
): Promise<string | null> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // The status already reports the failure; a body that is not
    // laroux-server's JSON adds nothing to it.
    return null;
  }

  if (
    typeof body === "object" && body !== null && "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }

  return null;
}

// Register global __callServer for server action stubs
(globalThis as unknown as { __callServer: typeof callServer }).__callServer =
  callServer;
actionsLogger.debug("✅ __callServer registered globally");

// Server-rendered images carry their fallback source in an attribute, since
// laroux drops the functions a server component renders; this applies it to
// every image that fails to load, from here on and before this script ran.
imageFallback.installImageFallbacks(globalThis.document);

// A Link that a server component renders arrives without its click handler
// for the same reason, with its options in data attributes; this navigates on
// the client when such a link is clicked, under the rules Link applies.
linkNavigation.installLinkNavigation(globalThis.document, globalThis.window);

/**
 * Check if we're running in a browser environment
 * Inlined to avoid bundler issues with @eserstack/standards
 */
function isBrowser(): boolean {
  return typeof globalThis !== "undefined" &&
    typeof globalThis.window !== "undefined" &&
    typeof globalThis.document !== "undefined";
}

/**
 * The URL of the current page's RSC payload. It carries the page's pathname,
 * a timestamp that keeps caches from answering, and the page URL's `locale`
 * parameter, which the server hands to the page as `request.locale`.
 */
function buildRscUrl(timestamp: number): string {
  const location = isBrowser() ? globalThis.window.location : null;
  const params = new URLSearchParams({
    pathname: location?.pathname ?? "/",
    t: String(timestamp),
  });

  const locale = location === null
    ? null
    : new URLSearchParams(location.search).get("locale");
  if (locale !== null && locale !== "") {
    params.set("locale", locale);
  }

  return `/rsc?${params.toString()}`;
}

/**
 * Log client initialization
 */
clientLogger.info(
  `🎬 Entry script loading with log level: ${chunkManifest.logLevel}`,
);
clientLogger.with({ chunkManifest }).debug("📦 Chunk manifest loaded");

// Initialize HMR and Smart Refresh only if enabled (dev mode with runtime bundler)
if (chunkManifest.hmrEnabled) {
  clientLogger.debug("🔥 Initializing HMR...");
  smartRefresh.initializeSmartRefresh();
  hmrClient.initializeHMR();
} else {
  clientLogger.debug("📦 Production mode - HMR disabled");
}

const chunkLoader = new lazyLoader.LazyChunkLoader(chunkManifest);

/**
 * Module loader that uses lazy chunk loading
 * Components are loaded on-demand via dynamic imports
 *
 * A failed load is returned to the RSC client, which records it on the chunk;
 * the error boundary that renders the chunk reports it.
 */
const customModuleLoader: ModuleLoader = async (id: string, name: string) => {
  loaderLogger.debug(`📦 Request: id="${id}", name="${name}"`);

  return await chunkLoader.loadModule(id, name);
};

// The objects React renders as components: memo, forwardRef and lazy.
const COMPONENT_OBJECT_TYPES: ReadonlySet<symbol> = new Set([
  Symbol.for("react.memo"),
  Symbol.for("react.forward_ref"),
  Symbol.for("react.lazy"),
]);

/**
 * Whether a loaded export can be rendered as a component: a function, or one
 * of React's component objects.
 */
const isComponentType = (
  value: unknown,
): value is React.ComponentType<Record<string, unknown>> =>
  typeof value === "function" ||
  (typeof value === "object" && value !== null && "$$typeof" in value &&
    typeof value.$$typeof === "symbol" &&
    COMPONENT_OBJECT_TYPES.has(value.$$typeof));

/**
 * Lazy RSC promise - created only once when first accessed
 */
let rscPromiseCache: Promise<React.ComponentType> | null = null;

function getRSCPromise() {
  rscClientLogger.with({
    cached: !!rscPromiseCache,
  }).debug("🔄 getRSCPromise called, cache exists");

  if (!rscPromiseCache) {
    rscClientLogger.debug("🔄 Creating RSC promise (first time)...");
    rscClientLogger.debug("🔄 Fetching /rsc with custom module loader");

    // Create the fetch promise ONCE and reuse it
    const fetchPromise = fetch(buildRscUrl(Date.now()));

    rscPromiseCache = client.createFromFetch(fetchPromise, customModuleLoader);

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
larouxGlobals.__clearRSCCache__ = clearRSCCache;

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
  const RSCTreeRoot = React.use(getRSCPromise());

  rscClientLogger.debug("⚛️  RSCTreeRoot component received");

  // Render the RSCTreeRoot component - it will initialize the tree each time it renders
  // If it encounters a PENDING chunk, it throws, React Suspense catches it,
  // and when the chunk resolves, React automatically retries rendering RSCTreeRoot
  return React.createElement(RSCTreeRoot, null);
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
    const rootElement = globalThis.document.getElementById("root");
    if (!rootElement) {
      bootstrapLogger.error("❌ Root element not found during navigation!");
      return;
    }

    reactRoot = ReactDOMClient.createRoot(rootElement);
  }

  if (!reactRoot) {
    bootstrapLogger.warn("⚠️  React root not initialized, cannot refresh");
    return;
  }

  // Re-render with fresh RSC data (cache was cleared)
  // Use null fallback to allow server-rendered Loading components to show through
  reactRoot.render(
    React.createElement(
      errorBoundary.ErrorBoundary,
      null,
      React.createElement(
        React.Suspense,
        { fallback: null },
        React.createElement(RSCRoot, null),
      ),
    ),
  );

  bootstrapLogger.debug("✅ RSC root refreshed");
}

// Export refresh function for HMR
larouxGlobals.__refreshRSCRoot__ = refreshRSCRoot;

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
        cachedRscPayload = client.getEmbeddedPayload();
        if (!cachedRscPayload) {
          throw new Error("RSC payload not found for chunk-based hydration");
        }
        bootstrapLogger.debug(
          `📦 Loaded RSC payload with ${cachedRscPayload.length} chunks`,
        );
      }

      // Parse the element from the specific chunk
      const parsedElement = await client.createElementFromChunk(
        cachedRscPayload,
        parseInt(chunkId, 10),
        customModuleLoader,
      );

      element = React.createElement(
        errorBoundary.ErrorBoundary,
        null,
        parsedElement,
      );
    } else {
      // Fallback: use simple JSON props (no children/complex props support)
      const props = JSON.parse(propsJson);
      const Component = await customModuleLoader(moduleId, exportName);
      if (!isComponentType(Component)) {
        throw new Error(
          `hydrate island ${moduleId}#${exportName}: the export is ${
            Component === null ? "null" : `a ${typeof Component}`
          }, not a component; check that data-export-name names an exported component`,
        );
      }
      element = React.createElement(
        errorBoundary.ErrorBoundary,
        null,
        React.createElement(Component, { ...props }),
      );
    }

    // Use hydrateRoot since we have server-rendered content
    const root = ReactDOMClient.hydrateRoot(container, element, {
      onRecoverableError: (error) => {
        bootstrapLogger.with({
          error,
        }).warn(`⚠️ Island hydration mismatch (${moduleId})`);
      },
    });

    islandRoots.set(container, root);
    bootstrapLogger.debug(`✅ Island hydrated: ${moduleId}#${exportName}`);
  } catch (err) {
    bootstrapLogger.with({
      error: err,
    }).error(`❌ Failed to hydrate island ${moduleId}`);
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
  const islands = globalThis.document.querySelectorAll(
    "[data-client-component]",
  );

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
      bootstrapLogger.with({ error: err }).warn(
        "⚠️ Error unmounting island root",
      );
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
async function hydrateFromStreamingOptimal(
  rootElement: HTMLElement,
): Promise<void> {
  bootstrapLogger.debug(
    "🚀 Starting streaming-optimal hydration...",
  );

  // Get inline RSC payload (for potential future optimization)
  const inlinePayload = client.getEmbeddedPayload();
  if (inlinePayload) {
    bootstrapLogger.debug(
      `📦 Found ${inlinePayload.length} inline RSC chunks`,
    );
  }

  // Start /rsc fetch - required for component tree
  bootstrapLogger.debug("📡 Starting /rsc fetch...");
  const rscFetchPromise = fetch(buildRscUrl(Date.now()));

  // Create hybrid RSC tree promise
  const treePromise = client.createHybridRSCTree(
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
  const root = ReactDOMClient.hydrateRoot(
    rootElement,
    React.createElement(
      errorBoundary.ErrorBoundary,
      null,
      React.createElement(RSCTreeRoot, null),
    ),
    {
      onRecoverableError: (error) => {
        // Hydration mismatches are expected for async components
        bootstrapLogger.with({
          error,
        }).debug("⚠️ Hydration mismatch (expected for async)");
      },
    },
  );

  // Store root for HMR and navigation
  reactRoot = root;
  isSSRHydration = true;

  bootstrapLogger.info(
    "✅ Streaming-optimal hydration complete",
  );
}

/**
 * Bootstrap in CSR mode (fallback)
 */
function bootstrapCSR(rootElement: HTMLElement) {
  reactRoot = ReactDOMClient.createRoot(rootElement);
  reactRoot.render(
    React.createElement(
      errorBoundary.ErrorBoundary,
      null,
      React.createElement(
        React.Suspense,
        { fallback: null },
        React.createElement(RSCRoot, null),
      ),
    ),
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
  bootstrapLogger.with({
    readyState: globalThis.document.readyState,
  }).debug("🚀 Document ready state");

  const rootElement = globalThis.document.getElementById("root");
  bootstrapLogger.with({ found: !!rootElement }).debug(
    "🚀 Root element found",
  );

  if (!rootElement) {
    bootstrapLogger.error("❌ Root element not found!");
    return;
  }

  // Check hydration mode:
  // 1. Streaming-optimal (sync inline + async via /rsc - recommended)
  // 2. Embedded RSC payload (islands hydration)
  // 3. CSR mode (fetch /rsc)
  const isStreamingOptimal = client.hasStreamingOptimalRSC();
  isSSRHydration = isStreamingOptimal || client.hasEmbeddedPayload();

  if (isStreamingOptimal) {
    bootstrapLogger.debug(
      "🚀 Streaming-optimal mode detected, using hybrid hydration...",
    );

    // Use streaming-optimal: sync chunks inline + async via /rsc. A failure
    // is handled here, once, by falling back to client rendering.
    hydrateFromStreamingOptimal(rootElement).catch((error) => {
      bootstrapLogger.with({ error }).error(
        "❌ Streaming-optimal hydration failed, falling back to CSR",
      );

      try {
        bootstrapCSR(rootElement);
      } catch (csrError) {
        bootstrapLogger.with({ error: csrError }).error("❌ CSR error");
      }
    });
  } else if (client.hasEmbeddedPayload()) {
    bootstrapLogger.debug(
      "🏝️ SSR content detected, using islands hydration mode...",
    );

    // Use islands architecture: only hydrate client components
    // Server-rendered static content doesn't need React
    hydrateIslands().catch((err) => {
      bootstrapLogger.with({
        error: err,
      }).error("❌ Islands hydration failed, falling back to CSR");

      // Fall back to CSR if hydration fails
      // Keep SSR content visible - don't clear the DOM
      isSSRHydration = false;
      cleanupIslandRoots();

      // Use createRoot to take over the existing DOM without clearing it
      // This preserves the SSR content while enabling client-side updates
      reactRoot = ReactDOMClient.createRoot(rootElement);
      reactRoot.render(
        React.createElement(
          errorBoundary.ErrorBoundary,
          null,
          React.createElement(
            React.Suspense,
            { fallback: null },
            React.createElement(RSCRoot, null),
          ),
        ),
      );

      bootstrapLogger.info(
        "✅ React app mounted with CSR (hydration fallback, SSR content preserved)",
      );
    });
  } else {
    bootstrapLogger.debug("🚀 No SSR content, using CSR mode...");

    try {
      // Create React root and store it globally for HMR
      reactRoot = ReactDOMClient.createRoot(rootElement);
      bootstrapLogger.debug("🚀 React root created");

      // Render with ErrorBoundary and Suspense to handle async RSC loading
      // Use null fallback to allow server-rendered Loading components to show through
      reactRoot.render(
        React.createElement(
          errorBoundary.ErrorBoundary,
          null,
          React.createElement(
            React.Suspense,
            { fallback: null },
            React.createElement(RSCRoot, null),
          ),
        ),
      );

      bootstrapLogger.info("✅ React app mounted with RSC");
    } catch (err) {
      bootstrapLogger.with({ error: err }).error("❌ Bootstrap error");

      // Show error to user
      // The message is set as text: it can echo server or payload content.
      rootElement.innerHTML = `
        <div class="error">
          <h2>⚠️ Bootstrap Error</h2>
          <pre></pre>
          <button onclick="globalThis.location.reload()">Reload Page</button>
        </div>
      `;
      const messageElement = rootElement.querySelector("pre");
      if (messageElement !== null) {
        messageElement.textContent = err instanceof Error
          ? err.message
          : String(err);
      }
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
      React.startTransition(() => {
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
      React.startTransition(() => {
        clearRSCCache();
        refreshRSCRoot();
      });
    });

    clientLogger.debug("✅ Navigation listeners registered");
  }
}

// Start the app when DOM is ready
clientLogger.with({
  readyState: globalThis.document.readyState,
}).debug("🎬 Checking document ready state");

if (globalThis.document.readyState === "loading") {
  clientLogger.debug(
    "🎬 Document still loading, adding DOMContentLoaded listener",
  );
  globalThis.document.addEventListener("DOMContentLoaded", () => {
    clientLogger.debug("🎬 DOMContentLoaded event fired");
    bootstrap();
    setupNavigationListeners();
  });
} else {
  clientLogger.debug("🎬 Document already ready, bootstrapping immediately");
  bootstrap();
  setupNavigationListeners();
}
