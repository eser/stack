// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, assertEquals } from "@std/assert";
import { createElement, forwardRef } from "react";
import { renderToReadableStream } from "./rsc-flight-renderer.ts";
import { renderSSR } from "./ssr-renderer.ts";
import { toClientErrorValue } from "./error-chunk.ts";

const SECRET_FRAME = "/srv/app/secret-internal-path.ts";

const failing = (): never => {
  const error = new Error("boom");
  error.stack = `Error: boom\n    at Page (${SECRET_FRAME}:1:1)`;
  throw error;
};

const components = {
  sync: () => failing(),
  async: () => Promise.resolve().then(failing),
  forwardRef: forwardRef(() => failing()),
};

Deno.test("toClientErrorValue carries only the message", () => {
  const error = new Error("boom");
  assertEquals(toClientErrorValue(error), { message: "boom" });
  assertEquals(toClientErrorValue("plain"), { message: "plain" });
});

for (const [name, Component] of Object.entries(components)) {
  Deno.test(`flight stream error chunk has no stack (${name})`, async () => {
    const element = createElement("div", null, createElement(Component));
    const wire = await new Response(renderToReadableStream(element, {}))
      .text();
    const errorLine = wire.split("\n").find((l) => /^E\d+:/.test(l));
    assert(errorLine !== undefined, wire);
    assertEquals(errorLine.includes("boom"), true);
    assertEquals(errorLine.includes("stack"), false);
    assertEquals(wire.includes(SECRET_FRAME), false);
  });
}

Deno.test("SSR payload error chunk has no stack", async () => {
  const element = createElement("div", null, createElement(components.sync));
  const result = await renderSSR(element, {});
  const serialized = JSON.stringify(result.rscPayload) + result.html;
  assertEquals(serialized.includes(SECRET_FRAME), false);
  assertEquals(
    result.rscPayload.some((c) =>
      c.type === "E" && typeof c.value === "object" && c.value !== null &&
      "stack" in c.value
    ),
    false,
  );
});
