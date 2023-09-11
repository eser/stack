import { type LimeOptions } from "$cool/lime/types.ts";

export default {
  async render(_ctx, render) {
    await new Promise<void>((r) => r());
    const body = render();
    if (typeof body !== "string") {
      throw new Error("body is missing");
    }
  },
} as LimeOptions;