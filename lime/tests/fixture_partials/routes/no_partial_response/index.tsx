import { Partial } from "$cool/lime/runtime.ts";
import CounterA from "../../islands/CounterA.tsx";
import { Fader } from "../../islands/Fader.tsx";

export default function WarnDemo() {
  return (
    <div>
      <Partial name="slot-1">
        <Fader>
          <p className="status-initial">Initial content</p>
          <CounterA />
        </Fader>
      </Partial>
      <p>
        <a
          className="update-link"
          href="/no_partial_response/injected"
          f-partial="/no_partial_response/update"
        >
          update
        </a>
      </p>
      <pre id="logs"></pre>
    </div>
  );
}
