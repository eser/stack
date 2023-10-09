import { defineRoute, type RouteConfig } from "$cool/lime/server.ts";
import { Partial } from "$cool/lime/runtime.ts";
import { Fader } from "../../islands/Fader.tsx";
import Stateful from "../../islands/Stateful.tsx";
import { Keyed } from "../../components/Keyed.tsx";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute((req, ctx) => {
  return (
    <Partial name="slot-1">
      <Fader>
        <p className="status-swap">swapped content</p>
        {[
          <Keyed key="C">
            <Stateful id="C" />
          </Keyed>,
          <Keyed key="B">
            <Stateful id="B" />
          </Keyed>,
          <Keyed key="A">
            <Stateful id="A" />
          </Keyed>,
        ]}
      </Fader>
    </Partial>
  );
});
