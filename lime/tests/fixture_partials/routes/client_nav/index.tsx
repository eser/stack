// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { Partial } from "../../../../runtime.ts";
import { type RouteConfig } from "../../../../server.ts";
import CounterA from "../../islands/CounterA.tsx";
import { Fader } from "../../islands/Fader.tsx";

export const config: RouteConfig = {
  skipAppWrapper: true,
};

export default function ModeDemo() {
  return (
    <div>
      <Partial name="slot-1">
        <Fader>
          <p className="status-initial">Initial content</p>
          <CounterA />
        </Fader>
      </Partial>
    </div>
  );
}
