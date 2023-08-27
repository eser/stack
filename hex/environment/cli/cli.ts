import { type Channel } from "../channel.ts";

export const cli = (): Channel<string, never> => {
  const instance = {
    name: "cli",

    write: (text: string) => {
      console.log(text);

      return Promise.resolve();
    },
  };

  return instance;
};

export { cli as default };
