// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * HTTP Server for React Server Components
 * Handles routing for HTML, RSC payloads, static assets, and Server Actions
 */

import * as scriptJson from "../adapters/react/script-json.ts";
import * as logging from "@eserstack/logging";
import * as react from "../adapters/react/mod.ts";
import * as htmlShell from "./html-shell.ts";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as mediaTypes from "@std/media-types";
import * as pathContainment from "./path-containment.ts";
import * as actionGuard from "./action-guard.ts";
import type { AppConfig } from "../config/load-config.ts";
import type { HMRManager } from "../domain/hmr-manager.ts";
import type { Bundler } from "@eserstack/laroux-bundler";
import type { ApiRouteHandler } from "../domain/route-dispatcher.ts";
import type { MiddlewareDispatcher } from "../domain/middleware-dispatcher.ts";
import type { Renderer } from "../domain/renderer.ts";
import type { HtmlShellBuilder } from "../domain/html-shell.ts";
import * as http from "@eserstack/http";
import type { RateLimitConfig } from "@eserstack/http/middlewares/rate-limiter";
import type { AppComponents } from "../domain/server-modules.ts";
import * as buildModule from "../domain/build-module.ts";

// Loggers
const serverLogger = logging.logger.getLogger(["laroux-server", "server"]);
const rscLogger = logging.logger.getLogger(["laroux-server", "rsc"]);

/**
 * Options for creating a streaming-optimal response
 */
type StreamingOptimalOptions = {
  element: React.ReactElement;
  // The module map passes through to the renderer, which owns its shape.
  // deno-lint-ignore no-explicit-any
  moduleMap: Record<string, any>;
  shellOptions: {
    // The manifest passes through to the HTML shell, which owns its shape.
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
      const shellStart = htmlShell.createStreamingHtmlShellStart(shellOptions);
      await writer.write(encoder.encode(shellStart));

      const ssrResult = await react.renderSSR(element, moduleMap, {
        streamMode: "streaming-classic",
      });
      await writer.write(encoder.encode(ssrResult.html));

      const bootstrapScript = react.generateInlineBootstrapScript();
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
            scriptJson.escapeJsonForScript(JSON.stringify(syncChunks))
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

      const shellEnd = htmlShell.createStreamingHtmlShellEnd(shellOptions);
      await writer.write(encoder.encode(shellEnd));

      await writer.close();
    } catch (error) {
      serverLogger.with({ error }).error(
        "stream the page in streaming-optimal mode; aborting the response",
      );
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
/** A JSON error response with the given status. */
function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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
  /**
   * Id of the build being served; it changes after each dev rebuild. Server
   * action modules are imported with it, so a rebuilt action loads fresh.
   */
  getBuildId: () => string;
  hmrManager?: HMRManager | null;
  apiHandler?: ApiRouteHandler;
  middlewareDispatcher?: MiddlewareDispatcher;
  renderer?: Renderer;
  htmlShell?: HtmlShellBuilder;
  rateLimitConfig?: RateLimitConfig | false;
};

/**
 * Top-level entries of distDir that are never served: server/ holds the
 * bundled server components, server actions and their manifests, and the
 * others are build inputs that laroux-bundler writes (its VIRTUAL_SRC_DIR,
 * BOOTSTRAP_COPY_DIR and transform manifest). Browser assets live in client/
 * and at the top level, next to the copied public assets.
 */
const INTERNAL_DIST_ENTRIES: ReadonlySet<string> = new Set([
  "server",
  "_bundle_src",
  "_laroux-react",
  "_client-entry.tsx",
  "transform-manifest.json",
]);

/**
 * Whether a resolved path inside distDir points into an internal entry. The
 * name is compared in lower case and without trailing dots and spaces,
 * because a case-insensitive file system (macOS, Windows) finds "SERVER" as
 * "server", and Windows drops a trailing "." or " ".
 */
function isInternalDistPath(distDir: string, filePath: string): boolean {
  const relativePath = crossRuntime.runtime.path.relative(
    crossRuntime.runtime.path.resolve(distDir),
    filePath,
  );
  const topLevel = relativePath.split(/[\\/]/)[0] ?? "";
  return INTERNAL_DIST_ENTRIES.has(
    topLevel.toLowerCase().replace(/[. ]+$/, ""),
  );
}

async function serveStatic(
  config: AppConfig,
  pathname: string,
): Promise<Response | null> {
  try {
    const relativePath = pathname.replace(/^\/dist\//, "");
    const filePath = pathContainment.resolveWithin(
      config.distDir,
      relativePath,
    );

    if (filePath === null) {
      serverLogger.warn(`Path traversal attempt blocked: ${pathname}`);
      return new Response("Forbidden", { status: 403 });
    }

    // Answered like a missing file, so the response does not confirm that
    // server code exists at that path.
    if (isInternalDistPath(config.distDir, filePath)) {
      return null;
    }

    const fileInfo = await crossRuntime.runtime.fs.stat(filePath);
    const lastModified = fileInfo.mtime?.toUTCString() ??
      new Date().toUTCString();
    const etag = `"${fileInfo.size}-${fileInfo.mtime?.getTime() ?? 0}"`;

    const file = await crossRuntime.runtime.fs.readFile(filePath);
    const ext = crossRuntime.runtime.path.extname(filePath);
    const mimeType = mediaTypes.contentType(ext) ?? "application/octet-stream";

    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Cache-Control": CACHE_CONTROL_STATIC,
      "Last-Modified": lastModified,
      "ETag": etag,
    };

    if (ext === ".js") {
      const mapFilePath = `${filePath}.map`;
      try {
        await crossRuntime.runtime.fs.stat(mapFilePath);
        const mapFileName = crossRuntime.runtime.path.basename(mapFilePath);
        headers["SourceMap"] = mapFileName;
      } catch {
        // No source map file exists
      }
    }

    return new Response(file as BodyInit, { headers });
  } catch (error) {
    if (
      error instanceof crossRuntime.NotFoundError ||
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
    const publicDir = crossRuntime.runtime.path.resolve(
      config.projectRoot,
      "public",
    );
    const filePath = pathContainment.resolveWithin(publicDir, relativePath);

    if (filePath === null) {
      serverLogger.warn(`Path traversal attempt blocked: ${pathname}`);
      return new Response("Forbidden", { status: 403 });
    }

    const fileInfo = await crossRuntime.runtime.fs.stat(filePath);
    const lastModified = fileInfo.mtime?.toUTCString() ??
      new Date().toUTCString();
    const etag = `"${fileInfo.size}-${fileInfo.mtime?.getTime() ?? 0}"`;

    const file = await crossRuntime.runtime.fs.readFile(filePath);
    const ext = crossRuntime.runtime.path.extname(filePath);
    const mimeType = mediaTypes.contentType(ext) ?? "application/octet-stream";

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
      error instanceof crossRuntime.NotFoundError ||
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
  // The actions manifest of the build being served, read once per build id.
  let actionManifest:
    | { buildId: string; manifest: Promise<actionGuard.ActionManifest> }
    | null = null;
  const getActionManifest = (
    serverDir: string,
    buildId: string,
  ): Promise<actionGuard.ActionManifest> => {
    if (actionManifest === null || actionManifest.buildId !== buildId) {
      actionManifest = {
        buildId,
        manifest: actionGuard.readActionManifest(serverDir),
      };
    }
    return actionManifest.manifest;
  };

  const rateLimiter = deps.rateLimitConfig !== false
    // Key on the socket peer. Forwarded headers are believed only from a
    // trusted proxy (loopback by default), so a direct client can neither
    // exempt itself with a forged X-Forwarded-For nor share one bucket with
    // every other direct client.
    ? http.middlewares.rateLimiter.createRateLimiter({
      trustProxy: true,
      ...(deps.rateLimitConfig ?? {}),
    })
    : null;

  return async (
    req: Request,
    info?: crossRuntime.ServeHandlerInfo,
  ): Promise<Response> => {
    const url = new URL(req.url);
    let { pathname } = url;
    const {
      config,
      bundler,
      getApp,
      getBuildId,
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

        const { socket, response } = crossRuntime.runtime.http
          .upgradeWebSocket(req);
        hmrManager.handleConnection(socket);
        return response;
      }

      // Rate limiting check
      if (rateLimiter) {
        // Keyed on the socket peer from runtime.http, not on client headers.
        const rateLimitResponse = rateLimiter.check(
          req,
          pathname,
          info?.remoteAddr ?? null,
        );
        if (rateLimitResponse) {
          return withSecurityHeaders(rateLimitResponse);
        }
      }

      // GET /rsc renders the page its pathname parameter names. The path is
      // normalized through a URL, so "/x/../admin" is "/admin" both for the
      // proxies and for the render.
      let rscPagePathname: string | null = null;
      if (pathname === "/rsc") {
        const pageUrl = new URL(url.origin);
        pageUrl.pathname = url.searchParams.get("pathname") ?? "/";
        rscPagePathname = pageUrl.pathname;
      }

      // Run middleware
      if (middlewareDispatcher) {
        // For /rsc the chain runs for the requested page, as it does for that
        // page's document request, so route-scoped proxies cover its payload.
        const proxyRequest = rscPagePathname !== null
          ? new Request(new URL(rscPagePathname, url.origin), req)
          : req;
        const { result, finalPathname } = await middlewareDispatcher.runProxies(
          proxyRequest,
          rscPagePathname ?? pathname,
        );

        if (result.type === "response") {
          return result.response;
        }

        if (result.type === "redirect") {
          return Response.redirect(result.url, result.status ?? 302);
        }

        if (rscPagePathname !== null) {
          rscPagePathname = finalPathname;
        } else {
          pathname = finalPathname;
        }
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

          // Defense in depth against cross-site request forgery: a browser
          // page of another origin cannot run an action.
          if (!actionGuard.isSameOriginRequest(req)) {
            await rscLogger.with({ actionId }).warn(
              "run server action: refused a cross-site request; answered 403",
            );
            return jsonResponse({ error: "Cross-site action request" }, 403);
          }

          try {
            // Parse action ID: "path/to/file#exportName"
            const [modulePath, exportName] = actionId.split("#");
            if (!modulePath || !exportName) {
              return jsonResponse({ error: "Invalid action ID format" }, 400);
            }

            // Only modules the build lists in actions-manifest.json are
            // action modules. The id comes from a request header, so it is
            // checked against that list before any module is imported.
            const serverDir = crossRuntime.runtime.path.resolve(
              config.distDir,
              "server",
            );
            const manifest = await getActionManifest(serverDir, getBuildId());
            if (!actionGuard.isListedActionModule(manifest, modulePath)) {
              // The id goes into a log attribute; the response does not
              // echo it.
              await rscLogger.with({ actionId }).warn(
                "run server action: the module is not in the actions manifest; answered 404",
              );
              return jsonResponse({ error: "Action not found" }, 404);
            }

            // Actions are in dist/server/<modulePath>.js, and the resolved
            // file must stay inside that directory: an id with ../ or an
            // absolute path is rejected.
            const actionModulePath = pathContainment.resolveWithin(
              serverDir,
              `${modulePath}.js`,
            );
            if (actionModulePath === null) {
              rscLogger.warn(`RSC action path outside server dir: ${actionId}`);
              return jsonResponse({ error: "Invalid action ID" }, 400);
            }

            // The body is read with a size limit before it is parsed.
            let bodyBytes: Uint8Array<ArrayBuffer>;
            try {
              bodyBytes = await actionGuard.readBoundedBody(req);
            } catch (error) {
              if (error instanceof actionGuard.ActionBodyTooLargeError) {
                return jsonResponse({
                  error:
                    `Action request body is over the ${error.limitBytes}-byte limit`,
                }, 413);
              }
              throw error;
            }

            // Parse args based on content type
            const contentType = req.headers.get("Content-Type") ?? "";
            let args: unknown[];

            if (contentType.includes("multipart/form-data")) {
              // FormData - pass as first arg
              args = [
                await new Response(bodyBytes, {
                  headers: { "Content-Type": contentType },
                }).formData(),
              ];
            } else {
              // JSON args: the client sends the argument list as an array. A
              // body that is not JSON gets the same 400 as one that is not an
              // array.
              let body: unknown = null;
              try {
                body = JSON.parse(new TextDecoder().decode(bodyBytes));
              } catch {
                body = null;
              }
              if (!Array.isArray(body)) {
                return jsonResponse({
                  error:
                    "Action arguments must be a JSON array or multipart form data",
                }, 400);
              }
              args = body;
            }

            rscLogger.debug(`Loading action module: ${actionModulePath}`);
            const actionModule = await import(
              buildModule.toBuildModuleUrl(actionModulePath, getBuildId())
            );

            // Only exports the build marked as React server references are
            // actions; other exports of the module cannot be called.
            const actionFn = actionModule[exportName];
            if (!actionGuard.isServerAction(actionFn, actionId)) {
              await rscLogger.with({ actionId }).warn(
                "run server action: the module has no server action with this id; answered 404",
              );
              return jsonResponse({ error: "Action not found" }, 404);
            }

            // The module map is loaded before the action runs, so a bundle
            // that cannot load fails the request before any side effect.
            const bundle = await bundler.getBundle();

            // Call the action
            const result = await actionFn(...args);

            rscLogger.debug(`Action ${actionId} completed successfully`);

            // The result is encoded as RSC, so Dates, Maps, Sets, BigInts,
            // undefined and React elements reach the client as themselves.
            return react.streamToResponse(
              react.renderValueToReadableStream(result, bundle.moduleMap),
            );
          } catch (error) {
            // Handled here: logged once with the action id, and the client
            // receives a fixed message.
            await rscLogger.with({ actionId, error }).error(
              "run server action: the request or the action failed; answered 500",
            );
            return jsonResponse({ error: "Server action failed" }, 500);
          }
        }
      }

      // Route: /rsc -> React Server Components payload
      if (pathname === "/rsc") {
        rscLogger.debug("Rendering RSC payload...");

        const bundle = await bundler.getBundle();
        const requestPathname = rscPagePathname ?? "/";
        const { Layout, Page, params } = await getApp(requestPathname);

        // Request data travels with this render only, as the request prop
        // of the page and the layout. The client forwards the page URL's
        // locale parameter to /rsc.
        return await react.renderRSCResponse(
          config,
          react.renderApp(Layout, Page, {
            pathname: requestPathname,
            params,
            requestContext: {
              cookieHeader: req.headers.get("cookie"),
              host: req.headers.get("host"),
              localeParam: url.searchParams.get("locale"),
            },
          }),
          bundle.moduleMap,
        );
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
      serverLogger.with({ error, method: req.method, pathname }).error(
        "handle request; answering 500",
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
  const { config, bundler, getApp } = deps;
  const bundle = await bundler.getBundle();

  // The manifest is read from disk for each request, so its build id is the
  // current one, also after a dev rebuild.
  const manifest = bundle.chunkManifest;
  manifest.logLevel = config.logLevel;

  // Load optimized font data
  let fontPreloads: string[] | undefined;
  let fontCSS: string | undefined;

  try {
    const fontPreloadsPath = crossRuntime.runtime.path.resolve(
      config.distDir,
      "client",
      "font-preloads.json",
    );
    const fontCssPath = crossRuntime.runtime.path.resolve(
      config.distDir,
      "client",
      "fonts.css",
    );

    const fontPreloadsContent = await crossRuntime.runtime.fs.readTextFile(
      fontPreloadsPath,
    );
    fontPreloads = JSON.parse(fontPreloadsContent);
    fontCSS = await crossRuntime.runtime.fs.readTextFile(fontCssPath);
  } catch {
    serverLogger.debug("Font optimization data not found, using fallback");
  }

  // Load critical CSS
  let criticalPageCSS: string | undefined;
  let criticalUniversalCSS: string | undefined;
  let deferredCSSPath: string | undefined;

  try {
    const criticalCssPath = crossRuntime.runtime.path.resolve(
      config.distDir,
      "client",
      "styles.critical.css",
    );
    criticalPageCSS = await crossRuntime.runtime.fs.readTextFile(
      criticalCssPath,
    );
    deferredCSSPath = "/styles.deferred.css";
  } catch {
    serverLogger.debug("Critical page CSS not found, using defaults");
  }

  try {
    const universalCssPath = crossRuntime.runtime.path.resolve(
      config.distDir,
      "client",
      "styles.universal.css",
    );
    criticalUniversalCSS = await crossRuntime.runtime.fs.readTextFile(
      universalCssPath,
    );
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

      // Request data travels with this render only, as the request prop of
      // the page and the layout.
      const rscComponent = react.renderApp(Layout, Page, {
        pathname,
        params,
        requestContext: {
          cookieHeader: req.headers.get("cookie"),
          host: req.headers.get("host"),
          localeParam: new URL(req.url).searchParams.get("locale"),
        },
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

      const ssrResult = await react.renderSSR(
        rscComponent,
        bundle.moduleMap,
        { streamMode },
      );

      ssrContent = ssrResult.html;
      if (streamMode === "await-all") {
        rscPayload = react.serializeRSCPayload(ssrResult.rscPayload);
      }
      clientModules = ssrResult.clientModules;

      serverLogger.debug(
        `SSR complete for ${pathname}: ${ssrContent.length} bytes HTML`,
      );
    } catch (error) {
      serverLogger.with({ error }).error(
        `render SSR for ${pathname}; falling back to CSR`,
      );
      ssrContent = undefined;
      rscPayload = undefined;
      clientModules = undefined;
    }
  }

  const html = htmlShell.createHtmlShell({
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

/** Options for {@link startHTTPServer}. */
export type StartHTTPServerOptions = {
  /** Called with the bound address once the server listens. */
  readonly onListen?: (addr: crossRuntime.NetAddr) => void;
  /** Stops the server when aborted. */
  readonly signal?: AbortSignal;
};

/**
 * Start the HTTP server on `config.server.host` and `config.server.port`.
 * The host is passed explicitly because runtime.http binds to 127.0.0.1 when
 * none is given. Resolves once the server listens.
 */
export async function startHTTPServer(
  deps: ServerDependencies,
  options: StartHTTPServerOptions = {},
): Promise<crossRuntime.HttpServer> {
  const { config } = deps;
  const handler = createHandler(deps);

  return await crossRuntime.runtime.http.serve({
    port: config.server.port,
    hostname: config.server.host,
    onListen: options.onListen,
    signal: options.signal,
  }, handler);
}
