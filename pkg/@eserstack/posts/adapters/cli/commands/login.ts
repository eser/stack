// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `eser posts login [--platform=<platform>] [--handle=<handle>]`
 *
 * Logs in to one platform, or to every configured platform in turn when
 * --platform is omitted, and saves the tokens so later commands use them.
 *
 * Twitter/X logs in through the browser: the command prints the authorization
 * URL, waits for the redirect on the loopback address in TWITTER_REDIRECT_URI
 * (or asks for the redirect URL when none arrives), checks its state,
 * exchanges the code and saves the tokens.
 *
 * Bluesky logs in with the app password in BLUESKY_APP_PASSWORD, for the
 * account in --handle or BLUESKY_IDENTIFIER, read from the environment or a
 * .env file. The password is never a flag: a flag value stays in the shell
 * history and shows in the process list.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import type * as shellArgs from "@eserstack/shell/args";
import * as tui from "@eserstack/shell/tui";
import type { OAuthTokens } from "../../../domain/entities/user.ts";
import type { Platform } from "../../../domain/values/platform.ts";
import type { AuthProvider } from "../../../application/auth-provider.ts";
import type { TokenStore } from "../../../application/token-store.ts";
import * as browserLogin from "../../tui/browser-login.ts";
import * as costs from "../../tui/costs.ts";
import * as wiring from "../wiring.ts";
import * as output from "../output.ts";

const USAGE =
  "Usage: eser posts login [--platform=<platform>] [--handle=<handle>]";

const PASSWORD_FLAG_REMOVED =
  "--password is not accepted: a password on the command line stays in the shell history and shows in the process list. " +
  "Set BLUESKY_APP_PASSWORD in the environment or in .env.local instead.";

/** The flags of `eser posts login`. */
export type LoginArgs = {
  readonly platform: string | undefined;
  readonly handle: string | undefined;
};

/** The Bluesky account settings: BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD. */
export type BlueskyCredentials = {
  readonly identifier: string | undefined;
  readonly appPassword: string | undefined;
};

/** What `login` works with; `main` wires the real ones, tests pass fakes. */
export type LoginDeps = {
  readonly auths: ReadonlyMap<Platform, AuthProvider>;
  readonly tokenStore: TokenStore;
  readonly bluesky: BlueskyCredentials;
  /** Runs the browser login of a provider that requires one. */
  readonly browserLogin: (
    platform: Platform,
    auth: AuthProvider,
  ) => Promise<results.Result<OAuthTokens, Error>>;
};

/** The outcome of one platform's login, for the command to print. */
export type LoginOutcome = {
  readonly platform: string;
  readonly ok: boolean;
  readonly message: string;
};

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/**
 * How an unknown argument is named in an error. The value is left out: a
 * mistyped flag such as `--pasword=...` may still carry a password.
 */
const describeArgument = (arg: string): string => {
  if (!arg.startsWith("--")) return "positional arguments are not accepted";
  const equals = arg.indexOf("=");
  const flag = equals === -1 ? arg : arg.slice(0, equals);
  return `unknown flag ${flag}`;
};

/** Parse the flags; anything else, `--password` included, is an error. */
export const parseLoginArgs = (
  args: readonly string[],
): results.Result<LoginArgs, string> => {
  let platform: string | undefined;
  let handle: string | undefined;

  for (const arg of args) {
    if (arg === "--password" || arg.startsWith("--password=")) {
      return results.fail(PASSWORD_FLAG_REMOVED);
    }
    if (arg.startsWith("--platform=")) {
      platform = arg.slice("--platform=".length);
    } else if (arg.startsWith("--handle=")) {
      handle = arg.slice("--handle=".length);
    } else {
      return results.fail(
        `Invalid argument: ${describeArgument(arg)}. ${USAGE}`,
      );
    }
  }

  return results.ok({ platform, handle });
};

const loginWithAppPassword = async (
  auth: AuthProvider,
  handle: string | undefined,
  credentials: BlueskyCredentials,
): Promise<results.Result<{ tokens: OAuthTokens; account: string }, Error>> => {
  const identifier = handle ?? credentials.identifier;
  const password = credentials.appPassword;
  const hasIdentifier = identifier !== undefined && identifier !== "";
  const hasPassword = password !== undefined && password !== "";

  if (!hasIdentifier || !hasPassword) {
    const missing = [
      ...(hasIdentifier ? [] : ["BLUESKY_IDENTIFIER (or --handle)"]),
      ...(hasPassword ? [] : ["BLUESKY_APP_PASSWORD"]),
    ];
    return results.fail(
      new Error(
        `set ${missing.join(
          " and ",
        )} in the environment or in .env.local; use an app password from the Bluesky settings, not your main password`,
      ),
    );
  }

  try {
    const tokens = await auth.loginWithCredentials({ identifier, password });
    auth.setTokens(tokens);
    return results.ok({ tokens, account: identifier });
  } catch (err) {
    return results.fail(err instanceof Error ? err : new Error(String(err)));
  }
};

/** Log in to one platform and save its tokens. */
export const loginPlatform = async (
  platform: string,
  args: LoginArgs,
  deps: LoginDeps,
): Promise<LoginOutcome> => {
  const auth = deps.auths.get(platform as Platform);
  if (auth === undefined) {
    return {
      platform,
      ok: false,
      message: `Platform ${JSON.stringify(
        platform,
      )} is not configured; the configured platforms are ${Array.from(
        deps.auths.keys(),
      ).join(", ")}`,
    };
  }
  // The lookup found a provider, so the value names a configured platform.
  return await loginConfigured(platform as Platform, auth, args, deps);
};

const loginConfigured = async (
  platform: Platform,
  auth: AuthProvider,
  args: LoginArgs,
  deps: LoginDeps,
): Promise<LoginOutcome> => {
  let tokens: OAuthTokens;
  let account = "";
  if (auth.requiresBrowser) {
    const result = await deps.browserLogin(platform, auth);
    if (results.isFail(result)) {
      return {
        platform,
        ok: false,
        message: `Login to ${platform} failed: ${result.error.message}`,
      };
    }
    tokens = result.value;
  } else {
    const result = await loginWithAppPassword(auth, args.handle, deps.bluesky);
    if (results.isFail(result)) {
      return {
        platform,
        ok: false,
        message: `Login to ${platform} failed: ${result.error.message}`,
      };
    }
    tokens = result.value.tokens;
    account = ` as ${result.value.account}`;
  }

  try {
    await deps.tokenStore.save(platform, tokens);
  } catch (err) {
    return {
      platform,
      ok: false,
      message: `Logged in to ${platform}${account}, but saving the tokens failed, so later commands will not see this login: ${messageOf(
        err,
      )}`,
    };
  }

  return {
    platform,
    ok: true,
    message: `Logged in to ${platform}${account}; later commands use the saved session.`,
  };
};

/**
 * Log in to the platform in args, or to every configured platform. Each
 * outcome goes to `report` as it happens; the first failure stops the run.
 */
export const login = async (
  args: LoginArgs,
  deps: LoginDeps,
  report: (outcome: LoginOutcome) => Promise<void>,
): Promise<shellArgs.CliResult<void>> => {
  const targets: readonly string[] =
    args.platform !== undefined
      ? [args.platform]
      : Array.from(deps.auths.keys());

  for (const platform of targets) {
    // Platforms log in one at a time: a browser login waits for the user,
    // their tokens share one token file, and the first failure stops the
    // command.
    // oxlint-disable-next-line no-await-in-loop
    const outcome = await loginPlatform(platform, args, deps);
    // Each outcome prints before the next platform's login starts.
    // oxlint-disable-next-line no-await-in-loop
    await report(outcome);
    if (!outcome.ok) return results.fail({ exitCode: 1 });
  }

  return results.ok(undefined);
};

const printOutcome = (outcome: LoginOutcome): Promise<void> =>
  outcome.ok
    ? output.outputSuccess(outcome.message)
    : output.outputError(outcome.message);

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = parseLoginArgs(args ?? []);
  if (results.isFail(parsed)) {
    await output.outputError(parsed.error);
    return results.fail({ exitCode: 1 });
  }

  const app = await wiring.createAppContext();

  return await login(
    parsed.value,
    {
      auths: app.auths,
      tokenStore: app.tokenStore,
      bluesky: {
        identifier: app.config.bluesky.identifier,
        appPassword: app.config.bluesky.appPassword,
      },
      // The terminal context, and with it stdin, is opened only for a browser
      // login, which may prompt for the redirect URL.
      browserLogin: (platform, auth) =>
        browserLogin.runBrowserLogin(costs.PLATFORM_LABELS[platform], auth, {
          ctx: tui.createTuiContext(),
          redirectUri: app.twitterRedirectUri,
        }),
    },
    printOutcome,
  );
};
