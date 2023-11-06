// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { defineRoute, type RouteConfig } from "../../../../server.ts";
import { Partial } from "../../../../runtime.ts";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute((req, ctx) => {
  return (
    <Partial name="slot-1">
      <p className="status-updated">it works</p>
      <p>
        <input type="text" />
      </p>
    </Partial>
  );
});
