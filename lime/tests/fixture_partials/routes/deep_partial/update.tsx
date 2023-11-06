// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { defineRoute, type RouteConfig } from "../../../../server.ts";
import { Partial } from "../../../../runtime.ts";
import { Fader } from "../../islands/Fader.tsx";
import { Logger } from "../../islands/Logger.tsx";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute((req, ctx) => {
  return (
    <div>
      <div>
        <Partial name="slot-1">
          <Logger name="slot-1">
            <Fader>
              <p className="status-updated">updated</p>
            </Fader>
          </Logger>
        </Partial>
      </div>
    </div>
  );
});
