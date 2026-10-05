// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as shellExec from "@eserstack/shell/exec";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as config from "../config.ts";
import type * as generation from "../generation.ts";
import type * as model from "../model.ts";
import * as claudeCode from "./claude-code.ts";
import * as kiro from "./kiro.ts";
import * as opencode from "./opencode.ts";

// TASK-102: a consumer that stops reading a CLI adapter's stream early also
// stops the CLI. Before, the CLI kept running with nobody reading its stdout
// and blocked forever once the pipe was full. The spawn goes through the native
// library.

// A stand-in CLI that writes its pid next to itself, then prints one JSON event
// per line until it is stopped. Each adapter below turns a line into a
// content_delta. It leaves the prompt on stdin unread.
const ENDLESS_CLI = `#!/bin/sh
echo $$ > "$(dirname "$0")/pid"
while :; do
  echo '{"type":"content_block_delta","delta":{"type":"text_delta","text":"tick"}}'
done
`;

// The same CLI's two lines, printed once, after which it exits 0.
const FINITE_CLI = `#!/bin/sh
echo '{"type":"content_block_delta","delta":{"type":"text_delta","text":"tick"}}'
echo '{"type":"result","subtype":"success","result":"tick"}'
`;

const hi = [{
  role: "user" as const,
  content: [{ kind: "text" as const, text: "hi" }],
}];

// kill -0 sends no signal: it exits 0 only while the process exists.
const isRunning = async (pid: string): Promise<boolean> =>
  await shellExec.exec`kill -0 ${pid}`.code() === 0;

const cases: ReadonlyArray<{
  readonly name: string;
  readonly create: (binary: string) => model.LanguageModel;
}> = [
  {
    name: "claude-code with text output",
    create: (binary) =>
      new claudeCode.ClaudeCodeModel(
        binary,
        config.withDefaults({ provider: "claude-code", model: "" }),
      ),
  },
  {
    name: "claude-code with stream-json output",
    create: (binary) =>
      new claudeCode.ClaudeCodeModel(
        binary,
        config.withDefaults({
          provider: "claude-code",
          model: "",
          properties: { streamFormat: "stream-json" },
        }),
      ),
  },
  {
    name: "kiro",
    create: (binary) =>
      new kiro.KiroModel(
        binary,
        config.withDefaults({ provider: "kiro", model: "" }),
      ),
  },
  {
    name: "opencode",
    create: (binary) =>
      new opencode.OpenCodeModel(
        binary,
        config.withDefaults({ provider: "opencode", model: "" }),
      ),
  },
];

// Creates the stand-in CLI from `script` in a temporary directory, runs `fn`
// with its path, and removes the directory afterwards.
const withStandInCli = async (
  script: string,
  fn: (binary: string, dir: string) => Promise<void>,
): Promise<void> => {
  // The adapters spawn through the synchronous child(), which needs the native
  // library that the first spawn() loads.
  await shellExec.exec`true`.text();

  const dir = await crossRuntime.runtime.fs.makeTempDir({
    prefix: "eser-cli-stop-",
  });
  const binary = crossRuntime.runtime.path.join(dir, "cli");

  try {
    await crossRuntime.runtime.fs.writeTextFile(binary, script);
    await crossRuntime.runtime.fs.chmod(binary, 0o755);
    await fn(binary, dir);
  } finally {
    await crossRuntime.runtime.fs.remove(dir, { recursive: true });
  }
};

for (const { name, create } of cases) {
  Deno.test({
    name: `${name}: breaking out after the first event stops the CLI`,
    // The stand-in CLI is a POSIX shell script.
    ignore: crossRuntime.getPlatform() === "windows",
    // The native library the first spawn loads outlives the test.
    sanitizeResources: false,
    fn: () =>
      withStandInCli(ENDLESS_CLI, async (binary, dir) => {
        let pid: string | null = null;

        try {
          const events: generation.StreamEvent[] = [];

          for await (
            const event of create(binary).streamText({ messages: hi })
          ) {
            events.push(event);
            break;
          }

          // The CLI writes its pid before its first line, so the file exists.
          pid = (await crossRuntime.runtime.fs.readTextFile(
            crossRuntime.runtime.path.join(dir, "pid"),
          )).trim();

          assert.assertEquals(events.map((e) => e.kind), ["content_delta"]);
          assert.assertFalse(
            await isRunning(pid),
            `the CLI (pid ${pid}) is still running after the consumer stopped`,
          );
        } finally {
          // A CLI the adapter failed to stop loops forever; do not leave it.
          if (pid !== null && await isRunning(pid)) {
            await shellExec.exec`kill -9 ${pid}`.code();
          }
        }
      }),
  });

  Deno.test({
    name:
      `${name}: a CLI that exits on its own ends the stream with message_done`,
    // The stand-in CLI is a POSIX shell script.
    ignore: crossRuntime.getPlatform() === "windows",
    // The native library the first spawn loads outlives the test.
    sanitizeResources: false,
    fn: () =>
      withStandInCli(FINITE_CLI, async (binary) => {
        const events: generation.StreamEvent[] = [];

        for await (const event of create(binary).streamText({ messages: hi })) {
          events.push(event);
        }

        assert.assertEquals(events.filter((e) => e.kind === "error"), []);
        assert.assertEquals(events.at(0)?.kind, "content_delta");
        assert.assertEquals(events.at(-1)?.kind, "message_done");
      }),
  });
}
