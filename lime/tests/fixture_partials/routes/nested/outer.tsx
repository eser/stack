// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { defineRoute } from "$cool/lime/src/server/defines.ts";
import { RouteConfig } from "$cool/lime/server.ts";
import { Partial } from "$cool/lime/runtime.ts";
import { Inner } from "./index.tsx";
import { Fader } from "../../islands/Fader.tsx";
import { Logger } from "../../islands/Logger.tsx";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute(() => (
  <div>
    <div>
      <Partial name="outer">
        <Logger name="outer">
          <Fader>
            <p className="status-outer">updated outer</p>

            <Inner />
          </Fader>
        </Logger>
      </Partial>
    </div>
  </div>
));
