// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, assertEquals } from "@std/assert";
import { htmlHeaders, layout, PAGE_CSP } from "./layout.ts";

const page = layout("t", "<p>body</p>", { includeTerminal: true, token: "x" });

Deno.test("every external script and stylesheet is pinned with SRI", () => {
  const external = [
    ...page.matchAll(
      /<(script|link)\b[^>]*(?:src|href)="(https?:[^"]+)"[^>]*>/g,
    ),
  ];
  assert(external.length >= 3, "expected the xterm files");
  for (const [tag] of external) {
    assert(/integrity="sha384-[A-Za-z0-9+/=]{64}"/.test(tag), tag);
    assert(tag.includes('crossorigin="anonymous"'), tag);
  }
  assertEquals(page.includes("cdnjs.cloudflare.com"), false);
  assertEquals(page.includes("xterm-addon-fit"), false);
});

Deno.test("the page has no inline script, so the CSP needs no unsafe-inline for scripts", () => {
  const inline = [...page.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>/g)];
  assertEquals(inline.length, 0);
  const scriptSrc = PAGE_CSP.split("; ").find((d) =>
    d.startsWith("script-src")
  );
  assert(scriptSrc !== undefined);
  assertEquals(scriptSrc.includes("unsafe-inline"), false);
  assertEquals(scriptSrc.includes("unsafe-eval"), false);
});

Deno.test("HTML responses carry the CSP", () => {
  const headers = htmlHeaders();
  assertEquals(headers["content-security-policy"], PAGE_CSP);
  assert(PAGE_CSP.includes("object-src 'none'"));
  assert(PAGE_CSP.includes("frame-ancestors 'none'"));
});
