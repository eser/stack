// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// The URL and the shutdown notice printed here are `noskills web` output, not
// logs; failures go through the logger.
// deno-lint-ignore-file no-console

/**
 * HTTP + WebSocket + SSE server for noskills web interface.
 *
 * @module
 */

import * as pages from "./routes/pages.ts";
import * as api from "./routes/api.ts";
import * as sse from "./routes/sse.ts";
import * as staticRoute from "./routes/static.ts";
import * as wsBridge from "./terminal/ws-bridge.ts";
import * as muxHost from "./terminal/mux-host.ts";
import * as auth from "./auth.ts";
import * as requestContext from "./request-context.ts";
import * as logging from "@eserstack/logging";
import * as crossRuntime from "@eserstack/standards/cross-runtime";

const { runtime } = crossRuntime;

/**
 * Where the server logs when the caller passes no logger. With no logging
 * configuration, @eserstack/logging writes its records to stderr, which is the
 * terminal that runs `noskills web`.
 */
const defaultLogger = logging.logger.getLogger(["noskills-web"]);

// =============================================================================
// Static file serving
// =============================================================================

// import.meta.dirname is a native path on every platform (no "/C:/..." on
// Windows). It is undefined when the module is loaded from a remote URL; the
// static files are not on disk then, and serveStatic answers 404.
const STATIC_DIR: string | null =
  import.meta.dirname === undefined
    ? null
    : runtime.path.join(import.meta.dirname, "static");

const serveStatic = (path: string): Promise<Response> =>
  staticRoute.serveStatic(STATIC_DIR, path);

// =============================================================================
// Request router
// =============================================================================

/** The JSON object a request body carries; `{}` for any other body. */
const readJsonObject = async (
  request: Request,
): Promise<Record<string, unknown>> => {
  const body: unknown = await request.json().catch(() => null);

  return body instanceof Object && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
};

const route = async (
  request: Request,
  root: string,
  host: muxHost.MuxHost,
  guard: { readonly token: string; readonly port: number },
  context: requestContext.RequestContext,
): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Anything that mutates server state, spawns a process, or opens the
  // multiplexer socket must clear the trust boundary first. Reads of static
  // assets and pages stay open so the dashboard can bootstrap and hand the
  // browser its token.
  const isMutating =
    method === "POST" ||
    method === "DELETE" ||
    method === "PUT" ||
    method === "PATCH";

  if (path === "/mux" || isMutating) {
    if (!auth.isOriginAllowed(request, guard.port)) {
      return auth.forbidden("origin not allowed");
    }
  }

  if (isMutating && !auth.hasJsonContentType(request) && method !== "DELETE") {
    // Blocks the form-postable content types, which are the ones a
    // cross-origin page can send without triggering a preflight.
    return auth.forbidden("expected application/json");
  }

  if (isMutating && !auth.hasValidHeaderToken(request, guard.token)) {
    return auth.forbidden("missing or invalid token");
  }

  // PWA root-level files — service worker must be at / scope, not /static/
  if (path === "/sw.js" && method === "GET") {
    return serveStatic("sw.js");
  }
  if (path === "/manifest.json" && method === "GET") {
    return serveStatic("manifest.json");
  }

  // Static files
  if (path.startsWith("/static/")) {
    return serveStatic(path.slice("/static/".length));
  }

  // SSE event stream
  if (path === "/events" && method === "GET") {
    return sse.handleSSE(root);
  }

  // WebSocket: the whole multiplexer rides one socket (scene + every pane).
  //
  // This socket can spawn PTYs, so it is the highest-value route on the server.
  // WebSockets are exempt from the same-origin policy, which means binding to
  // 127.0.0.1 keeps out nothing: any page the developer happens to visit can
  // dial it. The token is what actually gates it — a browser can only learn it
  // by reading the dashboard HTML, which the Origin check confines to us.
  if (path === "/mux") {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }

    if (!auth.hasValidQueryToken(request, guard.token)) {
      return auth.forbidden("missing or invalid token");
    }

    return wsBridge.handleMuxWs(request, host);
  }

  // API routes
  if (path === "/api/state" && method === "GET") {
    return api.handleGetState(root);
  }

  if (path === "/api/tabs" && method === "GET") {
    return api.handleListTabs(host);
  }

  if (path === "/api/tab" && method === "POST") {
    return api.handleCreateTab(host, await readJsonObject(request));
  }

  if (path.startsWith("/api/tab/") && method === "DELETE") {
    const tabId = path.slice("/api/tab/".length);
    return api.handleCloseTab(host, tabId);
  }

  // API spec reads: GET /api/spec/:name/ledger | summary (decision ledger)
  const specReadMatch = path.match(/^\/api\/spec\/([^/]+)\/(ledger|summary)$/);
  if (specReadMatch !== null && method === "GET") {
    return api.handleSpecRead(
      root,
      specReadMatch[1]!,
      specReadMatch[2]! as "ledger" | "summary",
    );
  }

  // API spec actions: /api/spec/:name/:action
  const specActionMatch = path.match(/^\/api\/spec\/([^/]+)\/([^/]+)$/);
  if (specActionMatch !== null && method === "POST") {
    return api.handleAction(
      root,
      specActionMatch[1]!,
      specActionMatch[2]!,
      await readJsonObject(request),
      host,
      context,
    );
  }

  // Spec detail page. The path is percent-encoded; the spec is its decoded
  // name, which must name one directory under .eser/specs/.
  if (path.startsWith("/spec/") && method === "GET") {
    const specName = pages.specNameFromPath(path.slice("/spec/".length));
    if (specName === null) {
      return pages.specNotFound();
    }

    return pages.handleSpecDetail(root, specName, guard.token);
  }

  // Dashboard (home)
  if (path === "/" && method === "GET") {
    return pages.handleDashboard(root, host, guard.token);
  }

  return new Response("Not found", { status: 404 });
};

/** Answers one request within its {@link requestContext.RequestContext}. */
export type ContextHandler = (
  request: Request,
  context: requestContext.RequestContext,
) => Promise<Response>;

/**
 * Give every request a context, and turn an error that `handler` throws into a
 * logged fault: the record carries the request id, and the client gets a 500
 * with the same id instead of the error.
 *
 * @param handler - Answers the request
 * @param logger - Receives the error records
 * @returns The handler to serve
 */
export const withFaultBoundary =
  (
    handler: ContextHandler,
    logger: requestContext.RequestLogger,
  ): ((request: Request) => Promise<Response>) =>
  async (request) => {
    const context = requestContext.createRequestContext(request, logger);

    try {
      return await handler(request, context);
    } catch (error) {
      return await api.faultResponse(
        context,
        "Request could not be completed",
        500,
        error,
      );
    }
  };

// =============================================================================
// Server lifecycle
// =============================================================================

/**
 * The command and leading arguments that open a URL in the default browser,
 * per platform. `start` is a cmd built-in, not a program, so Windows runs it
 * through cmd; its first quoted argument is a window title, hence the "".
 */
const BROWSER_OPENERS: Readonly<
  Record<crossRuntime.Platform, readonly [string, ...string[]]>
> = {
  darwin: ["open"],
  linux: ["xdg-open"],
  windows: ["cmd", "/c", "start", ""],
};

/** The address the server listens on, as {@link ServerOptions.onListen} gets it. */
export type ListenAddress = {
  /** Always 127.0.0.1. */
  readonly hostname: string;
  /** The bound port; the one the system picked when `port` was 0. */
  readonly port: number;
};

/** Options for {@link startServer}. */
export type ServerOptions = {
  /** Project root that holds the `.eser/` directory noskills reads. */
  readonly root: string;
  /**
   * Port to listen on, on 127.0.0.1 only. Defaults to 3000; 0 lets the system
   * pick a free port, which `onListen` reports.
   */
  readonly port?: number;
  /** Opens the dashboard in the default browser once the server listens. */
  readonly open?: boolean;
  /**
   * Aborts the listener. Without it the only way to stop the server is the
   * SIGINT handler, which makes it untestable in-process.
   */
  readonly signal?: AbortSignal;
  /** Called once the server listens, with the address it bound. */
  readonly onListen?: (address: ListenAddress) => void;
  /**
   * Receives the error records of failed requests and of a failed shutdown.
   * Defaults to the `noskills-web` logger of `@eserstack/logging`, which
   * writes to stderr when nothing configures it.
   */
  readonly logger?: requestContext.RequestLogger;
};

/**
 * Serve the noskills dashboard, its JSON API, the SSE event stream and the
 * `/mux` WebSocket on 127.0.0.1, and resolve once the server stops.
 *
 * The token that guards mutating routes and `/mux` comes from
 * `NOSKILLS_WEB_TOKEN` when it is set, and is minted per process otherwise.
 */
export const startServer = async (opts: ServerOptions): Promise<void> => {
  const port = opts.port ?? 3000;
  const logger = opts.logger ?? defaultLogger;
  const host = new muxHost.MuxHost(opts.root);

  // Minted per process unless the operator supplied one. The dashboard embeds
  // it so the browser can open /mux; nothing persists it to disk.
  const token = auth.tokenFromEnv() ?? auth.createToken();

  // The Origin check needs the port the server bound, which is only known once
  // serve resolves when `port` is 0. Until then the guard holds the requested
  // port, so a request in that window fails the Origin check.
  let guard: { readonly token: string; readonly port: number } = {
    token,
    port,
  };

  const handler = withFaultBoundary(
    (request, context) => route(request, opts.root, host, guard, context),
    logger,
  );

  const server = await runtime.http.serve(
    { port, hostname: "127.0.0.1", signal: opts.signal },
    handler,
  );
  guard = { token, port: server.port };

  console.log(`noskills web → http://localhost:${server.port}`);
  opts.onListen?.({ hostname: server.hostname, port: server.port });

  if (opts.open === true) {
    const [opener, ...openerArgs] = BROWSER_OPENERS[crossRuntime.getPlatform()];
    try {
      await runtime.exec.spawn(opener, [
        ...openerArgs,
        `http://localhost:${server.port}`,
      ]);
    } catch {
      // Opening a browser is a convenience: the URL is already printed above.
    }
  }

  // Ctrl+C closes every tab and its agent process before the process exits.
  // The listener lives as long as this server and is removed with it.
  const onInterrupt = (): void => {
    console.log("\nShutting down...");
    host.killAll().then(
      () => runtime.process.exit(0),
      async (error: unknown) => {
        await logger.with({ error }).error("Closing the agent tabs failed");
        runtime.process.exit(1);
      },
    );
  };
  runtime.process.addSignalListener("SIGINT", onInterrupt);

  try {
    await server.finished;
  } finally {
    runtime.process.removeSignalListener("SIGINT", onInterrupt);
  }

  await host.killAll();
};
