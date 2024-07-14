// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as mock from "@std/testing/mock";
import { Registry } from "./container.ts";

Deno.test("simple", () => {
  const spyFn = mock.spy();

  const registry = new Registry();
  registry.add("ev", () => spyFn());

  const dispatcher = registry.build();
  dispatcher.dispatch("ev");

  mock.assertSpyCalls(spyFn, 1);
});

Deno.test("multiple", () => {
  const spyFn = mock.spy();

  const registry = new Registry();
  registry.add("ev", () => spyFn());

  const dispatcher = registry.build();
  dispatcher.dispatch("ev");
  dispatcher.dispatch("ev");

  mock.assertSpyCalls(spyFn, 2);
});

Deno.test("once", () => {
  const spyFn = mock.spy();

  const registry = new Registry();
  registry.add("ev", () => spyFn(), { once: true });

  const dispatcher = registry.build();
  dispatcher.dispatch("ev");
  dispatcher.dispatch("ev");

  mock.assertSpyCalls(spyFn, 1);
});

Deno.test("parameters", () => {
  const spyFn = mock.spy();

  const registry = new Registry();
  registry.add("ev", (e) => spyFn(e));

  const dispatcher = registry.build();
  dispatcher.dispatch("ev", { detail: "xx" });

  mock.assertSpyCalls(spyFn, 1);

  const arg = spyFn.calls[0]?.args[0] as CustomEvent;
  assert.assertEquals(arg.detail, "xx");
});

Deno.test("no parameters", () => {
  const spyFn = mock.spy();

  const registry = new Registry();
  registry.add("ev", (e) => spyFn(e));

  const dispatcher = registry.build();
  dispatcher.dispatch("ev");

  mock.assertSpyCalls(spyFn, 1);

  const arg = spyFn.calls[0]?.args[0] as CustomEvent;
  assert.assertStrictEquals(arg.detail, undefined);
});
