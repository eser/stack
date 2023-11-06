// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { useEffect } from "react";
import { useSignal } from "@preact/signals-react";

export default function Island() {
  const sig = useSignal(false);
  const count = useSignal(0);
  useEffect(() => {
    sig.value = true;
  }, []);

  return (
    <div id={sig.value ? "ready" : "not-ready"}>
      <p>{count}</p>
      <button onClick={() => count.value++}>click me</button>
    </div>
  );
}
