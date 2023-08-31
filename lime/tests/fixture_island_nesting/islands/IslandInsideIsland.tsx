import { type ComponentChildren } from "../../../src/runtime/drivers/view.ts";
import Island from "./Island.tsx";

export default function IslandInsideIsland(
  props: { children?: ComponentChildren },
) {
  return (
    <div className="island">
      <Island>
        {props.children}
      </Island>
    </div>
  );
}
