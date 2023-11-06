// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type Signal } from "@preact/signals-react";

export default function BooleanButton({ signal }: { signal: Signal }) {
  return (
    <button
      onClick={() => {
        signal.value = !signal.value;
      }}
    >
      Toggle
    </button>
  );
}
