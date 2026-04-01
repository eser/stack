// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Ajan command group - Commands for the ajan native bridge
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as shellArgs from "@eser/shell/args";
import * as span from "@eser/streams/span";
import * as streams from "@eser/streams";

const versionHandler = async (
  _ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  try {
    const ffi = await import("@eser/ajan");
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
    out.writeln(span.text("To fix this, try one of:"));
    out.writeln(
      span.text(
        "  Build with: deno run --allow-all pkg/@eser/ajan/scripts/build.ts",
      ),
    );
    out.writeln(span.text("  Install via npm: npm install @eser/ajan"));

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
