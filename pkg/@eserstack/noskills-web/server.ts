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
): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

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
  if (path === "/mux") {
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return handleMuxWs(request, host);
    }
    return new Response("WebSocket upgrade required", { status: 426 });
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
    return pages.handleDashboard(root, host);
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
};

export const startServer = async (opts: ServerOptions): Promise<void> => {
  const port = opts.port ?? 3000;
  const host = new MuxHost(opts.root);

  const handler = (request: Request): Promise<Response> =>
    route(request, opts.root, host);

  const server = Deno.serve({ port, hostname: "127.0.0.1" }, handler);

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
