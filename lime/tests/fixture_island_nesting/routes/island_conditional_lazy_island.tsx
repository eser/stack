// Copyright 2023 the cool authors. All rights reserved. MIT license.

import IslandConditional from "../islands/IslandConditional.tsx";
import BooleanButton from "../islands/BooleanButton.tsx";
import { useSignal } from "@preact/signals-react";
import Counter from "../islands/Counter.tsx";
import { ReadyMarker } from "../islands/ReadyMarker.tsx";

export default function Page() {
  const show = useSignal(true);
  const count = useSignal(0);

  return (
    <div id="page">
      <IslandConditional show={show}>
        <div>
          <p className="server">server rendered</p>
          <Counter count={count} />
        </div>
      </IslandConditional>
      <BooleanButton signal={show} />
      <ReadyMarker />
    </div>
  );
}
