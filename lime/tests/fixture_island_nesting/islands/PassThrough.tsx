import { type ComponentChildren } from "react";

export function PassThrough(props: { children: ComponentChildren }) {
  return <div>{props.children}</div>;
}
