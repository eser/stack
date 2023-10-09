import { defineRoute, type RouteConfig } from "$cool/lime/server.ts";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute((req, ctx) => {
  return <p className="status-append">append content</p>;
});
