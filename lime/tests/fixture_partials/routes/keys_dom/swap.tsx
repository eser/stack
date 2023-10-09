import { defineRoute, type RouteConfig } from "$cool/lime/server.ts";
import { Partial } from "$cool/lime/runtime.ts";
import { Fader } from "../../islands/Fader.tsx";
import Stateful from "../../islands/Stateful.tsx";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute((req, ctx) => {
  return (
    <Partial name="slot-1">
      <Fader>
        <p className="status-swap">swapped content</p>
        <ul>
          {[
            <li key="C" className="list-C">
              <Stateful id="C" />
            </li>,
            <li key="B" className="list-B">
              <Stateful id="B" />
            </li>,
            <li key="A" className="list-A">
              <Stateful id="A" />
            </li>,
          ]}
        </ul>
      </Fader>
    </Partial>
  );
});
