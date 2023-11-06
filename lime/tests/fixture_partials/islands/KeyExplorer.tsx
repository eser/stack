// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { useSignal } from "@preact/signals-react";

export default function KeyExplorer() {
  const sig = useSignal(0);

  return (
    <div className="island">
      <h1>counter</h1>
      <p className="output">{sig.value}</p>
      <button onClick={() => sig.value += 1}>update</button>
    </div>
  );
}
