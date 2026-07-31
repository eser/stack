// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * HTTP + WebSocket + SSE server for noskills web interface.
 *
 * @module
 */

import * as pages from "./routes/pages.ts";
import * as api from "./routes/api.ts";
import * as sse from "./routes/sse.ts";
import { handleMuxWs } from "./terminal/ws-bridge.ts";
import { MuxHost } from "./terminal/mux-host.ts";
import * as auth from "./auth.ts";
import { runtime } from "@eserstack/standards/cross-runtime";
import { fromFileUrl, join, relative } from "@std/path";

// =============================================================================
// Static file serving
// =============================================================================

// Resolve the static directory to a real filesystem path. Using fromFileUrl
// (instead of URL.pathname) is required for cross-platform correctness — on
// Windows, URL.pathname yields "/C:/..." which is not a valid OS path.
const STATIC_DIR = fromFileUrl(new URL("./static/", import.meta.url));

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".js": "application/javascript",
  ".html": "text/html",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const serveStatic = async (path: string): Promise<Response> => {
  try {
    // Join against the static dir, then guard against path traversal in a
    // separator-agnostic way: the resolved file must stay inside STATIC_DIR.
    const filePath = join(STATIC_DIR, path);
    const rel = relative(STATIC_DIR, filePath);
    if (rel.startsWith("..") || runtime.path.isAbsolute(rel)) {
      return new Response("Not found", { status: 404 });
    }
    const content = await runtime.fs.readTextFile(filePath);
    const ext = path.includes(".") ? `.${path.split(".").pop()!}` : "";
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    return new Response(content, {
      headers: { "content-type": contentType },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
};

// =============================================================================
// Request router
// =============================================================================

const route = async (
  request: Request,
  root: string,
  host: MuxHost,
  guard: { readonly token: string; readonly port: number },
): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Anything that mutates server state, spawns a process, or opens the
  // multiplexer socket must clear the trust boundary first. Reads of static
  // assets and pages stay open so the dashboard can bootstrap and hand the
  // browser its token.
  const isMutating = method === "POST" || method === "DELETE" ||
    method === "PUT" || method === "PATCH";

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

    return handleMuxWs(request, host);
  }

  // API routes
  if (path === "/api/state" && method === "GET") {
    return api.handleGetState(root);
  }

  if (path === "/api/tabs" && method === "GET") {
    return api.handleListTabs(host);
  }

  if (path === "/api/tab" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    return api.handleCreateTab(host, body as Record<string, unknown>);
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
    const body = await request.json().catch(() => ({}));
    return api.handleAction(
      root,
      specActionMatch[1]!,
      specActionMatch[2]!,
      body as Record<string, unknown>,
      host,
    );
  }

  // Spec detail page
  if (path.startsWith("/spec/") && method === "GET") {
    const specName = path.slice("/spec/".length);
    return pages.handleSpecDetail(root, specName);
  }

  // Dashboard (home)
  if (path === "/" && method === "GET") {
    return pages.handleDashboard(root, host, guard.token);
  }

  return new Response("Not found", { status: 404 });
};

// =============================================================================
// Server lifecycle
// =============================================================================

export type ServerOptions = {
  readonly root: string;
  readonly port?: number;
  readonly open?: boolean;
  /**
   * Aborts the listener. Without it the only way to stop the server is the
   * SIGINT handler, which makes it untestable in-process.
   */
  readonly signal?: AbortSignal;
};

export const startServer = async (opts: ServerOptions): Promise<void> => {
  const port = opts.port ?? 3000;
  const host = new MuxHost(opts.root);

  // Minted per process unless the operator supplied one. The dashboard embeds
  // it so the browser can open /mux; nothing persists it to disk.
  const token = auth.tokenFromEnv() ?? auth.createToken();
  const guard = { token, port } as const;

  const handler = (request: Request): Promise<Response> =>
    route(request, opts.root, host, guard);

  const server = Deno.serve(
    { port, hostname: "127.0.0.1", signal: opts.signal },
    handler,
  );

  console.log(`noskills web → http://localhost:${port}`);

  if (opts.open) {
    const os = runtime.env.get("OS") ?? "";
    const opener = os.includes("Windows")
      ? "start"
      : (runtime.env.get("HOME") ?? "").startsWith("/Users")
      ? "open"
      : "xdg-open";
    try {
      await runtime.exec.spawn(opener, [`http://localhost:${port}`]);
    } catch {
      // best effort
    }
  }

  // Graceful shutdown (signal handling is Deno-specific — no cross-runtime equivalent)
  // deno-lint-ignore no-explicit-any
  (globalThis as any).Deno?.addSignalListener?.("SIGINT", async () => {
    console.log("\nShutting down...");
    await host.killAll();
    runtime.process.exit(0);
  });

  await server.finished;
  await host.killAll();
};
