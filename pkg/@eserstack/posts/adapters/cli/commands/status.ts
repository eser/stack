// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `eser posts status`
 *
 * Shows configured platforms and their authentication state, after loading
 * the saved tokens the way the other commands do.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type * as shellArgs from "@eserstack/shell/args";
import type { Platform } from "../../../domain/values/platform.ts";
import type { AuthProvider } from "../../../application/auth-provider.ts";
import * as restoreTokens from "../../../application/restore-saved-tokens.ts";
import type { TokenStore } from "../../../application/token-store.ts";
import * as wiring from "../wiring.ts";

/** One configured platform's login state, as `eser posts status` shows it. */
export type PlatformStatus = {
  readonly platform: Platform;
  /** How the platform logs in: a browser redirect or an app password. */
  readonly flow: "browser" | "credentials";
  readonly state: "authenticated" | "not authenticated" | "unreadable";
  /** Why the saved tokens could not be read, when state is "unreadable". */
  readonly detail: string | null;
};

/** Load the saved tokens and report each configured platform's state. */
export const readPlatformStatuses = async (
  auths: ReadonlyMap<Platform, AuthProvider>,
  tokenStore: TokenStore,
): Promise<readonly PlatformStatus[]> => {
  const { restored, failures } = await restoreTokens.restoreSavedTokens(
    tokenStore,
    auths,
  );
  const failed = new Map(
    failures.map(({ platform, error }) => [platform, error.message]),
  );

  return Array.from(auths, ([platform, auth]): PlatformStatus => {
    const flow = auth.requiresBrowser ? "browser" : "credentials";
    const detail = failed.get(platform);
    if (detail !== undefined) {
      return { platform, flow, state: "unreadable", detail };
    }
    return {
      platform,
      flow,
      state: restored.has(platform) ? "authenticated" : "not authenticated",
      detail: null,
    };
  });
};

const stateLabel = (status: PlatformStatus): span.Span => {
  switch (status.state) {
    case "authenticated":
      return span.green("authenticated");
    case "not authenticated":
      return span.yellow("not authenticated");
    case "unreadable":
      return span.red(`saved tokens unreadable: ${status.detail ?? ""}`);
    default: {
      const unreachable: never = status.state;
      throw new Error(`unhandled status ${String(unreachable)}`);
    }
  }
};

export const main = async (
  _args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const { auths, tokenStore } = await wiring.createAppContext();
  const statuses = await readPlatformStatuses(auths, tokenStore);

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(span.bold("posts — configured platforms"));
  out.writeln("");

  if (statuses.length === 0) {
    out.writeln(span.dim("  No platforms configured."));
    out.writeln(
      span.dim("  Set "),
      span.bold("TWITTER_CLIENT_ID"),
      span.dim(" or "),
      span.bold("BLUESKY_PDS_HOST"),
      span.dim(" to enable a platform."),
    );
  } else {
    for (const status of statuses) {
      const flowLabel =
        status.flow === "browser"
          ? span.dim("(OAuth / browser)")
          : span.dim("(credentials)");
      out.writeln(
        "  ",
        span.bold(status.platform),
        "  ",
        stateLabel(status),
        "  ",
        flowLabel,
      );
    }
  }

  out.writeln("");
  await out.close();

  return results.ok(undefined);
};
