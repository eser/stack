import { Partial } from "../../../../runtime.ts";
import CounterA from "../../islands/CounterA.tsx";
import { Fader } from "../../islands/Fader.tsx";

export default function ModeDemo() {
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
          className="replace-link"
          href="/mode/injected"
          f-partial="/mode/replace"
        >
          replace
        </a>
      </p>
      <p>
        <a
          className="append-link"
          href="/mode/injected"
          f-partial="/mode/append"
        >
          append
        </a>
      </p>
      <p>
        <a
          className="prepend-link"
          href="/mode/injected"
          f-partial="/mode/prepend"
        >
          prepend
        </a>
      </p>

      <pre id="logs" />
    </div>
  );
}
