import { type LimeOptions } from "../../server.ts";

export default {
  router: {
    ignoreFilePattern: /[\.|_]cy\.[t|j]s(x)?$/,
  },
} as LimeOptions;
