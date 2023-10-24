import { type Signal } from "@preact/signals-react";
import { type ComponentChildren } from "../../../src/runtime/drivers/view.tsx";

export default function PartialTrigger(
  props: {
    class: string;
    href: string;
    partial?: string;
    loading?: Signal<boolean>;
    children?: ComponentChildren;
  },
) {
  return (
    <a
      className={props.class}
      href={props.href}
      f-partial={props.partial}
      f-loading={props.loading}
    >
      {props.children}
    </a>
  );
}
