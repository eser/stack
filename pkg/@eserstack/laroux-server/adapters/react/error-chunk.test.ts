// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as React from "react";
import * as rscFlightRenderer from "./rsc-flight-renderer.ts";
import * as ssrRenderer from "./ssr-renderer.ts";
import * as errorChunk from "./error-chunk.ts";

const SECRET_FRAME = "/srv/app/secret-internal-path.ts";

const failing = (): never => {
  const error = new Error("boom");
  error.stack = `Error: boom\n    at Page (${SECRET_FRAME}:1:1)`;
  throw error;
};

const components = {
  sync: () => failing(),
  async: () => Promise.resolve().then(failing),
  forwardRef: React.forwardRef(() => failing()),
};

Deno.test("toClientErrorValue carries only the message", () => {
  const error = new Error("boom");
  assert.assertEquals(errorChunk.toClientErrorValue(error), {
    message: "boom",
  });
  assert.assertEquals(errorChunk.toClientErrorValue("plain"), {
    message: "plain",
  });
});

for (const [name, Component] of Object.entries(components)) {
  Deno.test(`flight stream error chunk has no stack (${name})`, async () => {
    const element = React.createElement(
      "div",
      null,
      React.createElement(Component),
    );
    const wire = await new Response(
      rscFlightRenderer.renderToReadableStream(element, {}),
    ).text();
    const errorLine = wire.split("\n").find((l) => /^E\d+:/.test(l));
    assert.assert(errorLine !== undefined, wire);
    assert.assertEquals(errorLine.includes("boom"), true);
    assert.assertEquals(errorLine.includes("stack"), false);
    assert.assertEquals(wire.includes(SECRET_FRAME), false);
  });
}

Deno.test("SSR payload error chunk has no stack", async () => {
  const element = React.createElement(
    "div",
    null,
    React.createElement(components.sync),
  );
  const result = await ssrRenderer.renderSSR(element, {});
  const serialized = JSON.stringify(result.rscPayload) + result.html;
  assert.assertEquals(serialized.includes(SECRET_FRAME), false);
  assert.assertEquals(
    result.rscPayload.some(
      (c) =>
        c.type === "E" &&
        typeof c.value === "object" &&
        c.value !== null &&
        "stack" in c.value,
    ),
    false,
  );
});
