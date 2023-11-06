// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { useState } from "react";

export function HookIsland() {
  const [v, set] = useState(0);
  return (
    <div>
      <p>{v}</p>
      <button onClick={() => set((v) => v + 1)}>update</button>
    </div>
  );
}
