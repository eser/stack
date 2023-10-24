import { type ComponentChildren } from "react";

export function Keyed(props: { children?: ComponentChildren }) {
  return <>{props.children}</>;
}
