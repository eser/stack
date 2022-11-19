import { type Channel } from "../channel.ts";

const webapi = (): Channel<string, string> => {
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
