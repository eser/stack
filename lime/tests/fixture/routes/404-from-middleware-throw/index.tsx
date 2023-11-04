import { defineRoute } from "$cool/lime/server.ts";

export default defineRoute((_req, _ctx) => {
  return "This never gets shown, because the middleware throws an error.";
});
