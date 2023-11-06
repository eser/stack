// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type RouteContext } from "../../../../server.ts";
import { delay } from "../../../deps.ts";

export default async function Foo(_req: Request, ctx: RouteContext) {
  await delay(1);

  const value = JSON.stringify(ctx, (_key, value) => {
    if (typeof value === "function") {
      return value.constructor.name;
    }

    return value;
  }, 2);

  return new Response(value, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
