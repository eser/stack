// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { defineRoute, type RouteConfig } from "../../../../server.ts";
import { Partial } from "../../../../runtime.ts";
import { Fader } from "../../islands/Fader.tsx";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute((req, ctx) => {
  return (
    <Partial name="body">
      <Fader>
        <p className="status-updated">update</p>
      </Fader>
    </Partial>
  );
});
