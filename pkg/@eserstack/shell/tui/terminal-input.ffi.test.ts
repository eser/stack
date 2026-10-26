// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * readTerminalEvents in a real pseudo-terminal. The child runs under a PTY of
 * the native bridge (shellPtyStream), which also types its keys and resizes
 * it, so the child gets a real tty on stdin and a real SIGWINCH.
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as ffi from "@eserstack/ajan/ffi";

const INPUT_URL = new URL("./terminal-input.ts", import.meta.url).href;
const RUNTIME_URL = import.meta.resolve("@eserstack/standards/cross-runtime");

/**
 * Two readers, the second opened while the first is open: each step prints
 * a marker the driver waits for before it types or resizes.
 */
const childScript = [
  `import * as input from ${JSON.stringify(INPUT_URL)};`,
  `import { runtime } from ${JSON.stringify(RUNTIME_URL)};`,
  `const seen = { first: [], second: [] };`,
  `const note = (event) => event.name === "resize" ? "resize " + event.cols + "x" + event.rows : event.name;`,
  `const say = (line) => runtime.process.writeToStdout(new TextEncoder().encode(line + "\\n"));`,
  `runtime.process.setStdinRaw(true);`,
  `const first = input.readTerminalEvents();`,
  `let pendingFirst = first.next();`,
  `say("READY first");`,
  `seen.first.push(note((await pendingFirst).value));`,
  `pendingFirst = first.next();`,
  `const second = input.readTerminalEvents();`,
  `let pendingSecond = second.next();`,
  `say("READY second");`,
  `seen.second.push(note((await pendingSecond).value));`,
  `say("READY resize");`,
  `seen.second.push(note((await second.next()).value));`,
  `await second.return();`,
  `say("READY back");`,
  `seen.first.push(note((await pendingFirst).value));`,
  `await first.return();`,
  `runtime.process.setStdinRaw(false);`,
  `say("DONE " + JSON.stringify(seen));`,
].join("\n");

nodeTest.test(
  "each key reaches exactly one reader, and a resize is reported in raw mode",
  { timeout: 60_000 },
  async () => {
    const lib = await ffi.loadEserAjan({ wasm: false });
    const pty = lib.stream("shellPtyStream", {
      command: runtime.process.execPath(),
      args: ["--input-type=module", "--eval", childScript],
      cols: 80,
      rows: 24,
    });
    assert.assertEquals(pty.opened.error, undefined);

    let output = "";
    const decoder = new TextDecoder();

    // Every read gives up after 20 s, so a child that stops talking fails the
    // test instead of holding its reader worker forever.
    const deadline = AbortSignal.timeout(20_000);

    /** Reads the child's output until `marker` appears. */
    const waitFor = async (marker: string): Promise<void> => {
      while (!output.includes(marker)) {
        // The child's output arrives in order, one chunk per read.
        // oxlint-disable-next-line no-await-in-loop
        const chunk = await pty.read({ signal: deadline });
        if (chunk === null) {
          throw new Error(`the child ended before "${marker}": ${output}`);
        }
        output += decoder.decode(
          Uint8Array.from(atob(chunk.chunk ?? ""), (c) => c.charCodeAt(0)),
          { stream: true },
        );
      }
    };

    const type = (key: string): void => {
      lib.call("shellPtyWrite", { handle: pty.handle, data: btoa(key) });
    };

    try {
      await waitFor("READY first");
      type("a");
      await waitFor("READY second");
      type("b");
      await waitFor("READY resize");
      lib.call("shellPtyResize", { handle: pty.handle, cols: 100, rows: 30 });
      await waitFor("READY back");
      type("c");
      await waitFor("DONE ");

      const done = output.slice(output.indexOf("DONE ") + 5).split(/\r?\n/)[0]!;
      assert.assertEquals(JSON.parse(done), {
        first: ["a", "c"],
        second: ["b", "resize 100x30"],
      });

      // The readers left no read of stdin open, so the child exits on its
      // own. The output drains one chunk at a time, in order.
      // oxlint-disable-next-line no-await-in-loop
      while ((await pty.read({ signal: deadline })) !== null) {
        // Drains the output until the child exits.
      }
      assert.assertEquals(pty.close().code, 0);
    } finally {
      // Kills a child that is still running (a failed step above), and ends
      // the pane's worker.
      pty.close();
      lib.close();
    }
  },
);
