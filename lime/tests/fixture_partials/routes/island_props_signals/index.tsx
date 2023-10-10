import { useSignal } from "@preact/signals";
import { Partial } from "../../../../runtime.ts";
import { Fader } from "../../islands/Fader.tsx";
import SignalProp from "../../islands/SignalProp.tsx";

export default function PropsDemo() {
  const sig = useSignal(0);

  return (
    <div>
      <Partial name="slot-1">
        <Fader>
          <p className="status-initial">initial</p>
          <SignalProp
            sig={sig}
          />
        </Fader>
      </Partial>
      <p>
        <a
          className="update-link"
          href="/island_props_signals/injected"
          f-partial="/island_props_signals/partial"
        >
          Update
        </a>
      </p>
    </div>
  );
}
