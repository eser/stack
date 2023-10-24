import { ReactViewAdapter } from "./view-adapter-react.ts";
import {
  type ComponentChildren,
  type ViewAdapterBase,
  type VNode,
} from "./view-adapter-base.ts";
export type * from "./view-adapter-base.ts";

export class View {
  adapter: ViewAdapterBase;
  // TODO(@eser): Implement this in other way
  islands = new Map<string, VNode>();
  islandCounter = 0;

  constructor(adapter: ViewAdapterBase) {
    this.adapter = adapter;
  }

  addIsland(children: ComponentChildren, id?: string): VNode {
    const islandId = `island-${id ?? this.islandCounter++}`;

    const islandComponent = (
      <div id={islandId} className="island">
        {children}
      </div>
    );

    this.islands.set(islandId, islandComponent);

    return islandComponent;
  }
}

// TODO(@eser): Make this configurable
export const view = new View(new ReactViewAdapter());
