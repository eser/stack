// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as ReactDOMServer from "react-dom/server";
import * as streams from "@eserstack/streams";
import * as spanRenderer from "./span-renderer.ts";

const renderToHtml = (span: streams.span.Span): string =>
  ReactDOMServer.renderToStaticMarkup(spanRenderer.renderSpan(span, 0));

const CASES = [
  {
    name: "renders a code block with its language class",
    span: streams.span.codeBlock("const a = 1;", "ts"),
    expected: '<pre><code class="language-ts">const a = 1;</code></pre>',
  },
  {
    name: "renders a code block without a language class",
    span: streams.span.codeBlock("plain"),
    expected: "<pre><code>plain</code></pre>",
  },
  {
    name: "renders a gauge as a meter with its percentage and label",
    span: streams.span.gauge(42, { width: 10, label: "Disk" }),
    expected:
      '<span class="inline-flex items-center gap-2">' +
      '<meter min="0" max="100" value="42" aria-label="Disk" style="width:10ch"></meter>' +
      "<span>42%</span><span>Disk</span></span>",
  },
  {
    name: "names a gauge without a label",
    span: streams.span.gauge(150),
    expected:
      '<span class="inline-flex items-center gap-2">' +
      '<meter min="0" max="100" value="100" aria-label="Percentage"></meter>' +
      "<span>100%</span></span>",
  },
  {
    name: "renders a separator without a label as a rule",
    span: streams.span.separator(),
    expected: "<hr/>",
  },
  {
    name: "renders a separator label between two rules",
    span: streams.span.separator("Results"),
    expected:
      '<div class="flex items-center gap-2 text-gray-400">' +
      '<hr class="flex-1"/><span>Results</span><hr class="flex-1"/></div>',
  },
  {
    name: "renders an alert with its level in text",
    span: streams.span.alert("warning", "Disk is ", streams.span.bold("full")),
    expected:
      '<div role="note" class="text-yellow-500" data-level="warning">' +
      "<strong>Warning: </strong>Disk is <strong>full</strong></div>",
  },
];

for (const { name, span, expected } of CASES) {
  nodeTest.test(`renderSpan ${name}`, () => {
    assert.assertEquals(renderToHtml(span), expected);
  });
}
