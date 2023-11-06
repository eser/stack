// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type Handlers } from "../../../server.ts";

export const handlers: Handlers = {
  GET() {
    throw new Error("FAIL");
  },
};
