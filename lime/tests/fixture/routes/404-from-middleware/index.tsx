import { defineRoute } from "../../../../server.ts";

export default defineRoute((_req, _ctx) => {
  return "This never gets shown, because the middleware calls ctx.renderNotFound.";
});
