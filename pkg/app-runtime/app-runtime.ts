// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as runModes from "@eser/standards/run-modes";
import * as events from "@eser/events";
import * as services from "@eser/di/services";

import { type Channel } from "./channel.ts";
import { type Module } from "./module.ts";

export type AppRuntimeState = {
  runMode: runModes.RunMode;
  events: events.Factory;
  di: typeof services.di;
  channels: Map<string, Channel>;
  modules: Map<string, Module>;
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
  static default = Symbol("default");
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

  async awaitAll() {
    await Promise.all(this.state.awaits);
    this.state.awaits.splice(0);
  }

  // execute(_options: unknown) {
  // }
}
