import { events } from "../events/events.ts";
import { di } from "../di/services.ts";

export class AppServer {
  events: typeof events;
  di: typeof di;
  channels: Map<string, unknown>;
  modules: Map<string, unknown>;

  constructor() {
    this.events = events;
    this.di = di;
    this.channels = new Map<string, unknown>();
    this.modules = new Map<string, unknown>();
  }

  add(_module: unknown) {
  }

  execute(_options: unknown) {
  }
}
