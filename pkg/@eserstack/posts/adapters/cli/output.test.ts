// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";

// The test looks for terminal control characters, so the pattern must match them.
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/;

// Runs outputPosts in a child process so the real stdout sink is exercised.
const SCRIPT = `
import * as output from ${JSON.stringify(
  new URL("./output.ts", import.meta.url).href,
)};
await output.outputPosts([{
  platform: "bluesky",
  id: "at://did:plc:x/post/1\\x1b[2J",
  text: "hi \\x1b]52;c;ZWNobw==\\x07\\x1b[1A\\x1b[2Kspoofed\\rX",
  createdAt: new Date(0),
}]);
`;

nodeTest.test(
  "outputPosts prints remote post text without terminal controls",
  async () => {
    const { code, stdout } = await runtime.exec.spawn(
      runtime.process.execPath(),
      ["--input-type=module", "--eval", SCRIPT],
      { stdout: "piped", stderr: "inherit" },
    );
    assert.assertEquals(code, 0);

    const printed = new TextDecoder().decode(stdout);
    assert.assertEquals(printed.includes("spoofed"), true, printed);
    // Only the renderer's own SGR styling may remain. The pattern matches the
    // ESC control character that starts each SGR sequence, so it strips them.
    // oxlint-disable-next-line no-control-regex
    const withoutSgr = printed.replace(/\x1b\[[0-9;]*m/g, "");
    assert.assertEquals(
      CONTROL.test(withoutSgr.replace(/\n/g, "")),
      false,
      JSON.stringify(printed),
    );
  },
);
