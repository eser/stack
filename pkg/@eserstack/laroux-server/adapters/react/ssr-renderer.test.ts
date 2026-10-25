// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as React from "react";
import * as larouxClient from "@eserstack/laroux-react/client";
import * as protocol from "@eserstack/laroux-react/protocol";
import * as ssrRenderer from "./ssr-renderer.ts";

// Markup a request could carry into an error message.
const INJECTED_MARKUP = '<img src=x onerror="alert(1)">';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A div whose child is a plain object. React rejects it while rendering the
 * shell, so renderSSR fails as a whole, with an error message that lists the
 * object's keys.
 */
function divWithObjectChild(key: string): React.ReactElement {
  // The cast is the point of the fixture: the types forbid this child.
  const child = { [key]: "value" } as unknown as React.ReactNode;
  return React.createElement("div", null, child);
}

Deno.test("renderSSR keeps markup from the error message out of the fallback", async () => {
  const result = await ssrRenderer.renderSSR(
    divWithObjectChild(INJECTED_MARKUP),
    {},
  );

  assert.assertStringIncludes(result.html, 'data-ssr-error="true"');
  assert.assertEquals(result.html.includes(INJECTED_MARKUP), false);
  assert.assertEquals(result.html.includes("<img"), false);
  assert.assertEquals(result.html.includes("Objects are not valid"), false);
  assert.assertEquals(
    JSON.stringify(result.rscPayload).includes(INJECTED_MARKUP),
    false,
  );
  assert.assertEquals(result.clientModules, []);
});

Deno.test("renderSSR fallback shows a generic message and a correlation id", async () => {
  const result = await ssrRenderer.renderSSR(
    divWithObjectChild("notAChild"),
    {},
  );

  const correlationId = result.html.match(/data-error-id="([^"]+)"/)?.[1];
  assert.assert(correlationId !== undefined, result.html);
  assert.assertMatch(correlationId, UUID_PATTERN);

  const message = `${ssrRenderer.SSR_ERROR_MESSAGE} ${correlationId}`;
  assert.assertStringIncludes(result.html, message);
  assert.assertEquals(result.rscPayload, [
    { type: "E", id: 0, value: { message } },
  ]);
});

Deno.test("renderSSR gives each failed render its own correlation id", async () => {
  const render = async () => {
    const result = await ssrRenderer.renderSSR(
      divWithObjectChild("notAChild"),
      {},
    );
    return result.html.match(/data-error-id="([^"]+)"/)?.[1];
  };

  const [first, second] = await Promise.all([render(), render()]);

  assert.assertNotEquals(first, second);
});

Deno.test("renderSSR escapes text and props that start with $ in the payload", async () => {
  const result = await ssrRenderer.renderSSR(
    React.createElement("p", { title: "$5 off" }, "$D-day"),
    {},
  );

  // The HTML keeps the text; only the payload for the client is escaped.
  assert.assertStringIncludes(result.html, "$D-day");

  const element = await larouxClient.createElementFromChunk(
    result.rscPayload,
    0,
  ) as React.ReactElement<{ title: string; children: string }>;
  assert.assertEquals(element.type, "p");
  assert.assertEquals(element.props.title, "$5 off");
  assert.assertEquals(element.props.children, "$D-day");
});

Deno.test("renderSSR escapes client component props that start with $", async () => {
  const Badge = (props: { readonly label: string }) =>
    React.createElement("span", null, props.label);
  // The bundler turns a "use client" export into this reference.
  const BadgeReference = protocol.createClientReference(
    "./badge.tsx",
    "Badge",
  ) as unknown as typeof Badge;

  const result = await ssrRenderer.renderSSR(
    React.createElement(BadgeReference, { label: "$5" }),
    {},
  );

  const element = await larouxClient.createElementFromChunk(
    result.rscPayload,
    0,
    () => Badge,
  ) as React.ReactElement<{ label: string }>;
  assert.assertStrictEquals(element.type, Badge);
  assert.assertEquals(element.props.label, "$5");
});
