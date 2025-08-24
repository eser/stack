// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as runModes from "@eser/standards/run-modes";
import * as events from "@eser/events";
import * as services from "@eser/di/services";

import { type Channel } from "./channel.ts";
import { type LazyModule, type Module, type ModuleLoader } from "./module.ts";

export type AppRuntimeState = {
  runMode: runModes.RunMode;
  events: events.Factory;
  di: typeof services.di;
  channels: Map<string, Channel>;
  modules: Map<string, Module>;
  lazyModules: Map<string, LazyModule>;
  // deno-lint-ignore no-explicit-any
  awaits: Array<Promise<any>>;
};

export const createAppRuntimeState = (): AppRuntimeState => {
  return {
    runMode: runModes.RunModes.NotSet,
    events: events.events,
    di: services.di,
    channels: new Map<string, Channel>(),
    modules: new Map<string, Module>(),
    lazyModules: new Map<string, LazyModule>(),
    awaits: [],
  };
};

export class AppRuntime<S extends AppRuntimeState = AppRuntimeState> {
  static readonly default = Symbol("default");
  readonly state: S;

  constructor(state?: S) {
    this.state = state ?? createAppRuntimeState() as S;
  }

  addModule(module: Module) {
    const name = module.name ?? module.constructor.name;

    this.state.modules.set(name, module);
  }

  /**
   * Adds a lazy module that will be loaded when needed
   */
  addLazyModule(name: string, loader: ModuleLoader) {
    this.state.lazyModules.set(name, {
      name,
      loader,
      loaded: false,
    });
  }

  /**
   * Loads a lazy module if it hasn't been loaded yet
   */
  async loadModule(name: string): Promise<Module | undefined> {
    // Check if it's already a loaded module
    const existingModule = this.state.modules.get(name);
    if (existingModule) {
      return existingModule;
    }

    // Check if it's a lazy module
    const lazyModule = this.state.lazyModules.get(name);
    if (!lazyModule) {
      return undefined;
    }

    // If already loaded, return the module
    if (lazyModule.loaded && lazyModule.module) {
      return lazyModule.module;
    }

    // If currently loading, wait for the existing promise
    if (lazyModule.loadingPromise) {
      return await lazyModule.loadingPromise;
    }

    // Start loading
    lazyModule.loadingPromise = this.loadLazyModule(lazyModule);

    try {
      const module = await lazyModule.loadingPromise;
      lazyModule.loaded = true;
      lazyModule.module = module;

      // Move to regular modules map
      this.state.modules.set(name, module);

      return module;
    } catch (error) {
      // Clean up loading promise on error
      delete lazyModule.loadingPromise;
      throw error;
    }
  }

  /**
   * Loads all lazy modules
   */
  async loadAllLazyModules(): Promise<void> {
    const loadingPromises = Array.from(this.state.lazyModules.keys())
      .map((name) => this.loadModule(name));

    await Promise.all(loadingPromises);
  }

  private async loadLazyModule(lazyModule: LazyModule): Promise<Module> {
    const module = await lazyModule.loader();

    // Execute the module's entrypoint if it exists
    if (module.entrypoint) {
      await module.entrypoint();
    }

    return module;
  }

  addChannel(channel: Channel) {
    const name = channel.name ?? channel.constructor.name;

    this.state.channels.set(name, channel);
  }

  setAsDefault() {
    this.state.di.set(AppRuntime.default, this);
  }

  async awaitAll() {
    await Promise.all(this.state.awaits);
    this.state.awaits.splice(0);
  }

  // execute(_options: unknown) {
  // }
}
