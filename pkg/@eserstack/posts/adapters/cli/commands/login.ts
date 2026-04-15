// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `eser posts login [--platform=<platform>] [--handle=<handle>] [--password=<password>]`
 *
 * Browser-based platforms (Twitter): prints the authorization URL.
 * Credential-based platforms (Bluesky): requires --handle and --password.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type * as shellArgs from "@eserstack/shell/args";
import type { Platform } from "../../../domain/values/platform.ts";
import * as wiring from "../wiring.ts";
import * as output from "../output.ts";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  let platform: Platform | undefined;
  let handle: string | undefined;
  let password: string | undefined;

  for (const arg of args ?? []) {
    if (arg.startsWith("--platform=")) {
      platform = arg.slice("--platform=".length) as Platform;
    } else if (arg.startsWith("--handle=")) {
      handle = arg.slice("--handle=".length);
    } else if (arg.startsWith("--password=")) {
      password = arg.slice("--password=".length);
    }
  }

  const { auths, tokenStore } = await wiring.createAppContext();

  const targetPlatforms: Platform[] = platform !== undefined
    ? [platform]
    : Array.from(auths.keys());

  for (const p of targetPlatforms) {
    const auth = auths.get(p);
    if (auth === undefined) {
      await output.outputError(`Platform "${p}" is not configured.`);
      continue;
    }

    if (auth.requiresBrowser) {
      const { url, codeVerifier } = await auth.getAuthorizationUrl();
      const out = streams.output({
        renderer: streams.renderers.ansi(),
        sink: streams.sinks.stdout(),
      });
      out.writeln(span.bold(`[${p}]`), " Open this URL to authorize:");
      out.writeln(span.cyan(url));
      out.writeln("");
      out.writeln(
        span.dim("After authorizing, run: "),
        span.bold(
          `eser posts login-callback --platform=${p} --verifier=${codeVerifier} --code=<CODE>`,
        ),
      );
      await out.close();
    } else {
      if (handle === undefined || password === undefined) {
        await output.outputError(
          `Usage for ${p}: eser posts login --platform=${p} --handle=<handle> --password=<password>`,
        );
        return results.fail({ exitCode: 1 });
      }
      try {
        const tokens = await auth.loginWithCredentials({
          identifier: handle,
          password,
        });
        auth.setTokens(tokens);
        await tokenStore.save(p, tokens);
        await output.outputSuccess(`Logged in to ${p} as ${handle}`);
      } catch (err) {
        await output.outputError(
          `Login to ${p} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return results.fail({ exitCode: 1 });
      }
    }
  }

  return results.ok(undefined);
};
