// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { useState } from "react";

export default function Stateful(props: { id: string }) {
  const [v, set] = useState(0);
  return (
    <div className="island">
      <p className={`output-${props.id}`}>{v}</p>
      <button className={`btn-${props.id}`} onClick={() => set((v) => v + 1)}>
        update
      </button>
    </div>
  );
}
