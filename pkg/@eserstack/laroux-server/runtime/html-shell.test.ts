// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import type { ChunkManifest } from "@eserstack/laroux-bundler";
import * as htmlShell from "./html-shell.ts";

const OPEN_TAG = '<script id="__RSC_PAYLOAD__" type="application/json">';

// Values that reach the payload through server component output.
const HOSTILE_CHUNKS = [
  { id: 0, text: "<!--<script>" },
  { id: 1, text: "</script><img src=x onerror=alert(1)>" },
  { id: 2, text: "a & b > c    " },
];

const renderShell = (rscPayload: string): string =>
  htmlShell.createHtmlShell({
    chunkManifest: { buildId: "test" } as unknown as ChunkManifest,
    entrypoint: "/client.js",
    rscPayload,
  });

/** Returns the text between the payload's opening tag and the next `</script`. */
const payloadText = (html: string): string => {
  const start = html.indexOf(OPEN_TAG);
  assert.assertNotEquals(start, -1);

  const contentStart = start + OPEN_TAG.length;
  const end = html.toLowerCase().indexOf("</script", contentStart);
  assert.assertNotEquals(end, -1);

  return html.slice(contentStart, end);
};

nodeTest.test(
  "track-l-delete: createHtmlShell escapes comment and script openers in the RSC payload",
  () => {
    const html = renderShell(JSON.stringify(HOSTILE_CHUNKS));
    const text = payloadText(html);

    assert.assertFalse(
      text.includes("<"),
      `raw "<" inside the payload: ${text}`,
    );
    assert.assertFalse(text.includes(">"));

    // Exactly one closing tag follows the payload's opening tag before the
    // client entry script.
    const afterOpen = html.slice(html.indexOf(OPEN_TAG));
    const beforeEntry = afterOpen.slice(
      0,
      afterOpen.indexOf('<script type="module"'),
    );
    assert.assertEquals(beforeEntry.match(/<\/script/gi)?.length, 1);
  },
);

nodeTest.test(
  "track-l-delete: the escaped RSC payload parses back to the same chunks",
  () => {
    const html = renderShell(JSON.stringify(HOSTILE_CHUNKS));

    // The client reads the element's textContent and passes it to JSON.parse.
    assert.assertEquals(JSON.parse(payloadText(html)), HOSTILE_CHUNKS);
  },
);
