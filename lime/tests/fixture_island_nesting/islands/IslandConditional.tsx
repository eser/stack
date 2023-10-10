import { Signal } from "@preact/signals";
import { type ComponentChildren } from "../../../runtime.ts";

export interface IslandConditionalProps {
  show: Signal<boolean>;
  children?: ComponentChildren;
}

export default function IslandConditional(
  { show, children }: IslandConditionalProps,
) {
  return (
    <div className="island">
      {show.value ? <p>island content</p> : <>{children}</>}
    </div>
  );
}
