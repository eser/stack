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

Deno.test("remove listener", () => {
  const spyFn = mock.spy();
  const listener = () => spyFn();

  const registry = new Registry();
  registry.add("ev", listener);
  registry.remove("ev", listener);

  const dispatcher = registry.build();
  dispatcher.dispatch("ev");

  mock.assertSpyCalls(spyFn, 0);
});

Deno.test("add returns this for chaining", () => {
  const registry = new Registry();

  const result = registry.add("ev1", () => {}).add("ev2", () => {});

  assert.assertStrictEquals(result, registry);
});

Deno.test("remove returns this for chaining", () => {
  const listener = () => {};
  const registry = new Registry();
  registry.add("ev", listener);

  const result = registry.remove("ev", listener);

  assert.assertStrictEquals(result, registry);
});

Deno.test("dispatch returns boolean", () => {
  const registry = new Registry();
  registry.add("ev", () => {});

  const dispatcher = registry.build();
  const result = dispatcher.dispatch("ev");

  assert.assertStrictEquals(typeof result, "boolean");
  assert.assertStrictEquals(result, true);
});

Deno.test("dispatch with preventDefault returns false", () => {
  const registry = new Registry();
  registry.add("ev", (e) => e.preventDefault());

  const dispatcher = registry.build();
  const result = dispatcher.dispatch("ev", { cancelable: true });

  assert.assertStrictEquals(result, false);
});

Deno.test("Registry with custom EventTarget", () => {
  const spyFn = mock.spy();
  const customTarget = new EventTarget();

  const registry = new Registry({ target: customTarget });
  registry.add("ev", () => spyFn());

  const dispatcher = registry.build();
  dispatcher.dispatch("ev");

  mock.assertSpyCalls(spyFn, 1);
});
