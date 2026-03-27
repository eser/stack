// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * HTTP Server for React Server Components
 * Handles routing for HTML, RSC payloads, static assets, and Server Actions
 */

import * as logging from "@eser/logging";
import {
  generateInlineBootstrapScript,
  renderApp,
  renderRSCResponse,
  renderSSR,
  serializeRSCPayload,
} from "../adapters/react/mod.ts";
import {
  createHtmlShell,
  createStreamingHtmlShellEnd,
  createStreamingHtmlShellStart,
} from "./html-shell.ts";
import { NotFoundError, runtime } from "@eser/standards/cross-runtime";
import { contentType } from "@std/media-types";
import type { AppConfig } from "../config/load-config.ts";
import type { HMRManager } from "../domain/hmr-manager.ts";
import type { Bundler } from "@eser/laroux-bundler";
import type { ApiRouteHandler } from "../domain/route-dispatcher.ts";
import type { MiddlewareDispatcher } from "../domain/middleware-dispatcher.ts";
import type { Renderer } from "../domain/renderer.ts";
import type { HtmlShellBuilder } from "../domain/html-shell.ts";
import {
  createRateLimiter,
  type RateLimitConfig,
} from "@eser/http/middlewares/rate-limiter";
import type { AppComponents } from "../main.ts";
import {
  clearServerRequestContext,
  setServerRequestContext,
} from "../domain/request-context.ts";

// Loggers
const serverLogger = logging.logger.getLogger(["laroux-server", "server"]);
const rscLogger = logging.logger.getLogger(["laroux-server", "rsc"]);

/**
 * Options for creating a streaming-optimal response
 */
type StreamingOptimalOptions = {
  element: React.ReactElement;
  // deno-lint-ignore no-explicit-any
  moduleMap: Record<string, any>;
  shellOptions: {
    // deno-lint-ignore no-explicit-any
    chunkManifest: any;
    entrypoint: string;
    fontPreloads?: string[];
    fontCSS?: string;
    criticalPageCSS?: string;
    criticalUniversalCSS?: string;
    deferredCSSPath?: string;
    clientModules?: string[];
  };
};

/**
 * Create a streaming Response for streaming-optimal mode
 */
function createStreamingOptimalResponse(
  options: StreamingOptimalOptions,
): Response {
  const { element, moduleMap, shellOptions } = options;
  const encoder = new TextEncoder();

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    try {
      const shellStart = createStreamingHtmlShellStart(shellOptions);
      await writer.write(encoder.encode(shellStart));

      const ssrResult = await renderSSR(element, moduleMap, {
        streamMode: "streaming-classic",
      });
      await writer.write(encoder.encode(ssrResult.html));

      const bootstrapScript = generateInlineBootstrapScript();
      await writer.write(encoder.encode(bootstrapScript));

      const syncChunks = ssrResult.rscPayload.filter((chunk) => {
        if (
          chunk.value &&
          typeof chunk.value === "object" &&
          (chunk.value as Record<string, unknown>)["__rsc_pending"]
        ) {
          return false;
        }
        return true;
      });

      if (syncChunks.length > 0) {
        serverLogger.debug(
          `Embedding ${syncChunks.length} sync RSC chunks inline`,
        );
        const inlinePayload =
          `<script id="__RSC_PAYLOAD__" type="application/json">${
            JSON.stringify(syncChunks).replace(/<\/script/gi, "<\\/script")
          }</script>\n`;
        await writer.write(encoder.encode(inlinePayload));
      }

      const manifestScript = shellOptions.chunkManifest
        ? `<script>globalThis.__CHUNK_MANIFEST__ = ${
          JSON.stringify(shellOptions.chunkManifest)
        };</script>\n`
        : "";
      await writer.write(encoder.encode(manifestScript));

      const cacheBuster = shellOptions.chunkManifest?.buildId
        ? `?v=${shellOptions.chunkManifest.buildId}`
        : `?v=${Date.now()}`;
      const clientScript = `<script type="module" src="${
        shellOptions.entrypoint ?? "/client.js"
      }${cacheBuster}"></script>\n`;
      await writer.write(encoder.encode(clientScript));

      const shellEnd = createStreamingHtmlShellEnd(shellOptions);
      await writer.write(encoder.encode(shellEnd));

      await writer.close();
    } catch (error) {
      serverLogger.error("Streaming optimal error:", error);
      try {
        await writer.abort(error);
      } catch {
        // Ignore abort errors
      }
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}

// Constants
const CACHE_CONTROL_STATIC = "public, no-cache, must-revalidate";
const CACHE_CONTROL_DYNAMIC = "no-cache, no-store, must-revalidate";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function withSecurityHeaders(
  response: Response,
  additionalHeaders?: Record<string, string>,
): Response {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }

  if (additionalHeaders) {
    for (const [key, value] of Object.entries(additionalHeaders)) {
      headers.set(key, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Server dependencies container
 */
export type ServerDependencies = {
  config: AppConfig;
  bundler: Bundler;
  getApp: (pathname: string) => Promise<AppComponents>;
  buildId: string;
  hmrManager?: HMRManager | null;
  apiHandler?: ApiRouteHandler;
  middlewareDispatcher?: MiddlewareDispatcher;
  renderer?: Renderer;
  htmlShell?: HtmlShellBuilder;
  rateLimitConfig?: RateLimitConfig | false;
};

async function serveStatic(
  config: AppConfig,
  pathname: string,
): Promise<Response | null> {
  try {
    const relativePath = pathname.replace(/^\/dist\//, "");
    const filePath = runtime.path.resolve(config.distDir, relativePath);

    if (!filePath.startsWith(config.distDir)) {
      serverLogger.warn(`Path traversal attempt blocked: ${pathname}`);
      return new Response("Forbidden", { status: 403 });
    }

    const fileInfo = await runtime.fs.stat(filePath);
    const lastModified = fileInfo.mtime?.toUTCString() ??
      new Date().toUTCString();
    const etag = `"${fileInfo.size}-${fileInfo.mtime?.getTime() ?? 0}"`;

    const file = await runtime.fs.readFile(filePath);
    const ext = runtime.path.extname(filePath);
    const mimeType = contentType(ext) ?? "application/octet-stream";

    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Cache-Control": CACHE_CONTROL_STATIC,
      "Last-Modified": lastModified,
      "ETag": etag,
    };

    if (ext === ".js") {
      const mapFilePath = `${filePath}.map`;
      try {
        await runtime.fs.stat(mapFilePath);
        const mapFileName = runtime.path.basename(mapFilePath);
        headers["SourceMap"] = mapFileName;
      } catch {
        // No source map file exists
      }
    }

    return new Response(file as BodyInit, { headers });
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      (error instanceof Error && error.name === "NotFoundError")
    ) {
      return null;
    }
    throw error;
  }
}

async function servePublicAsset(
  config: AppConfig,
  pathname: string,
): Promise<Response | null> {
  try {
    const relativePath = pathname.replace(/^\//, "");
    const filePath = runtime.path.resolve(
      config.projectRoot,
      "public",
      relativePath,
    );
    const publicDir = runtime.path.resolve(config.projectRoot, "public");

    if (!filePath.startsWith(publicDir)) {
      serverLogger.warn(`Path traversal attempt blocked: ${pathname}`);
      return new Response("Forbidden", { status: 403 });
    }

    const fileInfo = await runtime.fs.stat(filePath);
    const lastModified = fileInfo.mtime?.toUTCString() ??
      new Date().toUTCString();
    const etag = `"${fileInfo.size}-${fileInfo.mtime?.getTime() ?? 0}"`;

    const file = await runtime.fs.readFile(filePath);
    const ext = runtime.path.extname(filePath);
    const mimeType = contentType(ext) ?? "application/octet-stream";

    return new Response(file as BodyInit, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": CACHE_CONTROL_STATIC,
        "Last-Modified": lastModified,
        "ETag": etag,
      },
    });
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      (error instanceof Error && error.name === "NotFoundError")
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Create request handler with injected dependencies
 */
export function createHandler(deps: ServerDependencies) {
  const rateLimiter = deps.rateLimitConfig !== false
    ? createRateLimiter(deps.rateLimitConfig ?? {})
    : null;

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    let { pathname } = url;
    const {
      config,
      bundler,
      getApp,
      buildId: _buildId,
      hmrManager,
      apiHandler,
      middlewareDispatcher,
    } = deps;

    serverLogger.debug(`${req.method} ${pathname}`);

    const processRequest = async (): Promise<Response> => {
      // Route: /hmr -> WebSocket for HMR
      if (pathname === "/hmr" && hmrManager) {
        if (req.headers.get("upgrade") !== "websocket") {
          return new Response("Expected WebSocket", { status: 426 });
        }

        const { socket, response } = Deno.upgradeWebSocket(req);
        hmrManager.handleConnection(socket);
        return response;
      }

      // Rate limiting check
      if (rateLimiter) {
        const rateLimitResponse = rateLimiter.check(req, pathname);
        if (rateLimitResponse) {
          return withSecurityHeaders(rateLimitResponse);
        }
      }

      // Run middleware
      if (middlewareDispatcher) {
        const { result, finalPathname } = await middlewareDispatcher.runProxies(
          req,
          pathname,
        );

        if (result.type === "response") {
          return result.response;
        }

        if (result.type === "redirect") {
          return Response.redirect(result.url, result.status ?? 302);
        }

        pathname = finalPathname;
      }

      // Route: File-based API routes
      if (apiHandler) {
        const apiResponse = await apiHandler.handleRequest(req, pathname);
        if (apiResponse) {
          return apiResponse;
        }
      }

      // Route: / -> HTML shell (with optional SSR)
      if (pathname === "/" || pathname === "/index.html") {
        return await handlePageRequest(req, "/", deps);
      }

      // Route: /_rsc POST with RSC-Action header -> Server Action (React 19 native)
      if (pathname === "/_rsc" && req.method === "POST") {
        const actionId = req.headers.get("RSC-Action");

        if (actionId) {
          rscLogger.debug(`RSC Server Action invoked: ${actionId}`);

          try {
            // Parse args based on content type
            const contentType = req.headers.get("Content-Type") ?? "";
            let args: unknown[];

            if (contentType.includes("multipart/form-data")) {
              // FormData - pass as first arg
              args = [await req.formData()];
            } else {
              // JSON args
              args = await req.json();
            }

            // Parse action ID: "path/to/file#exportName"
            const [modulePath, exportName] = actionId.split("#");
            if (!modulePath || !exportName) {
              return new Response(
                JSON.stringify({ error: "Invalid action ID format" }),
                {
                  status: 400,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            // Import the action module dynamically
            // Actions are in dist/server/<modulePath>.js
            const actionModulePath = runtime.path.resolve(
              config.distDir,
              "server",
              `${modulePath}.js`,
            );

            rscLogger.debug(`Loading action module: ${actionModulePath}`);
            // Assign to variable first to prevent JSR from rewriting the import path
            const actionImportUrl = `file://${actionModulePath}`;
            const actionModule = await import(actionImportUrl);

            const actionFn = actionModule[exportName];
            if (typeof actionFn !== "function") {
              rscLogger.error(
                `Action not found: ${exportName} in ${modulePath}`,
              );
              return new Response(
                JSON.stringify({ error: `Action not found: ${actionId}` }),
                {
                  status: 404,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            // Call the action
            const result = await actionFn(...args);

            rscLogger.debug(`Action ${actionId} completed successfully`);

            // Return result as JSON (can enhance to full RSC encoding later)
            return new Response(JSON.stringify(result), {
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": CACHE_CONTROL_DYNAMIC,
              },
            });
          } catch (error) {
            rscLogger.error(
              `RSC Server Action failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return new Response(
              JSON.stringify({ error: "Server action failed" }),
              {
                status: 500,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
        }
      }

      // Route: /rsc -> React Server Components payload
      if (pathname === "/rsc") {
        rscLogger.debug("Rendering RSC payload...");

        const bundle = await bundler.getBundle();
        const requestPathname = url.searchParams.get("pathname") ?? "/";
        const { Layout, Page, params } = await getApp(requestPathname);
        const localeParam = url.searchParams.get("locale");
        const cookieHeader = req.headers.get("cookie");
        const host = req.headers.get("host") ?? "localhost";

        setServerRequestContext(cookieHeader);

        try {
          const response = await renderRSCResponse(
            config,
            renderApp(Layout, Page, {
              pathname: requestPathname,
              params,
              requestContext: { cookieHeader, host, localeParam },
            }),
            bundle.moduleMap,
          );
          return response;
        } finally {
          clearServerRequestContext();
        }
      }

      // Route: Runtime bundle endpoint
      if (pathname === config.internal.runtimeBundleEndpoint) {
        const bundle = await bundler.getBundle();
        if (bundle.clientCode !== null) {
          serverLogger.debug("Serving current bundle...");
          return new Response(bundle.clientCode, {
            headers: {
              "Content-Type": "application/javascript; charset=utf-8",
              "Cache-Control": CACHE_CONTROL_DYNAMIC,
            },
          });
        }
        return new Response("Not Found", { status: 404 });
      }

      // Route: Runtime module map endpoint
      if (pathname === config.internal.runtimeModuleMapEndpoint) {
        const bundle = await bundler.getBundle();
        if (bundle.clientCode !== null) {
          return new Response(JSON.stringify(bundle.moduleMap, null, 2), {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": CACHE_CONTROL_DYNAMIC,
            },
          });
        }
        return new Response("Not Found", { status: 404 });
      }

      // Note: Old /action endpoint removed - use /_rsc with RSC-Action header instead
      // This is React 19's native server actions mechanism

      // Route: /dist/* -> Static assets
      if (pathname.startsWith("/dist/")) {
        const staticResponse = await serveStatic(config, pathname);
        if (staticResponse) {
          return staticResponse;
        }
      }

      // Route: Clean URLs for client assets
      if (
        pathname.startsWith("/fonts/") ||
        pathname.startsWith("/chunk-") ||
        pathname.startsWith("/_bundle_src/") ||
        pathname === "/styles.css" ||
        pathname === "/styles.deferred.css" ||
        pathname === "/client.js" ||
        pathname === "/client.js.map" ||
        pathname.endsWith(".js.map")
      ) {
        const clientAssetPath = `/dist/client${pathname}`;
        const staticResponse = await serveStatic(config, clientAssetPath);
        if (staticResponse) {
          return staticResponse;
        }
      }

      // Route: Public assets
      if (
        pathname !== "/" && !pathname.startsWith("/dist/") &&
        !pathname.startsWith("/rsc") && !pathname.startsWith("/action")
      ) {
        const distResponse = await serveStatic(config, `/dist${pathname}`);
        if (distResponse) {
          return distResponse;
        }

        const publicResponse = await servePublicAsset(config, pathname);
        if (publicResponse) {
          return publicResponse;
        }
      }

      // Route: /health -> Health check
      if (pathname === "/health") {
        return new Response(
          JSON.stringify({ status: "ok", timestamp: Date.now() }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Fallback: Serve HTML shell for all other routes
      return await handlePageRequest(req, pathname, deps);
    };

    try {
      const response = await processRequest();
      if (response.headers.get("upgrade") === "websocket") {
        return response;
      }
      return withSecurityHeaders(response);
    } catch (error) {
      serverLogger.error(
        `Server error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      // Don't expose error details to client - only log server-side
      return withSecurityHeaders(
        new Response(
          JSON.stringify({
            error: "Internal Server Error",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }
  };
}

/**
 * Handle page request with SSR
 */
async function handlePageRequest(
  req: Request,
  pathname: string,
  deps: ServerDependencies,
): Promise<Response> {
  const { config, bundler, getApp, buildId } = deps;
  const bundle = await bundler.getBundle();

  const manifest = bundle.chunkManifest;
  manifest.buildId = buildId;
  manifest.logLevel = config.logLevel;

  // Load optimized font data
  let fontPreloads: string[] | undefined;
  let fontCSS: string | undefined;

  try {
    const fontPreloadsPath = runtime.path.resolve(
      config.distDir,
      "client",
      "font-preloads.json",
    );
    const fontCssPath = runtime.path.resolve(
      config.distDir,
      "client",
      "fonts.css",
    );

    const fontPreloadsContent = await runtime.fs.readTextFile(fontPreloadsPath);
    fontPreloads = JSON.parse(fontPreloadsContent);
    fontCSS = await runtime.fs.readTextFile(fontCssPath);
  } catch {
    serverLogger.debug("Font optimization data not found, using fallback");
  }

  // Load critical CSS
  let criticalPageCSS: string | undefined;
  let criticalUniversalCSS: string | undefined;
  let deferredCSSPath: string | undefined;

  try {
    const criticalCssPath = runtime.path.resolve(
      config.distDir,
      "client",
      "styles.critical.css",
    );
    criticalPageCSS = await runtime.fs.readTextFile(criticalCssPath);
    deferredCSSPath = "/styles.deferred.css";
  } catch {
    serverLogger.debug("Critical page CSS not found, using defaults");
  }

  try {
    const universalCssPath = runtime.path.resolve(
      config.distDir,
      "client",
      "styles.universal.css",
    );
    criticalUniversalCSS = await runtime.fs.readTextFile(universalCssPath);
  } catch {
    serverLogger.debug("Critical universal CSS not found, using defaults");
  }

  // Check if SSR is enabled
  const ssrMode = config.ssr?.mode ?? "disabled";
  const ssrEnabled = ssrMode !== "disabled" &&
    (ssrMode === "always" ||
      (ssrMode === "production-only" && !config.mode.isWatch));

  let ssrContent: string | undefined;
  let rscPayload: string | undefined;
  let clientModules: string[] | undefined;

  if (ssrEnabled) {
    try {
      serverLogger.debug(`SSR rendering page: ${pathname}`);

      const { Layout, Page, params } = await getApp(pathname);
      const cookieHeader = req.headers.get("cookie");
      const host = req.headers.get("host") ?? "localhost";

      setServerRequestContext(cookieHeader);

      try {
        const rscComponent = renderApp(Layout, Page, {
          pathname,
          params,
          requestContext: { cookieHeader, host },
        });

        const streamMode = config.ssr?.streamMode ?? "streaming-optimal";

        if (streamMode === "streaming-optimal") {
          serverLogger.debug(
            `Using streaming-optimal mode for SSR: ${pathname}`,
          );
          return createStreamingOptimalResponse({
            element: rscComponent,
            moduleMap: bundle.moduleMap,
            shellOptions: {
              chunkManifest: manifest,
              entrypoint: bundle.entrypoint,
              fontPreloads,
              fontCSS,
              criticalPageCSS,
              criticalUniversalCSS,
              deferredCSSPath,
              clientModules: [],
            },
          });
        }

        const ssrResult = await renderSSR(
          rscComponent,
          bundle.moduleMap,
          { streamMode },
        );

        ssrContent = ssrResult.html;
        if (streamMode === "await-all") {
          rscPayload = serializeRSCPayload(ssrResult.rscPayload);
        }
        clientModules = ssrResult.clientModules;

        serverLogger.debug(
          `SSR complete for ${pathname}: ${ssrContent.length} bytes HTML`,
        );
      } finally {
        clearServerRequestContext();
      }
    } catch (error) {
      serverLogger.error(
        `SSR rendering failed for ${pathname}, falling back to CSR:`,
        error,
      );
      ssrContent = undefined;
      rscPayload = undefined;
      clientModules = undefined;
    }
  }

  const html = createHtmlShell({
    chunkManifest: manifest,
    entrypoint: bundle.entrypoint,
    fontPreloads,
    fontCSS,
    criticalPageCSS,
    criticalUniversalCSS,
    deferredCSSPath,
    ssrContent,
    rscPayload,
    clientModules,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

/**
 * Start the HTTP server
 */
export function startHTTPServer(
  deps: ServerDependencies,
  onListen?: () => void,
): void {
  const { config } = deps;
  const handler = createHandler(deps);

  Deno.serve({
    port: config.server.port,
    onListen: onListen ?? (() => {}),
  }, handler);
}
