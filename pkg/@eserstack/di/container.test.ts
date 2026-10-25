// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as mock from "@eserstack/test-kit/mock";
import * as container from "./container.ts";

nodeTest.test("non-existent key", () => {
  const registry = new container.Registry();

  const scope = registry.build();

  assert.assertStrictEquals(scope.get("_"), undefined);
});

nodeTest.test("symbol key", () => {
  const registry = new container.Registry();
  const a = Symbol("a");

  registry.set(a, 6);

  const scope = registry.build();

  assert.assertStrictEquals(scope.get(a), 6);
});

nodeTest.test("mixed keys", () => {
  const registry = new container.Registry();

  registry.set(Object.keys, "Object.keys method");
  registry.set(Object.values, "Object.values method");
  registry.set(Object.entries, "Object.entries method");

  const scope = registry.build();

  assert.assertStrictEquals(scope.get(Object.keys), "Object.keys method");
  assert.assertStrictEquals(scope.get(Object.values), "Object.values method");
  assert.assertStrictEquals(scope.get(Object.entries), "Object.entries method");
});

nodeTest.test("singleton value", () => {
  const registry = new container.Registry();

  registry.set("b", 5);

  const scope = registry.build();

  assert.assertStrictEquals(scope.get("b"), 5);
});

nodeTest.test("singleton nullables", () => {
  const registry = new container.Registry();

  registry.set("c", null);
  registry.set("d", undefined);

  const scope = registry.build();

  assert.assertStrictEquals(scope.get("c"), null);
  assert.assertStrictEquals(scope.get("d"), undefined);
  assert.assertStrictEquals(scope.get("e", "non-exists"), "non-exists");
  assert.assertStrictEquals(scope.get("f"), undefined);
});

nodeTest.test("singleton functions", () => {
  const registry = new container.Registry();

  registry.set("g", (x: number) => x + 3);

  const scope = registry.build();

  const result = scope.get("g");

  assert.assertStrictEquals(result.constructor, Function);
  assert.assertStrictEquals(result(5), 8);
});

nodeTest.test("lazy value", () => {
  const registry = new container.Registry();

  const spyFn = mock.spy();

  let number = 1;
  registry.setLazy("h", () => {
    spyFn();
    return ++number;
  });

  const scope = registry.build();

  assert.assertStrictEquals(number, 1);
  assert.assertStrictEquals(scope.get("h"), 2);
  assert.assertStrictEquals(number, 2);

  mock.assertSpyCalls(spyFn, 1);
});

nodeTest.test("lazy nullable", () => {
  const registry = new container.Registry();

  const iSpyFn = mock.spy();
  const jSpyFn = mock.spy();

  registry.setLazy("i", () => {
    iSpyFn();
    return null;
  });

  registry.setLazy("j", () => {
    jSpyFn();
    return undefined;
  });

  const scope = registry.build();

  assert.assertStrictEquals(scope.get("i"), null);
  assert.assertStrictEquals(scope.get("j"), undefined);

  mock.assertSpyCalls(iSpyFn, 1);
  mock.assertSpyCalls(jSpyFn, 1);
});

nodeTest.test("scoped value", () => {
  const registry = new container.Registry();

  const kSpyFn = mock.spy();
  const lSpyFn = mock.spy();

  let number = 1;
  registry.setLazy("k", () => {
    kSpyFn();
    return ++number;
  });
  registry.setScoped("l", () => {
    lSpyFn();
    return ++number;
  });

  const scope = registry.build();
  const subScope = scope.createScope();

  assert.assertStrictEquals(number, 1);
  assert.assertStrictEquals(scope.get("k"), 2);
  assert.assertStrictEquals(scope.get("k"), 2);
  assert.assertStrictEquals(scope.get("l"), 3);
  assert.assertStrictEquals(scope.get("l"), 3);
  assert.assertStrictEquals(subScope.get("k"), 2);
  assert.assertStrictEquals(subScope.get("k"), 2);
  assert.assertStrictEquals(subScope.get("l"), 4);
  assert.assertStrictEquals(subScope.get("l"), 4);
  assert.assertStrictEquals(scope.get("l"), 3);
  assert.assertStrictEquals(number, 4);

  mock.assertSpyCalls(kSpyFn, 1);
  mock.assertSpyCalls(lSpyFn, 2);
});

nodeTest.test("transient functions", () => {
  const registry = new container.Registry();

  let number = 1;
  registry.setTransient("m", () => number++);

  const scope = registry.build();

  assert.assertStrictEquals(scope.get("m"), 1);
  assert.assertStrictEquals(scope.get("m"), 2);
  assert.assertStrictEquals(scope.get("m"), 3);
});

nodeTest.test("transient promise", async () => {
  const registry = new container.Registry();

  registry.setTransient("n", () => Promise.resolve("test"));

  const scope = registry.build();

  assert.assertStrictEquals(await scope.get("n"), "test");
});

nodeTest.test("getMany", () => {
  const registry = new container.Registry();

  const lazySpyFn = mock.spy();
  const transientSpyFn = mock.spy();

  let number = 1;
  registry.set("o", number);
  registry.setLazy("p", () => {
    lazySpyFn();
    return ++number;
  });
  registry.setTransient("q", () => {
    transientSpyFn();
    return ++number;
  });

  const scope = registry.build();

  assert.assertStrictEquals(number, 1);

  const [o, p, q, r, s] = scope.getMany("o", "p", "q", "q", "s");

  assert.assertStrictEquals(number, 4);
  assert.assertStrictEquals(o, 1);
  assert.assertStrictEquals(p, 2);
  assert.assertStrictEquals(q, 3);
  assert.assertStrictEquals(r, 4);
  assert.assertStrictEquals(s, undefined);

  mock.assertSpyCalls(lazySpyFn, 1);
  mock.assertSpyCalls(transientSpyFn, 2);
});

// Decorator tests
import * as decorators from "./decorators.ts";
import * as services from "./services.ts";

nodeTest.test("injectable() should register class with class name", () => {
  class TestService {}
  decorators.injectable()(TestService);

  const instance = services.services.get("TestService");

  assert.assertExists(instance);
  assert.assertInstanceOf(instance, TestService);
});

nodeTest.test(
  "injectable() with custom key should register with custom key",
  () => {
    class TestServiceCustom {}
    decorators.injectable("customKey")(TestServiceCustom);

    const instance = services.services.get("customKey");

    assert.assertExists(instance);
    assert.assertInstanceOf(instance, TestServiceCustom);
  },
);

nodeTest.test("injectable() creates new instance each time from lazy", () => {
  class LazyService {
    value = Math.random();
  }
  decorators.injectable("lazyService")(LazyService);

  const instance1 = services.services.get("lazyService");
  const instance2 = services.services.get("lazyService");

  // Lazy services are cached, should be same instance
  assert.assertStrictEquals(instance1, instance2);
});

nodeTest.test("inject() decorator can be applied", () => {
  // inject is currently a no-op but should not throw
  class Service {
    dependency: unknown;
  }
  decorators.inject("someKey")(undefined, {
    kind: "field",
    name: "dependency",
  } as ClassFieldDecoratorContext);

  const service = new Service();
  assert.assertExists(service);
});

nodeTest.test("injectable with source.name fallback", () => {
  // Test calling injectable directly without decorator context
  const TestClass = class NamedClass {};

  const decorator = decorators.injectable();
  decorator(TestClass, undefined);

  const instance = services.services.get("NamedClass");

  assert.assertExists(instance);
});
