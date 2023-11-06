// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type Signal } from "@preact/signals-type";
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
