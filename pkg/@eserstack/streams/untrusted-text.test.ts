// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import * as streams from "./mod.ts";
import * as span from "./span.ts";

// OSC 52 clipboard write, cursor up + erase line, SGR, OSC 8 link, DCS, a C1
// CSI byte, CR and BEL: the shapes from the security audit.
const HOSTILE =
  "hello \x1b]52;c;ZWNobyBwd25lZA==\x07\x1b[1A\x1b[2K\x1b[31mFAKE\x1b[0m" +
  "\x1b]8;;https://evil.example\x1b\\docs\x1b]8;;\x1b\\\x1bP+q\x1b\\\x9b31m\rX\x07\tok\n";

// deno-lint-ignore no-control-regex
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/;

const render = async (...spans: span.SpanInput[]): Promise<string> => {
  const sink = streams.sinks.buffer<string>();
  const out = streams.output({ renderer: streams.renderers.plain(), sink });
  out.writeln(...spans);
  await out.close();
  return sink.items().join("");
};

Deno.test("stripTerminalControls keeps only visible text, tab and newline", () => {
  const cleaned = span.stripTerminalControls(HOSTILE);
  assertEquals(CONTROL.test(cleaned), false);
  assertEquals(cleaned, "hello FAKEdocsX\tok\n");
});

Deno.test("untrusted spans reach the sink without control bytes", async () => {
  const printed = await render(span.untrusted(HOSTILE));
  assertEquals(CONTROL.test(printed.replace(/\n$/, "")), false);
  assertEquals(printed.includes("evil.example"), false);
});

Deno.test("untrusted text nested in a style span is still stripped", async () => {
  const sink = streams.sinks.buffer<string>();
  const out = streams.output({ renderer: streams.renderers.ansi(), sink });
  out.writeln(span.bold(span.untrusted(HOSTILE)));
  await out.close();
  const printed = sink.items().join("");
  // Only the renderer's own SGR codes remain.
  // deno-lint-ignore no-control-regex
  const withoutSgr = printed.replace(/\x1b\[[0-9;]*m/g, "");
  assertEquals(CONTROL.test(withoutSgr.replace(/[\t\n]/g, "")), false);
});

Deno.test("plain text spans stay verbatim for the TUI's own cursor control", () => {
  assertEquals(span.text("\x1b[?25l").value, "\x1b[?25l");
});
