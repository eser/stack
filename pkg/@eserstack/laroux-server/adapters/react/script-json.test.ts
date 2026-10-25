// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as React from "react";
import * as scriptJson from "./script-json.ts";
import * as inlineRscEmitter from "./inline-rsc-emitter.ts";
import * as ssrRenderer from "./ssr-renderer.ts";

const PAYLOAD = "</script><img src=x onerror=alert(1)><!--\u2028";

const count = (haystack: string, needle: string): number =>
  haystack.toLowerCase().split(needle.toLowerCase()).length - 1;

nodeTest.test(
  "escapeJsonForScript round-trips and removes markup characters",
  () => {
    const json = JSON.stringify({ v: PAYLOAD, amp: "a&b>c" });
    const escaped = scriptJson.escapeJsonForScript(json);
    assert.assertEquals(/[<>&\u2028\u2029]/.test(escaped), false);
    assert.assertEquals(JSON.parse(escaped), JSON.parse(json));
  },
);

nodeTest.test(
  "chunkToInlineScript keeps a </script value inside its element",
  () => {
    const html = inlineRscEmitter.chunkToInlineScript(
      `J5:${JSON.stringify(PAYLOAD)}`,
    );
    assert.assertEquals(count(html, "</script"), 1);
    assert.assertEquals(count(html, "<!--"), 0);
    assert.assertEquals(html.trimEnd().endsWith("</script>"), true);
  },
);

nodeTest.test(
  "createInlineRSCStream escapes rendered strings and props",
  async () => {
    const element = React.createElement("div", { title: PAYLOAD }, PAYLOAD);
    const html = await new Response(
      inlineRscEmitter.createInlineRSCStream(element, {}),
    ).text();
    const scripts = count(html, "<script");
    assert.assertEquals(count(html, "</script"), scripts);
    assert.assertEquals(count(html, "<img"), 0);
  },
);

nodeTest.test(
  "generateRSCPayloadScript cannot be closed or commented out by a value",
  () => {
    const html = ssrRenderer.generateRSCPayloadScript([
      { type: "J", id: 0, value: PAYLOAD },
    ] as Parameters<typeof ssrRenderer.generateRSCPayloadScript>[0]);
    assert.assertEquals(count(html, "</script"), 1);
    assert.assertEquals(count(html, "<!--"), 0);
  },
);
