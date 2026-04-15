// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * OAuth callback server — the ONLY file in @eserstack/posts that uses runtime-
 * specific HTTP APIs. All other files go through cross-runtime abstractions.
 *
 * waitForOAuthCallback: starts a one-shot HTTP server on the given port,
 * resolves when the OAuth provider redirects back with ?code=...&state=...,
 * and rejects if the 2-minute timeout expires first.
 *
 * manualCodeEntry: TUI fallback — asks the user to paste the full redirect
 * URL so both code and state can be extracted without a local server.
 */

import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as tui from "@eserstack/shell/tui";

const TIMEOUT_MS_DEFAULT = 120_000;
const TIMEOUT_MSG =
  "OAuth callback timed out after 2 minutes. Please try again.";
const SUCCESS_HTML =
  "<html><body><h2>Authorization successful!</h2><p>You may close this tab.</p></body></html>";

/** Start a one-shot HTTP server that resolves when the OAuth callback arrives. */
export function waitForOAuthCallback(
  port: number,
  timeoutMs: number = TIMEOUT_MS_DEFAULT,
): Promise<{ code: string; state: string }> {
  const name = crossRuntime.runtime.name;

  if (name === "deno") {
    return awaitCallbackDeno(port, timeoutMs);
  }

  if (name === "node" || name === "bun") {
    return awaitCallbackNode(port, timeoutMs);
  }

  throw new Error(
    `HTTP callback server is not supported on runtime: ${name}. Use manual code entry instead.`,
  );
}

async function awaitCallbackDeno(
  port: number,
  timeoutMs: number,
): Promise<{ code: string; state: string }> {
  const ac = new AbortController();

  let resolveCallback!: (value: { code: string; state: string }) => void;
  let rejectCallback!: (err: Error) => void;

  const callbackResult = new Promise<{ code: string; state: string }>(
    (resolve, reject) => {
      resolveCallback = resolve;
      rejectCallback = reject;
    },
  );

  const timer = setTimeout(() => {
    rejectCallback(new Error(TIMEOUT_MSG));
  }, timeoutMs);

  Deno.serve(
    { port, signal: ac.signal, onListen: () => {} },
    (req: Request): Response => {
      const url = new URL(req.url);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state") ?? "";

      if (code === null) {
        return new Response("Missing authorization code", { status: 400 });
      }

      clearTimeout(timer);
      resolveCallback({ code, state });
      return new Response(SUCCESS_HTML, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  );

  try {
    return await callbackResult;
  } finally {
    ac.abort();
  }
}

async function awaitCallbackNode(
  port: number,
  timeoutMs: number,
): Promise<{ code: string; state: string }> {
  const http = await import("node:http");

  let resolveCallback!: (value: { code: string; state: string }) => void;
  let rejectCallback!: (err: Error) => void;

  const callbackResult = new Promise<{ code: string; state: string }>(
    (resolve, reject) => {
      resolveCallback = resolve;
      rejectCallback = reject;
    },
  );

  // deno-lint-ignore prefer-const
  let timer!: ReturnType<typeof setTimeout>;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") ?? "";

    if (code === null) {
      res.writeHead(400);
      res.end("Missing authorization code");
      return;
    }

    clearTimeout(timer);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(SUCCESS_HTML);
    server.close();
    resolveCallback({ code, state });
  });

  timer = setTimeout(() => {
    server.close();
    rejectCallback(new Error(TIMEOUT_MSG));
  }, timeoutMs);

  server.on("error", (err: Error) => {
    clearTimeout(timer);
    rejectCallback(err);
  });
  server.listen(port);

  return callbackResult;
}

/**
 * TUI fallback: prompt the user to paste the full redirect URL.
 * Parses both `code` and `state` from the URL's query parameters.
 */
export async function manualCodeEntry(
  ctx: tui.TuiContext,
): Promise<{ code: string; state: string }> {
  tui.log.warn(
    ctx,
    "Automatic callback not available. After authorizing, copy the full " +
      "redirect URL from your browser's address bar and paste it below.",
  );

  const input = await tui.text(ctx, {
    message: "Full redirect URL",
    placeholder: "http://127.0.0.1:8080/callback?code=...&state=...",
    validate: (value) => {
      if (value.trim().length === 0) return "URL cannot be empty.";
      try {
        const url = new URL(value.trim());
        if (!url.searchParams.has("code")) {
          return "URL must contain a 'code' query parameter.";
        }
        return undefined;
      } catch {
        return "Enter a valid URL (e.g. http://127.0.0.1:8080/callback?code=...).";
      }
    },
  });

  if (tui.isCancel(input)) {
    throw new Error("Login cancelled.");
  }

  const url = new URL(input.trim());
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";

  if (code === null) {
    // validate() above ensures code is present; this branch guards the type
    throw new Error("Authorization code not found in redirect URL.");
  }

  return { code, state };
}
