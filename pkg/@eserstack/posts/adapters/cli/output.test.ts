// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";

// deno-lint-ignore no-control-regex
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/;

// Runs outputPosts in a child process so the real stdout sink is exercised.
const SCRIPT = `
import { outputPosts } from ${
  JSON.stringify(new URL("./output.ts", import.meta.url).href)
};
await outputPosts([{
  platform: "bluesky",
  id: "at://did:plc:x/post/1\\x1b[2J",
  text: "hi \\x1b]52;c;ZWNobw==\\x07\\x1b[1A\\x1b[2Kspoofed\\rX",
  createdAt: new Date(0),
}]);
`;

Deno.test("outputPosts prints remote post text without terminal controls", async () => {
  const { code, stdout } = await new Deno.Command(Deno.execPath(), {
    args: ["eval", "--ext=ts", SCRIPT],
    stdout: "piped",
    stderr: "inherit",
  }).output();
  assertEquals(code, 0);

  const printed = new TextDecoder().decode(stdout);
  assertEquals(printed.includes("spoofed"), true, printed);
  // Only the renderer's own SGR styling may remain.
  // deno-lint-ignore no-control-regex
  const withoutSgr = printed.replace(/\x1b\[[0-9;]*m/g, "");
  assertEquals(
    CONTROL.test(withoutSgr.replace(/\n/g, "")),
    false,
    JSON.stringify(printed),
  );
});
