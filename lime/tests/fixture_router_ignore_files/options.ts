import { type LimeOptions } from "$cool/lime/server.ts";

export default {
  router: {
    ignoreFilePattern: /[\.|_]cy\.[t|j]s(x)?$/,
  },
} as LimeOptions;
