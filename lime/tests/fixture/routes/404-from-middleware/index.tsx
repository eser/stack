// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { defineRoute } from "../../../../server.ts";

export default defineRoute((_req, _ctx) => {
  return "This never gets shown, because the middleware calls ctx.renderNotFound.";
});
