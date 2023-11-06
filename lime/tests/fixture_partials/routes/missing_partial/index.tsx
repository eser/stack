// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { Partial } from "../../../../runtime.ts";
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
          href="/missing_partial/injected"
          f-partial="/missing_partial/update"
        >
          update
        </a>
      </p>
    </div>
  );
}
