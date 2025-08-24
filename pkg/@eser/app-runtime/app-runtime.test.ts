// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as runModes from "@eser/standards/run-modes";
import { AppRuntime, createAppRuntimeState } from "./app-runtime.ts";
import { type Module } from "./module.ts";
import { type Channel } from "./channel.ts";

Deno.test("createAppRuntimeState() creates valid initial state", () => {
  const state = createAppRuntimeState();

  assert.assertEquals(state.runMode, runModes.RunModes.NotSet);
  assert.assertInstanceOf(state.events, Function);
  assert.assertInstanceOf(state.di, Function);
  assert.assertInstanceOf(state.channels, Map);
  assert.assertInstanceOf(state.modules, Map);
  assert.assertInstanceOf(state.awaits, Array);
  assert.assertEquals(state.channels.size, 0);
  assert.assertEquals(state.modules.size, 0);
  assert.assertEquals(state.lazyModules.size, 0);
  assert.assertEquals(state.awaits.length, 0);
});

Deno.test("AppRuntime() constructor with default state", () => {
  const runtime = new AppRuntime();

  assert.assertEquals(runtime.state.runMode, runModes.RunModes.NotSet);
  assert.assertInstanceOf(runtime.state.channels, Map);
  assert.assertInstanceOf(runtime.state.modules, Map);
  assert.assertInstanceOf(runtime.state.lazyModules, Map);
  assert.assertInstanceOf(runtime.state.awaits, Array);
});

Deno.test("AppRuntime() constructor with custom state", () => {
  const customState = createAppRuntimeState();
  customState.runMode = runModes.RunModes.Development;

  const runtime = new AppRuntime(customState);

  assert.assertEquals(runtime.state.runMode, runModes.RunModes.Development);
  assert.assertEquals(runtime.state, customState);
});

Deno.test("AppRuntime.addModule() adds module with name", () => {
  const runtime = new AppRuntime();
  const testModule: Module = {
    name: "TestModule",
    manifest: {
      name: "test-module",
      version: "1.0.0",
    },
    provides: ["testService"],
    entrypoint: () => {},
  };

  runtime.addModule(testModule);

  assert.assertEquals(runtime.state.modules.size, 1);
  assert.assertEquals(runtime.state.modules.get("TestModule"), testModule);
});

Deno.test("AppRuntime.addModule() uses constructor name when name not provided", () => {
  const runtime = new AppRuntime();

  class TestModuleClass implements Module {
    manifest = {
      name: "test-module",
      version: "1.0.0",
    };
    provides = ["testService"];
    entrypoint = () => {};
  }

  const testModule = new TestModuleClass();
  runtime.addModule(testModule);

  assert.assertEquals(runtime.state.modules.size, 1);
  assert.assertEquals(runtime.state.modules.get("TestModuleClass"), testModule);
});

Deno.test("AppRuntime.addChannel() adds channel with name", () => {
  const runtime = new AppRuntime();
  const testChannel: Channel = {
    name: "TestChannel",
    // Add other required properties based on Channel interface
  } as Channel;

  runtime.addChannel(testChannel);

  assert.assertEquals(runtime.state.channels.size, 1);
  assert.assertEquals(runtime.state.channels.get("TestChannel"), testChannel);
});

Deno.test("AppRuntime.addChannel() uses constructor name when name not provided", () => {
  const runtime = new AppRuntime();

  class TestChannelClass implements Channel {
    // Add required properties based on Channel interface
  }

  const testChannel = new TestChannelClass() as Channel;
  runtime.addChannel(testChannel);

  assert.assertEquals(runtime.state.channels.size, 1);
  assert.assertEquals(
    runtime.state.channels.get("TestChannelClass"),
    testChannel,
  );
});

Deno.test("AppRuntime.awaitAll() resolves all pending promises", async () => {
  const runtime = new AppRuntime();
  let resolved1 = false;
  let resolved2 = false;

  const promise1 = new Promise<void>((resolve) => {
    setTimeout(() => {
      resolved1 = true;
      resolve();
    }, 10);
  });

  const promise2 = new Promise<void>((resolve) => {
    setTimeout(() => {
      resolved2 = true;
      resolve();
    }, 20);
  });

  runtime.state.awaits.push(promise1, promise2);

  await runtime.awaitAll();

  assert.assertEquals(resolved1, true);
  assert.assertEquals(resolved2, true);
});

Deno.test("AppRuntime.awaitAll() rejects when any promise rejects", async () => {
  const runtime = new AppRuntime();

  const successPromise = Promise.resolve("success");
  const failurePromise = Promise.reject(new Error("test error"));

  runtime.state.awaits.push(successPromise, failurePromise);

  // awaitAll should reject when any promise rejects
  await assert.assertRejects(
    () => runtime.awaitAll(),
    Error,
    "test error",
  );
});

Deno.test("AppRuntime.awaitAll() clears awaits array after completion", async () => {
  const runtime = new AppRuntime();

  const promise1 = Promise.resolve("success1");
  const promise2 = Promise.resolve("success2");

  runtime.state.awaits.push(promise1, promise2);

  assert.assertEquals(runtime.state.awaits.length, 2);

  await runtime.awaitAll();

  // Array should be cleared after awaitAll completes
  assert.assertEquals(runtime.state.awaits.length, 0);
});

Deno.test("AppRuntime.setAsDefault() registers runtime as default service", () => {
  const runtime = new AppRuntime();

  runtime.setAsDefault();

  // The runtime should be registered in DI container with the default symbol
  const defaultRuntime = runtime.state.di.get(AppRuntime.default);
  assert.assertEquals(defaultRuntime, runtime);
});

Deno.test("AppRuntime static default symbol", () => {
  assert.assertEquals(typeof AppRuntime.default, "symbol");
});

Deno.test("Multiple modules can be added", () => {
  const runtime = new AppRuntime();

  const module1: Module = {
    name: "Module1",
    manifest: { name: "module1", version: "1.0.0" },
    provides: ["service1"],
    entrypoint: () => {},
  };

  const module2: Module = {
    name: "Module2",
    manifest: { name: "module2", version: "1.0.0" },
    provides: ["service2"],
    entrypoint: () => {},
  };

  runtime.addModule(module1);
  runtime.addModule(module2);

  assert.assertEquals(runtime.state.modules.size, 2);
  assert.assertEquals(runtime.state.modules.get("Module1"), module1);
  assert.assertEquals(runtime.state.modules.get("Module2"), module2);
});

Deno.test("Module with same name overwrites previous module", () => {
  const runtime = new AppRuntime();

  const module1: Module = {
    name: "TestModule",
    manifest: { name: "test-module", version: "1.0.0" },
    provides: ["service1"],
    entrypoint: () => {},
  };

  const module2: Module = {
    name: "TestModule",
    manifest: { name: "test-module", version: "2.0.0" },
    provides: ["service2"],
    entrypoint: () => {},
  };

  runtime.addModule(module1);
  runtime.addModule(module2);

  assert.assertEquals(runtime.state.modules.size, 1);
  assert.assertEquals(runtime.state.modules.get("TestModule"), module2);
  assert.assertEquals(
    runtime.state.modules.get("TestModule")?.manifest.version,
    "2.0.0",
  );
});

Deno.test("AppRuntime.addLazyModule() adds lazy module", () => {
  const runtime = new AppRuntime();

  const moduleLoader = () => ({
    name: "LazyTestModule",
    manifest: { name: "lazy-test", version: "1.0.0" },
    provides: ["lazyService"],
    entrypoint: () => {},
  });

  runtime.addLazyModule("LazyTestModule", moduleLoader);

  assert.assertEquals(runtime.state.lazyModules.size, 1);
  const lazyModule = runtime.state.lazyModules.get("LazyTestModule");
  assert.assertNotEquals(lazyModule, undefined);
  assert.assertEquals(lazyModule!.loaded, false);
  assert.assertEquals(lazyModule!.name, "LazyTestModule");
});

Deno.test("AppRuntime.loadModule() loads lazy module", async () => {
  const runtime = new AppRuntime();
  let entrypointCalled = false;

  const moduleLoader = () => ({
    name: "LazyTestModule",
    manifest: { name: "lazy-test", version: "1.0.0" },
    provides: ["lazyService"],
    entrypoint: () => {
      entrypointCalled = true;
    },
  });

  runtime.addLazyModule("LazyTestModule", moduleLoader);

  const module = await runtime.loadModule("LazyTestModule");

  assert.assertNotEquals(module, undefined);
  assert.assertEquals(module!.name, "LazyTestModule");
  assert.assertEquals(entrypointCalled, true);

  // Should be moved to regular modules
  assert.assertEquals(runtime.state.modules.size, 1);
  assert.assertEquals(runtime.state.modules.get("LazyTestModule"), module);

  // Lazy module should be marked as loaded
  const lazyModule = runtime.state.lazyModules.get("LazyTestModule");
  assert.assertEquals(lazyModule!.loaded, true);
  assert.assertEquals(lazyModule!.module, module);
});

Deno.test("AppRuntime.loadModule() returns existing regular module", async () => {
  const runtime = new AppRuntime();
  const testModule: Module = {
    name: "TestModule",
    manifest: { name: "test", version: "1.0.0" },
    provides: ["testService"],
    entrypoint: () => {},
  };

  runtime.addModule(testModule);

  const module = await runtime.loadModule("TestModule");

  assert.assertEquals(module, testModule);
});

Deno.test("AppRuntime.loadModule() returns undefined for non-existent module", async () => {
  const runtime = new AppRuntime();

  const module = await runtime.loadModule("NonExistent");

  assert.assertEquals(module, undefined);
});

Deno.test("AppRuntime.loadModule() handles concurrent loading", async () => {
  const runtime = new AppRuntime();
  let loaderCallCount = 0;

  const moduleLoader = async () => {
    loaderCallCount++;
    // Simulate async loading
    await new Promise((resolve) => setTimeout(resolve, 10));
    return {
      name: "ConcurrentModule",
      manifest: { name: "concurrent", version: "1.0.0" },
      provides: ["concurrentService"],
      entrypoint: () => {},
    };
  };

  runtime.addLazyModule("ConcurrentModule", moduleLoader);

  // Start multiple concurrent loads
  const [module1, module2, module3] = await Promise.all([
    runtime.loadModule("ConcurrentModule"),
    runtime.loadModule("ConcurrentModule"),
    runtime.loadModule("ConcurrentModule"),
  ]);

  // All should return the same module instance
  assert.assertEquals(module1, module2);
  assert.assertEquals(module2, module3);

  // Loader should only be called once
  assert.assertEquals(loaderCallCount, 1);
});

Deno.test("AppRuntime.loadModule() handles loader errors", async () => {
  const runtime = new AppRuntime();

  const moduleLoader = () => {
    throw new Error("Loader failed");
  };

  runtime.addLazyModule("FailingModule", moduleLoader);

  await assert.assertRejects(
    () => runtime.loadModule("FailingModule"),
    Error,
    "Loader failed",
  );

  // Should clean up loading promise on error
  const lazyModule = runtime.state.lazyModules.get("FailingModule");
  assert.assertEquals(lazyModule!.loadingPromise, undefined);
});

Deno.test("AppRuntime.loadModule() loads already loaded lazy module", async () => {
  const runtime = new AppRuntime();

  const moduleLoader = () => ({
    name: "LoadedModule",
    manifest: { name: "loaded", version: "1.0.0" },
    provides: ["loadedService"],
    entrypoint: () => {},
  });

  runtime.addLazyModule("LoadedModule", moduleLoader);

  // Load once
  const firstLoad = await runtime.loadModule("LoadedModule");

  // Load again - should return the same module
  const secondLoad = await runtime.loadModule("LoadedModule");

  assert.assertEquals(firstLoad, secondLoad);
});

Deno.test("AppRuntime.loadAllLazyModules() loads all lazy modules", async () => {
  const runtime = new AppRuntime();
  const loadedModules: string[] = [];

  const createLoader = (name: string) => () => {
    loadedModules.push(name);
    return {
      name,
      manifest: { name: name.toLowerCase(), version: "1.0.0" },
      provides: [`${name}Service`],
      entrypoint: () => {},
    };
  };

  runtime.addLazyModule("Module1", createLoader("Module1"));
  runtime.addLazyModule("Module2", createLoader("Module2"));
  runtime.addLazyModule("Module3", createLoader("Module3"));

  await runtime.loadAllLazyModules();

  // All modules should be loaded
  assert.assertEquals(runtime.state.modules.size, 3);
  assert.assertEquals(loadedModules.sort(), ["Module1", "Module2", "Module3"]);

  // All lazy modules should be marked as loaded
  for (const lazyModule of runtime.state.lazyModules.values()) {
    assert.assertEquals(lazyModule.loaded, true);
  }
});
