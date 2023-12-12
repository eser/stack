// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { events } from "../events/events.ts";
import { di } from "../di/services.ts";

import { type Channel } from "./channel.ts";
import { type Module } from "./module.ts";

export class AppServer {
  events: typeof events;
  di: typeof di;
  channels: Map<string, Channel>;
  modules: Map<string, Module>;

  constructor() {
    this.events = events;
    this.di = di;
    this.channels = new Map<string, Channel>();
    this.modules = new Map<string, Module>();
  }

  addModule(module: Module) {
    const name = module.name ?? module.constructor.name;

    this.modules.set(name, module);
  }

  addChannel(channel: Channel) {
    const name = channel.name ?? channel.constructor.name;

    this.channels.set(name, channel);
  }

  execute(_options: unknown) {
  }
}
