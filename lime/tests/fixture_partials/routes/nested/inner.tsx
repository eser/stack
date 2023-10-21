import { defineRoute } from "$cool/lime/src/server/defines.ts";
import { RouteConfig } from "$cool/lime/server.ts";
import { Partial } from "$cool/lime/runtime.ts";
import { Fader } from "../../islands/Fader.tsx";
import { Logger } from "../../islands/Logger.tsx";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute(() => (
  <div>
    <div>
      <Partial name="inner">
        <Logger name="inner">
          <Fader>
            <p className="status-inner">updated inner</p>
          </Fader>
        </Logger>
      </Partial>
    </div>
  </div>
));
