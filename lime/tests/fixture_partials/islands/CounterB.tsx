// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { useSignal } from "@preact/signals-react";
import { Logger } from "./Logger.tsx";

export default function CounterB() {
  const sig = useSignal(0);
  return (
    <Logger name="Counter B">
      <div className="island island-b">
        <p className="output-b">{sig.value}</p>
        <button onClick={() => sig.value += 1}>
          update
        </button>
      </div>
    </Logger>
  );
}
