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
