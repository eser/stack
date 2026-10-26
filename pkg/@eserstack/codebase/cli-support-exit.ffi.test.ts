// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * A CLI entry point ends on its own, with its exit code.
 *
 * exitCli used to exit the process itself, because the Go library could crash
 * Deno on teardown and lose the code. Under Node it does not (TASK-175,
 * measurement (c); ajan's teardown.ffi.test.ts), so exitCli only sets the
 * code. The child here does what a CLI command can do before it returns: read
 * a key the way the prompts do, in a real pseudo-terminal, and run a blocking
 * bridge call in a worker thread. It must then exit on its own, at once, with
 * the code exitCli set.
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as ffi from "@eserstack/ajan/ffi";

const SUPPORT_URL = new URL("./cli-support.ts", import.meta.url).href;
const TUI_URL = import.meta.resolve("@eserstack/shell/tui");
const FFI_URL = import.meta.resolve("@eserstack/ajan/ffi");
const RESULTS_URL = import.meta.resolve("@eserstack/primitives/results");
const RUNTIME_URL = import.meta.resolve("@eserstack/standards/cross-runtime");

const childScript = [
  `import * as cliSupport from ${JSON.stringify(SUPPORT_URL)};`,
  `import * as tui from ${JSON.stringify(TUI_URL)};`,
  `import * as ffi from ${JSON.stringify(FFI_URL)};`,
  `import * as results from ${JSON.stringify(RESULTS_URL)};`,
  `import { runtime } from ${JSON.stringify(RUNTIME_URL)};`,
  `const lib = await ffi.loadEserAjan({ wasm: false });`,
  `await lib.call("shellExec", { command: "true", timeout: "5s" });`,
  `runtime.process.setStdinRaw(true);`,
  `const keys = tui.readKeypress(runtime.process.stdin)[Symbol.asyncIterator]();`,
  `const pending = keys.next();`,
  `runtime.process.writeToStdout(new TextEncoder().encode("READY\\n"));`,
  `await pending;`,
  `await keys.return();`,
  `runtime.process.setStdinRaw(false);`,
  `await cliSupport.exitCli(results.fail({ exitCode: 4 }));`,
].join("\n");

nodeTest.test(
  "after a prompt and a bridge call, exitCli's code survives a natural exit",
  { timeout: 60_000 },
  async () => {
    const lib = await ffi.loadEserAjan({ wasm: false });
    const pty = lib.stream("shellPtyStream", {
      command: runtime.process.execPath(),
      args: ["--input-type=module", "--eval", childScript],
    });
    assert.assertEquals(pty.opened.error, undefined);

    const decoder = new TextDecoder();
    let output = "";
    let typed = false;
    let typedAt = 0;
    // A child that stays alive fails the read here, which kills it.
    const deadline = AbortSignal.timeout(20_000);

    try {
      while (true) {
        // The child's output arrives in order, one chunk per read.
        // oxlint-disable-next-line no-await-in-loop
        const chunk = await pty.read({ signal: deadline });
        if (chunk === null) {
          break;
        }

        output += decoder.decode(
          Uint8Array.from(atob(chunk.chunk ?? ""), (c) => c.charCodeAt(0)),
          { stream: true },
        );
        if (!typed && output.includes("READY")) {
          typed = true;
          typedAt = performance.now();
          lib.call("shellPtyWrite", { handle: pty.handle, data: btoa("y") });
        }
      }

      const exitMs = performance.now() - typedAt;
      assert.assertEquals(pty.close().code, 4, output);
      assert.assertLess(exitMs, 5_000, `the child took ${exitMs} ms to exit`);
    } finally {
      pty.close();
      lib.close();
    }
  },
);
