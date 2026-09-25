// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import { createElement } from "react";
import { escapeJsonForScript } from "./script-json.ts";
import {
  chunkToInlineScript,
  createInlineRSCStream,
} from "./inline-rsc-emitter.ts";
import { generateRSCPayloadScript } from "./ssr-renderer.ts";

const PAYLOAD = "</script><img src=x onerror=alert(1)><!--\u2028";

const count = (haystack: string, needle: string): number =>
  haystack.toLowerCase().split(needle.toLowerCase()).length - 1;

Deno.test("escapeJsonForScript round-trips and removes markup characters", () => {
  const json = JSON.stringify({ v: PAYLOAD, amp: "a&b>c" });
  const escaped = escapeJsonForScript(json);
  assertEquals(/[<>&\u2028\u2029]/.test(escaped), false);
  assertEquals(JSON.parse(escaped), JSON.parse(json));
});

Deno.test("chunkToInlineScript keeps a </script value inside its element", () => {
  const html = chunkToInlineScript(`J5:${JSON.stringify(PAYLOAD)}`);
  assertEquals(count(html, "</script"), 1);
  assertEquals(count(html, "<!--"), 0);
  assertEquals(html.trimEnd().endsWith("</script>"), true);
});

Deno.test("createInlineRSCStream escapes rendered strings and props", async () => {
  const element = createElement("div", { title: PAYLOAD }, PAYLOAD);
  const html = await new Response(createInlineRSCStream(element, {}))
    .text();
  const scripts = count(html, "<script");
  assertEquals(count(html, "</script"), scripts);
  assertEquals(count(html, "<img"), 0);
});

Deno.test("generateRSCPayloadScript cannot be closed or commented out by a value", () => {
  const html = generateRSCPayloadScript(
    [
      { type: "J", id: 0, value: PAYLOAD },
    ] as Parameters<typeof generateRSCPayloadScript>[0],
  );
  assertEquals(count(html, "</script"), 1);
  assertEquals(count(html, "<!--"), 0);
});
