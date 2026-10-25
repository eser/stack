// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as mock from "@eserstack/test-kit/mock";
import * as container from "./container.ts";

nodeTest.test("simple", () => {
  const spyFn = mock.spy();

  const registry = new container.Registry();
  registry.add("ev", () => spyFn());

  const dispatcher = registry.build();
  dispatcher.dispatch("ev");

  mock.assertSpyCalls(spyFn, 1);
});

nodeTest.test("multiple", () => {
  const spyFn = mock.spy();

  const registry = new container.Registry();
  registry.add("ev", () => spyFn());

  const dispatcher = registry.build();
  dispatcher.dispatch("ev");
  dispatcher.dispatch("ev");

  mock.assertSpyCalls(spyFn, 2);
});

nodeTest.test("once", () => {
  const spyFn = mock.spy();

  const registry = new container.Registry();
  registry.add("ev", () => spyFn(), { once: true });

  const dispatcher = registry.build();
  dispatcher.dispatch("ev");
  dispatcher.dispatch("ev");

  mock.assertSpyCalls(spyFn, 1);
});

nodeTest.test("parameters", () => {
  const spyFn = mock.spy();

  const registry = new container.Registry();
  registry.add("ev", (e) => spyFn(e));

  const dispatcher = registry.build();
  dispatcher.dispatch("ev", { detail: "xx" });

  mock.assertSpyCalls(spyFn, 1);

  const arg = spyFn.calls[0]?.args[0] as CustomEvent;
  assert.assertEquals(arg.detail, "xx");
});

nodeTest.test("no parameters", () => {
  const spyFn = mock.spy();

  const registry = new container.Registry();
  registry.add("ev", (e) => spyFn(e));

  const dispatcher = registry.build();
  dispatcher.dispatch("ev");

  mock.assertSpyCalls(spyFn, 1);

  const arg = spyFn.calls[0]?.args[0] as CustomEvent;
  assert.assertStrictEquals(arg.detail, undefined);
});

nodeTest.test("remove listener", () => {
  const spyFn = mock.spy();
  const listener = () => spyFn();

  const registry = new container.Registry();
  registry.add("ev", listener);
  registry.remove("ev", listener);

  const dispatcher = registry.build();
  dispatcher.dispatch("ev");

  mock.assertSpyCalls(spyFn, 0);
});

nodeTest.test("add returns this for chaining", () => {
  const registry = new container.Registry();

  const result = registry.add("ev1", () => {}).add("ev2", () => {});

  assert.assertStrictEquals(result, registry);
});

nodeTest.test("remove returns this for chaining", () => {
  const listener = () => {};
  const registry = new container.Registry();
  registry.add("ev", listener);

  const result = registry.remove("ev", listener);

  assert.assertStrictEquals(result, registry);
});

nodeTest.test("dispatch returns boolean", () => {
  const registry = new container.Registry();
  registry.add("ev", () => {});

  const dispatcher = registry.build();
  const result = dispatcher.dispatch("ev");

  assert.assertStrictEquals(typeof result, "boolean");
  assert.assertStrictEquals(result, true);
});

nodeTest.test("dispatch with preventDefault returns false", () => {
  const registry = new container.Registry();
  registry.add("ev", (e) => e.preventDefault());

  const dispatcher = registry.build();
  const result = dispatcher.dispatch("ev", { cancelable: true });

  assert.assertStrictEquals(result, false);
});

nodeTest.test("Registry with custom EventTarget", () => {
  const spyFn = mock.spy();
  const customTarget = new EventTarget();

  const registry = new container.Registry({ target: customTarget });
  registry.add("ev", () => spyFn());

  const dispatcher = registry.build();
  dispatcher.dispatch("ev");

  mock.assertSpyCalls(spyFn, 1);
});
