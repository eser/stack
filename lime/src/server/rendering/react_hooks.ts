// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type Island } from "../types.ts";
import { type ComponentType } from "../../runtime/drivers/view.tsx";

// Keep track of all available islands
const islandByComponent = new Map<ComponentType, Island>();

export function setAllIslands(islands: ReadonlyArray<Island>) {
  for (let i = 0; i < islands.length; i++) {
    const island = islands[i]!;

    islandByComponent.set(island.component, island);
  }
}
