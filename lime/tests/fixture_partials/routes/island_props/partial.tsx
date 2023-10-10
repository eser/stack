import { defineRoute, type RouteConfig } from "../../../../server.ts";
import { Partial } from "../../../../runtime.ts";
import PropIsland from "../../islands/PropIsland.tsx";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute((req, ctx) => {
  return (
    <Partial name="slot-1">
      <p className="status-updated">updated</p>
      <PropIsland
        boolean={false}
        number={42}
        obj={{ foo: 123456 }}
        strArr={["foo", "bar"]}
        string="foobar"
      />
    </Partial>
  );
});
