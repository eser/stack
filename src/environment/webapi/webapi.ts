import type { Platform } from "../platform.ts";

const webapi = function webapi(): Platform {
  const instance = {
    name: "webapi",

    read: () => {
      return Promise.resolve("hello");
    },

    write: (text: string) => {
      console.log(`-- ${text}`);

      return Promise.resolve();
    },
  };

  return instance;
};

export { webapi, webapi as default };
