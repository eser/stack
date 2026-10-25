// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The browser OAuth login that the terminal menu and `eser posts login` share.
 *
 * It prints the authorization URL, waits for the provider's redirect on the
 * loopback redirect URI, and falls back to asking for the redirect URL when
 * no redirect arrives. Either way the code is used only when the redirect
 * carries the state issued for this attempt; then it is exchanged for tokens.
 * Saving the tokens is left to the caller.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as tui from "@eserstack/shell/tui";
import * as span from "@eserstack/streams/span";
import type { OAuthTokens } from "../../domain/entities/user.ts";
import type { AuthProvider } from "../../application/auth-provider.ts";
import * as callbackServer from "./callback-server.ts";

/** An authorization code and the state that came back with it. */
export type CallbackParams = {
  readonly code: string;
  readonly state: string;
};

/** Where the login prints and prompts, and how it receives the redirect. */
export type BrowserLoginOptions = {
  readonly ctx: tui.TuiContext;
  /** The redirect URI registered with the provider; must be loopback. */
  readonly redirectUri: string;
  /** Receives the redirect; defaults to the loopback callback server. */
  readonly waitForCallback?: (
    expected: callbackServer.CallbackExpectation,
  ) => Promise<CallbackParams>;
  /** Asks for the pasted redirect URL; defaults to a terminal prompt. */
  readonly enterRedirectUrl?: (ctx: tui.TuiContext) => Promise<CallbackParams>;
};

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/** Wait for the redirect, or ask for it when it cannot arrive on its own. */
const receiveCallback = async (
  state: string,
  options: BrowserLoginOptions,
): Promise<results.Result<CallbackParams, Error>> => {
  const { ctx } = options;
  const waitForCallback =
    options.waitForCallback ??
    ((expected: callbackServer.CallbackExpectation) =>
      callbackServer.waitForOAuthCallback(expected));
  const enterRedirectUrl =
    options.enterRedirectUrl ?? callbackServer.manualCodeEntry;

  try {
    const expected = callbackServer.expectationFor(options.redirectUri, state);
    tui.log.info(
      ctx,
      `Waiting for the redirect on ${expected.hostname}:${expected.port}…`,
    );
    // The callback server checks the path and the state before it resolves.
    return results.ok(await waitForCallback(expected));
  } catch (err) {
    // Any reason the redirect cannot arrive here (a redirect URI that is not
    // loopback, a port in use, a runtime without a server, the timeout) has
    // the same remedy: paste the redirect URL instead.
    tui.log.warn(ctx, `No redirect received: ${messageOf(err)}`);
  }

  let pasted: CallbackParams;
  try {
    pasted = await enterRedirectUrl(ctx);
  } catch (err) {
    return results.fail(
      new Error(`read the redirect URL: ${messageOf(err)}`, { cause: err }),
    );
  }

  // The pasted URL must belong to this login attempt too.
  if (pasted.state !== state) {
    return results.fail(
      new Error(
        "the redirect URL does not match this login attempt; start the login again and use the URL it prints",
      ),
    );
  }
  return results.ok(pasted);
};

/**
 * Run the browser login for one provider and return the exchanged tokens.
 * The provider holds the new access token afterwards; the caller saves the
 * tokens if they should outlive the process.
 */
export async function runBrowserLogin(
  platformLabel: string,
  auth: AuthProvider,
  options: BrowserLoginOptions,
): Promise<results.Result<OAuthTokens, Error>> {
  const { ctx } = options;
  const { url, codeVerifier, state } = await auth.getAuthorizationUrl();

  tui.log.info(
    ctx,
    `Open this URL in your browser to authorize ${platformLabel}:`,
  );
  ctx.output.writeln(span.text(""));
  ctx.output.writeln(span.cyan(`  ${url}`));
  ctx.output.writeln(span.text(""));

  const callback = await receiveCallback(state, options);
  if (results.isFail(callback)) return callback;

  try {
    const tokens = await auth.exchangeCode({
      code: callback.value.code,
      codeVerifier,
    });
    return results.ok(tokens);
  } catch (err) {
    return results.fail(
      new Error(
        `exchange the ${platformLabel} authorization code: ${messageOf(err)}`,
        { cause: err },
      ),
    );
  }
}
