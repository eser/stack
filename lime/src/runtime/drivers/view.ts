import { PreactViewAdapter } from "./view-adapter-preact.ts";
// import { ReactViewAdapter } from "./view-adapter-react.ts";
import { type ViewAdapterBase } from "./view-adapter-base.ts";
export type * from "./view-adapter-base.ts";

export class View {
  adapter: ViewAdapterBase;

  constructor(adapter: ViewAdapterBase) {
    this.adapter = adapter;
  }
}

// TODO(@eser): Make this configurable
export const view = new View(new PreactViewAdapter());
