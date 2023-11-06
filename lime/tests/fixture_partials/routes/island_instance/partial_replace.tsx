// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { defineRoute, type RouteConfig } from "../../../../server.ts";
import { Partial } from "../../../../runtime.ts";
import { Fader } from "../../islands/Fader.tsx";
import Other from "../../islands/Other.tsx";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute((req, ctx) => {
  return (
    <Partial name="slot-1">
      <Fader>
        <p className="status-replaced">replaced content</p>
        <Other />
      </Fader>
    </Partial>
  );
});
