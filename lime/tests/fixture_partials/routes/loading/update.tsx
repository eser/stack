import { defineRoute, type RouteConfig } from "../../../../server.ts";
import { Partial } from "../../../../runtime.ts";
import { delay } from "../../../deps.ts";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute(async (req, ctx) => {
  // A bit of artificial delay to show the loader
  await delay(200);

  return (
    <Partial name="slot-1">
      <p className="status-updated">it works</p>
    </Partial>
  );
});
