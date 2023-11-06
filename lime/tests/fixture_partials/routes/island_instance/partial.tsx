// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { defineRoute, type RouteConfig } from "../../../../server.ts";
import { Partial } from "../../../../runtime.ts";
import CounterA from "../../islands/CounterA.tsx";
import { Fader } from "../../islands/Fader.tsx";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute((req, ctx) => {
  return (
    <Partial name="slot-1">
      <Fader>
        <h1>Another page</h1>
        <p className="status">updated content</p>
        <CounterA />
      </Fader>
    </Partial>
  );
});
