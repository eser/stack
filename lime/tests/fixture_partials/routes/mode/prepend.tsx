import { defineRoute, type RouteConfig } from "../../../../server.ts";
import { Partial } from "../../../../runtime.ts";
import { Fader } from "../../islands/Fader.tsx";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute((req, ctx) => {
  return (
    <Partial name="slot-1" mode="prepend">
      <Fader>
        <h1>prepend</h1>
        <p className="status-prepend">prepend content</p>
      </Fader>
    </Partial>
  );
});
