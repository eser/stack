// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type Signal } from "@preact/signals-react";

export default function SignalProp(props: { sig: Signal<number> }) {
  return (
    <div className="island">
      <p className="output">{props.sig.value}</p>
      <button onClick={() => props.sig.value += 1}>
        update
      </button>
    </div>
  );
}
