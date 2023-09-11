import { type ComponentChildren, view } from "./drivers/view.tsx";

export interface IslandProps {
  id?: string;
  children: ComponentChildren;
}

export function Island(props: IslandProps) {
  return view.addIsland(props.children, props.id);
}
