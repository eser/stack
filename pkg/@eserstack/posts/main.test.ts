// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";

const MAIN = runtime.path.join(import.meta.dirname ?? ".", "main.ts");

/** One run of the CLI entry in its own process. */
const RUN_TIMEOUT_MS = 30_000;

/** Runs main.ts the way the `eser-posts` bin does, with these arguments. */
const runMain = async (
  ...args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> => {
  const result = await runtime.exec.spawn(
    runtime.process.execPath(),
    [MAIN, ...args],
    {
      stdout: "piped",
      stderr: "piped",
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
    },
  );
  const decoder = new TextDecoder();

  return {
    code: result.code,
    stdout: decoder.decode(result.stdout),
    stderr: decoder.decode(result.stderr),
  };
};

nodeTest.test("eser-posts --help lists the posts commands", async () => {
  const result = await runMain("--help");

  assert.assertEquals(result.code, 0, result.stderr);
  assert.assertStringIncludes(result.stdout, "eser-posts");
  assert.assertStringIncludes(result.stdout, "compose");
  assert.assertStringIncludes(result.stdout, "timeline");
});
