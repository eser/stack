// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as layout from "./layout.ts";

const page = layout.layout("t", "<p>body</p>", {
  includeTerminal: true,
  token: "x",
});

nodeTest.test("every external script and stylesheet is pinned with SRI", () => {
  const external = [
    ...page.matchAll(
      /<(script|link)\b[^>]*(?:src|href)="(https?:[^"]+)"[^>]*>/g,
    ),
  ];
  assert.assert(external.length >= 3, "expected the xterm files");
  for (const [tag] of external) {
    assert.assert(/integrity="sha384-[A-Za-z0-9+/=]{64}"/.test(tag), tag);
    assert.assert(tag.includes('crossorigin="anonymous"'), tag);
  }
  assert.assertEquals(page.includes("cdnjs.cloudflare.com"), false);
  assert.assertEquals(page.includes("xterm-addon-fit"), false);
});

nodeTest.test(
  "the page has no inline script, so the CSP needs no unsafe-inline for scripts",
  () => {
    const inline = [...page.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>/g)];
    assert.assertEquals(inline.length, 0);
    const scriptSrc = layout.PAGE_CSP.split("; ").find((d) =>
      d.startsWith("script-src"),
    );
    assert.assert(scriptSrc !== undefined);
    assert.assertEquals(scriptSrc.includes("unsafe-inline"), false);
    assert.assertEquals(scriptSrc.includes("unsafe-eval"), false);
  },
);

nodeTest.test("HTML responses carry the CSP", () => {
  const headers = layout.htmlHeaders();
  assert.assertEquals(headers["content-security-policy"], layout.PAGE_CSP);
  assert.assert(layout.PAGE_CSP.includes("object-src 'none'"));
  assert.assert(layout.PAGE_CSP.includes("frame-ancestors 'none'"));
});
