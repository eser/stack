// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { defineRoute, type RouteConfig } from "../../../../server.ts";
import { Partial } from "../../../../runtime.ts";
import CounterA from "../../islands/CounterA.tsx";
import CounterB from "../../islands/CounterB.tsx";
import PassThrough from "../../islands/PassThrough.tsx";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute((req, ctx) => {
  return (
    <Partial name="slot-1">
      <PassThrough>
        <div className="inner">
          <p className="status-a">updated server content</p>
          <CounterA />
        </div>
        <hr />
        <PassThrough>
          <p className="status-b">another pass through</p>
          <CounterB />
        </PassThrough>
      </PassThrough>
    </Partial>
  );
});
