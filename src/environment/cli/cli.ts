import type { Platform } from "../platform.ts";

const cli = function cli(): Platform {
  const instance = {
    name: "cli",

    write: (text: string) => {
      console.log(text);

      return Promise.resolve();
    },
  };

  return instance;
};

export { cli, cli as default };
