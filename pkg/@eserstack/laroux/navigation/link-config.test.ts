// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import type * as types from "./types.ts";
import * as linkConfig from "./link-config.ts";

const NO_MODIFIERS: types.ModifierKeys = {
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};

const analyzeCases: ReadonlyArray<{
  readonly name: string;
  readonly href: string;
  readonly modifiers?: Partial<types.ModifierKeys>;
  readonly expected: types.NavigationAnalysis;
}> = [
  {
    name: "handles an absolute path",
    href: "/stories/hello",
    expected: { shouldHandle: true },
  },
  {
    name: "handles a path with a query and a hash",
    href: "/search?q=laroux#results",
    expected: { shouldHandle: true },
  },
  {
    name: "handles a dot-relative path",
    href: "./details",
    expected: { shouldHandle: true },
  },
  {
    name: "handles a bare relative path",
    href: "details",
    expected: { shouldHandle: true },
  },
  {
    name: "handles a query-only link",
    href: "?page=2",
    expected: { shouldHandle: true },
  },
  {
    name: "handles a relative path whose query holds a colon",
    href: "a?b=c:d",
    expected: { shouldHandle: true },
  },
  {
    name: "leaves a hash-only link to the browser",
    href: "#comments",
    expected: { shouldHandle: false, reason: "hash" },
  },
  {
    name: "leaves an https URL to the browser",
    href: "https://example.com/about",
    expected: { shouldHandle: false, reason: "external" },
  },
  {
    name: "leaves an http URL to the browser, whatever its case",
    href: "HTTP://example.com",
    expected: { shouldHandle: false, reason: "external" },
  },
  {
    name: "leaves a protocol-relative URL to the browser",
    href: "//cdn.example.com/file.pdf",
    expected: { shouldHandle: false, reason: "external" },
  },
  {
    name: "leaves a backslash protocol-relative URL to the browser",
    href: "/\\cdn.example.com/file.pdf",
    expected: { shouldHandle: false, reason: "external" },
  },
  {
    name: "leaves a mailto link to the browser",
    href: "mailto:team@example.com",
    expected: { shouldHandle: false, reason: "mailto" },
  },
  {
    name: "leaves a tel link to the browser",
    href: "tel:+15555550100",
    expected: { shouldHandle: false, reason: "tel" },
  },
  {
    name: "leaves an ftp URL to the browser",
    href: "ftp://files.example.com/report.csv",
    expected: { shouldHandle: false, reason: "external" },
  },
  {
    name: "leaves a javascript: URL to the browser",
    href: "javascript:void(0)",
    expected: { shouldHandle: false, reason: "external" },
  },
  {
    name: "leaves a data: URL to the browser",
    href: "data:text/plain,hello",
    expected: { shouldHandle: false, reason: "external" },
  },
  {
    name: "leaves an unparseable https URL to the browser",
    href: "https://",
    expected: { shouldHandle: false, reason: "external" },
  },
  {
    name: "leaves a click with the meta key to the browser",
    href: "/stories",
    modifiers: { metaKey: true },
    expected: { shouldHandle: false, reason: "modifier-key" },
  },
  {
    name: "leaves a click with the ctrl key to the browser",
    href: "/stories",
    modifiers: { ctrlKey: true },
    expected: { shouldHandle: false, reason: "modifier-key" },
  },
  {
    name: "leaves a click with the shift key to the browser",
    href: "/stories",
    modifiers: { shiftKey: true },
    expected: { shouldHandle: false, reason: "modifier-key" },
  },
  {
    name: "leaves a click with the alt key to the browser",
    href: "/stories",
    modifiers: { altKey: true },
    expected: { shouldHandle: false, reason: "modifier-key" },
  },
  {
    name: "reports a modifier key before the kind of link",
    href: "https://example.com",
    modifiers: { metaKey: true },
    expected: { shouldHandle: false, reason: "modifier-key" },
  },
];

for (const { name, href, modifiers, expected } of analyzeCases) {
  Deno.test(`analyzeNavigation ${name}`, () => {
    assert.assertEquals(
      linkConfig.analyzeNavigation(href, { ...NO_MODIFIERS, ...modifiers }),
      expected,
    );
  });
}

Deno.test("buildLinkConfig applies the defaults", () => {
  assert.assertEquals(linkConfig.buildLinkConfig({ href: "/stories" }), {
    href: "/stories",
    replace: false,
    scroll: true,
  });
});

Deno.test("buildLinkConfig keeps explicit values, including false", () => {
  assert.assertEquals(
    linkConfig.buildLinkConfig({
      href: "/stories",
      replace: true,
      scroll: false,
    }),
    { href: "/stories", replace: true, scroll: false },
  );
});

const externalCases: ReadonlyArray<readonly [string, boolean]> = [
  ["https://example.com", true],
  ["http://example.com/path", true],
  ["//cdn.example.com/app.js", true],
  ["/about", false],
  ["about", false],
  ["#top", false],
  ["mailto:team@example.com", false],
  ["ftp://files.example.com", false],
];

for (const [href, expected] of externalCases) {
  Deno.test(`isExternalUrl("${href}") is ${expected}`, () => {
    assert.assertEquals(linkConfig.isExternalUrl(href), expected);
  });
}

const specialProtocolCases: ReadonlyArray<readonly [string, boolean]> = [
  ["mailto:team@example.com", true],
  ["MAILTO:team@example.com", true],
  ["tel:+15555550100", true],
  ["https://example.com", false],
  ["/contact", false],
  ["sms:+15555550100", false],
];

for (const [href, expected] of specialProtocolCases) {
  Deno.test(`isSpecialProtocol("${href}") is ${expected}`, () => {
    assert.assertEquals(linkConfig.isSpecialProtocol(href), expected);
  });
}
