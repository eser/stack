// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type ComponentChildren } from "../../../runtime.ts";
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
