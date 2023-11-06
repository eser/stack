// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type LimeConfig } from "../../server.ts";

export const config = {
  async render(_ctx, render) {
    await new Promise<void>((r) => r());
    const body = render();
    if (typeof body !== "string") {
      throw new Error("body is missing");
    }
  },
} as LimeConfig;
