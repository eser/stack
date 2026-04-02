// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * HTTP + WebSocket + SSE server for noskills web interface.
 *
 * @module
 */

import * as pages from "./routes/pages.ts";
import * as api from "./routes/api.ts";
import * as sse from "./routes/sse.ts";
import { handleTerminalWs } from "./terminal/ws-bridge.ts";
import { PtyManager } from "./terminal/pty-manager.ts";
import { runtime } from "@eser/standards/cross-runtime";

// =============================================================================
// Static file serving
// =============================================================================

const STATIC_DIR = new URL("./static/", import.meta.url);

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
    const filePath = new URL(path, STATIC_DIR).pathname;
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
  ptyManager: PtyManager,
): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Static files
  if (path.startsWith("/static/")) {
    return serveStatic(path.slice("/static/".length));
  }

  // SSE event stream
  if (path === "/events" && method === "GET") {
    return sse.handleSSE(root);
  }

  // WebSocket terminal
  if (path.startsWith("/terminal/")) {
    const tabId = path.slice("/terminal/".length);
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return handleTerminalWs(request, tabId, ptyManager);
    }
    return new Response("WebSocket upgrade required", { status: 426 });
  }

  // API routes
  if (path === "/api/state" && method === "GET") {
    return api.handleGetState(root);
  }

  if (path === "/api/tabs" && method === "GET") {
    return api.handleListTabs(ptyManager);
  }

  if (path === "/api/tab" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    return api.handleCreateTab(ptyManager, body as Record<string, unknown>);
  }

  if (path.startsWith("/api/tab/") && method === "DELETE") {
    const tabId = path.slice("/api/tab/".length);
    return api.handleCloseTab(ptyManager, tabId);
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
      ptyManager,
    );
  }

  // Spec detail page
  if (path.startsWith("/spec/") && method === "GET") {
    const specName = path.slice("/spec/".length);
    return pages.handleSpecDetail(root, specName);
  }

  // Dashboard (home)
  if (path === "/" && method === "GET") {
    return pages.handleDashboard(root, ptyManager);
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
  const ptyManager = new PtyManager(opts.root);

  const handler = (request: Request): Promise<Response> =>
    route(request, opts.root, ptyManager);

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
    await ptyManager.killAll();
    runtime.process.exit(0);
  });

  await server.finished;
  await ptyManager.killAll();
};
