import { useSignal } from "@preact/signals";
import { Logger } from "./Logger.tsx";

export default function CounterA() {
  const sig = useSignal(0);
  return (
    <Logger name="Counter A">
      <div className="island island-a">
        <p className="output-a">{sig.value}</p>
        <button onClick={() => sig.value += 1}>
          update
        </button>
      </div>
    </Logger>
  );
}
