// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { useSignal } from "@preact/signals-react";

export default function FooIsland() {
  const sig = useSignal(0);
  return (
    <button
      onClick={() => sig.value += 1}
      className="bg-gray-200 py-2 px-4 rounded m-8"
    >
      update {sig}
    </button>
  );
}
