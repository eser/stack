// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import { exec } from "./mod.ts";

// The property under test is that an interpolated argument arrives at the
// process byte-for-byte as it was written. The template does a quote-and-
// re-parse round-trip internally, so it is the round-trip that is being pinned,
// not the quoting or the parsing alone.

Deno.test("exec passes a backslash-bearing argument through unchanged", async () => {
  // This is the case that was broken: escapeArg wraps an argument containing a
  // backslash in single quotes, and splitCommand then treated the backslash as
  // an escape and ate it -- so `\d+` reached the process as `d+`. In POSIX a
  // backslash inside single quotes is literal.
  const arg = String.raw`regex \d+ path C:\tmp and a\\double`;

  const out = await exec`printf %s ${arg}`.noThrow().text();

  assertEquals(out, arg, "the argument was mutated in transit");
});

Deno.test("exec passes quotes and spaces through unchanged", async () => {
  const arg = `it's a "quoted" phrase with  spaces`;

  const out = await exec`printf %s ${arg}`.noThrow().text();

  assertEquals(out, arg);
});

Deno.test("exec passes shell metacharacters through as data", async () => {
  // If any of this were re-interpreted rather than passed as one argument, the
  // output would differ -- and a prompt containing `$(...)` would execute.
  const arg = `$(id) \`id\` ; rm -rf / | cat & $HOME`;

  const out = await exec`printf %s ${arg}`.noThrow().text();

  assertEquals(out, arg);
});

Deno.test("exec keeps a multi-line argument intact", async () => {
  // Prompts are multi-line, and this is the shape the noskills bridge feeds in.
  //
  // No leading or trailing whitespace in the fixture: `.text()` trims its
  // OUTPUT by design, so testing edge whitespace here would be asserting
  // against that rather than against argument handling. The interior newlines
  // and tab are the part that has to survive.
  const arg = "line one\nline two\n\tindented";

  const out = await exec`printf %s ${arg}`.noThrow().text();

  assertEquals(out, arg);
});

// ── stdinText ────────────────────────────────────────────────────────────────

Deno.test("exec delivers a payload on stdin", async () => {
  const payload = "line one\nline two";

  const out = await exec`cat`.stdinText(payload).noThrow().text();

  assertEquals(out, payload);
});

// The point of stdinText. A 4 MiB argument is past ARG_MAX on macOS (~1 MiB)
// and on typical Linux per-argument limits, so an implementation that routed
// this through argv would fail to spawn at all rather than merely truncate.
Deno.test("exec delivers a payload larger than argv could carry", async () => {
  const payload = "x".repeat(4 * 1024 * 1024);

  const out = await exec`cat`.stdinText(payload).noThrow().text();

  assertEquals(out.length, payload.length);
});

// A process that exits without draining stdin closes the pipe under the
// writer. That is the process's business; the call must still report its exit
// rather than surfacing EPIPE as a spawn failure.
Deno.test("exec survives a process that ignores its stdin", async () => {
  const result = await exec`true`
    .stdinText("y".repeat(1024 * 1024))
    .noThrow()
    .spawn();

  assertEquals(result.code, 0);
});

// An empty interpolation must still occupy an argv slot. When it vanished,
// `cmd -p ${""} --flag` reached the process as `cmd -p --flag`, so `--flag`
// was consumed as the value of `-p` and the command silently did the wrong
// thing rather than failing.
Deno.test("exec keeps an empty interpolation as its own argument", async () => {
  const empty = "";

  const out = await exec`printf [%s][%s] ${empty} after`.noThrow().text();

  assertEquals(out, "[][after]");
});
