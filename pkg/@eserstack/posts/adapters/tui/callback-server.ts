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

/**
 * What a genuine redirect for one authorization request looks like. Derived
 * from the configured redirect URI plus the state issued for this attempt.
 */
export type CallbackExpectation = {
  /** Loopback host to bind (127.0.0.1 or ::1). */
  readonly hostname: string;
  readonly port: number;
  /** Path of the redirect URI, e.g. "/callback". */
  readonly pathname: string;
  /** The state sent in the authorization request. */
  readonly state: string;
};

const LOOPBACK_BIND = new Map([
  ["localhost", "127.0.0.1"],
  ["127.0.0.1", "127.0.0.1"],
  ["[::1]", "::1"],
  ["::1", "::1"],
]);

/**
 * Builds the expectation for a redirect URI. Only loopback redirect URIs are
 * accepted: the receiver must never listen on a network interface.
 */
export function expectationFor(
  redirectUri: string,
  state: string,
): CallbackExpectation {
  const url = new URL(redirectUri);
  const hostname = LOOPBACK_BIND.get(url.hostname);
  if (hostname === undefined) {
    throw new Error(
      `Redirect URI must use a loopback host (127.0.0.1, ::1 or localhost), got ${url.hostname}`,
    );
  }
  const port = url.port !== "" ? parseInt(url.port, 10) : 80;
  return { hostname, port, pathname: url.pathname, state };
}

/** Constant-time string comparison for the state value. */
const sameState = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * Returns the code when the request is the genuine redirect for this attempt
 * (right path, issued state present), or null for anything else.
 */
export const matchCallback = (
  url: URL,
  expected: CallbackExpectation,
): string | null => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (code === null || state === null) return null;
  if (url.pathname !== expected.pathname) return null;
  if (expected.state.length === 0 || !sameState(state, expected.state)) {
    return null;
  }
  return code;
};

const UNEXPECTED_CALLBACK =
  "Unexpected callback: it does not match the pending login.";

/**
 * Start a one-shot HTTP server on loopback that resolves when the genuine
 * OAuth redirect arrives. Requests with a wrong path or state are answered
 * 400 and ignored, so another local process or a web page cannot end or
 * steer the pending login.
 */
export function waitForOAuthCallback(
  expected: CallbackExpectation,
  timeoutMs: number = TIMEOUT_MS_DEFAULT,
): Promise<{ code: string; state: string }> {
  const name = crossRuntime.runtime.name;

  if (name === "deno") {
    return awaitCallbackDeno(expected, timeoutMs);
  }

  if (name === "node" || name === "bun") {
    return awaitCallbackNode(expected, timeoutMs);
  }

  throw new Error(
    `HTTP callback server is not supported on runtime: ${name}. Use manual code entry instead.`,
  );
}

async function awaitCallbackDeno(
  expected: CallbackExpectation,
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

  let settled = false;

  try {
    Deno.serve(
      {
        hostname: expected.hostname,
        port: expected.port,
        signal: ac.signal,
        onListen: () => {},
      },
      (req: Request): Response => {
        const code = settled ? null : matchCallback(new URL(req.url), expected);
        if (code === null) {
          return new Response(UNEXPECTED_CALLBACK, { status: 400 });
        }

        settled = true;
        resolveCallback({ code, state: expected.state });
        return new Response(SUCCESS_HTML, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    );
  } catch (err) {
    // Bind failed (port in use): fall back without leaving a timer behind.
    ac.abort();
    throw err;
  }

  const timer = setTimeout(() => {
    rejectCallback(new Error(TIMEOUT_MSG));
  }, timeoutMs);

  try {
    return await callbackResult;
  } finally {
    clearTimeout(timer);
    ac.abort();
  }
}

async function awaitCallbackNode(
  expected: CallbackExpectation,
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
  let settled = false;

  const server = http.createServer((req, res) => {
    const url = new URL(
      req.url ?? "/",
      `http://${expected.hostname}:${expected.port}`,
    );
    const code = settled ? null : matchCallback(url, expected);

    if (code === null) {
      res.writeHead(400);
      res.end(UNEXPECTED_CALLBACK);
      return;
    }

    settled = true;
    clearTimeout(timer);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(SUCCESS_HTML);
    server.close();
    server.closeAllConnections?.();
    resolveCallback({ code, state: expected.state });
  });

  timer = setTimeout(() => {
    server.close();
    rejectCallback(new Error(TIMEOUT_MSG));
  }, timeoutMs);

  server.on("error", (err: Error) => {
    clearTimeout(timer);
    rejectCallback(err);
  });
  server.listen(expected.port, expected.hostname);

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
