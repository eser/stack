// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as rscHandler from "./rsc-handler.ts";

const CORS_HEADERS = [
  "Access-Control-Allow-Origin",
  "Access-Control-Allow-Methods",
  "Access-Control-Allow-Headers",
];

nodeTest.test(
  "streamToResponse sends no CORS headers for the same-origin /rsc payload",
  async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("J0:null\n"));
        controller.close();
      },
    });
    const response = rscHandler.streamToResponse(stream);

    for (const header of CORS_HEADERS) {
      assert.assertEquals(response.headers.get(header), null, header);
    }
    assert.assertEquals(
      response.headers.get("Content-Type"),
      "text/x-component; charset=utf-8",
    );
    assert.assertEquals(
      response.headers.get("X-Content-Type-Options"),
      "nosniff",
    );
    assert.assertEquals(await response.text(), "J0:null\n");
  },
);
