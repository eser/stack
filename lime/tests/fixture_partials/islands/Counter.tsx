// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { useSignal } from "@preact/signals-react";
import { Logger } from "./Logger.tsx";

export default function Counter(props: { id: string }) {
  const sig = useSignal(0);
  return (
    <Logger name={`Counter ${props.id}`}>
      <div className="island">
        <p className={`output-${props.id}`}>{sig.value}</p>
        <button onClick={() => sig.value += 1}>
          update
        </button>
      </div>
    </Logger>
  );
}
