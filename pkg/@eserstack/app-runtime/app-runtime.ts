// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as runModes from "@eserstack/standards/run-modes";
import * as events from "@eserstack/events";
import * as services from "@eserstack/di/services";

import type { Channel } from "./channel.ts";
import type { Module } from "./module.ts";

export type AppRuntimeState = {
  runMode: runModes.RunMode;
  events: events.Factory;
  di: typeof services.di;
  channels: Map<string, Channel>;
  modules: Map<string, Module>;
  // Public state type: narrowing it to `unknown` would change what code that
  // reads the queue gets back.
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

  addChannel(channel: Channel) {
    const name = channel.name ?? channel.constructor.name;

    this.state.channels.set(name, channel);
  }

  setAsDefault() {
    this.state.di.set(AppRuntime.default, this);
  }

  /**
   * Waits for the work queued in `state.awaits` and rejects with the first
   * failure. The queue is emptied before the wait, so work queued meanwhile
   * stays for the next call and a failed operation is not awaited twice.
   */
  async awaitAll(): Promise<void> {
    const pending = this.state.awaits.splice(0);

    await Promise.all(pending);
  }
}
