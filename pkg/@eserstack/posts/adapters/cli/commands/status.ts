// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `eser posts status`
 *
 * Shows configured platforms and their authentication state.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type * as shellArgs from "@eserstack/shell/args";
import * as wiring from "../wiring.ts";

export const main = async (
  _args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const { auths } = await wiring.createAppContext();

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(span.bold("posts — configured platforms"));
  out.writeln("");

  if (auths.size === 0) {
    out.writeln(span.dim("  No platforms configured."));
    out.writeln(
      span.dim("  Set "),
      span.bold("TWITTER_CLIENT_ID"),
      span.dim(" or "),
      span.bold("BLUESKY_PDS_HOST"),
      span.dim(" to enable a platform."),
    );
  } else {
    for (const [platform, auth] of auths.entries()) {
      const authenticated = auth.isAuthenticated();
      const statusLabel = authenticated
        ? span.green("authenticated")
        : span.yellow("not authenticated");
      const flowLabel = auth.requiresBrowser
        ? span.dim("(OAuth / browser)")
        : span.dim("(credentials)");
      out.writeln(
        "  ",
        span.bold(platform),
        "  ",
        statusLabel,
        "  ",
        flowLabel,
      );
    }
  }

  out.writeln("");
  await out.close();

  return results.ok(undefined);
};
