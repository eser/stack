// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type ComponentChildren, view } from "./drivers/view.tsx";

export interface IslandProps {
  id?: string;
  children: ComponentChildren;
}

export function Island(props: IslandProps) {
  return view.addIsland(props.children, props.id);
}
