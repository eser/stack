// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Ajan command group - Commands for the ajan native bridge
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as shellArgs from "@eserstack/shell/args";
import * as span from "@eserstack/streams/span";
import * as streams from "@eserstack/streams";
import * as crossRuntime from "@eserstack/standards/cross-runtime";

const versionHandler = async (
  _ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  try {
    const ffi = await import("@eserstack/ajan");
    const lib = await ffi.loadEserAjan();

    try {
      const version = lib.symbols.EserAjanVersion();
      out.writeln(span.text(version));
    } finally {
      lib.close();
    }
  } catch (err) {
    out.writeln(
      span.red("Error: "),
      span.text(
        `Failed to load ajan library: ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );
    out.writeln();

    // Tailor the advice to the runtime that is actually running.
    //
    // This used to print the Deno build command unconditionally, which is
    // useless to someone who installed the npm package precisely because they
    // do not have Deno — and it named `@eserstack/ajan`, which is not published
    // at all: the CLI depends on the per-platform `@eserstack/ajan-<os>-<arch>`
    // packages as optionalDependencies, so a failed optional install is the
    // usual reason for landing here.
    if (crossRuntime.detectRuntime() === "deno") {
      out.writeln(span.text("To fix this, build the native library:"));
      out.writeln(
        span.text(
          "  deno run --allow-all pkg/@eserstack/ajan/scripts/build.ts",
        ),
      );
    } else {
      out.writeln(
        span.text(
          "The platform library ships as an optional dependency. To fix this:",
        ),
      );
      out.writeln(
        span.text("  reinstall eser and allow optional dependencies"),
      );
      out.writeln(
        span.text(
          "  (it pulls @eserstack/ajan-<os>-<arch> for your platform)",
        ),
      );
    }

    await out.close();
    return results.fail({ exitCode: 1 });
  }

  await out.close();
  return results.ok(undefined);
};

export const ajanCommand = new shellArgs.Command("ajan")
  .description("Ajan native bridge commands")
  .command(
    new shellArgs.Command("version")
      .description("Show ajan library version")
      .run(versionHandler),
  );
