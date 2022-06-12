import type { Platform, PlatformMethods } from "./platform.ts";

interface Environment {
  platforms: Platform[];

  dispatch: <T>(method: PlatformMethods, ...args: T[]) => Promise<void>;
  poll: <TR, T1 = void>(
    method: PlatformMethods,
    ...args: T1[]
  ) => Promise<TR | undefined>;

  read: () => Promise<string | undefined>;
  write: (text: string) => Promise<void>;
}

const environment = function environment(
  ...platforms: Platform[]
): Environment {
  const dispatch = async function dispatch<T>(
    method: PlatformMethods,
    ...args: T[]
  ): Promise<void> {
    await Promise.all(
      instance.platforms.map(async (platform) => {
        // @ts-ignore dispatcher call
        const result = await platform[method]?.apply(
          platform,
          args,
        );

        return result;
      }),
    );
  };

  const poll = async function poll<TR, T1 = void>(
    method: PlatformMethods,
    ...args: T1[]
  ): Promise<TR | undefined> {
    for (const platform of instance.platforms) {
      if (!(method in platform)) {
        continue;
      }

      // @ts-ignore object is not possibly undefined
      const result = await platform[method].apply(
        platform,
        args,
      );

      return <TR> <unknown> result;
    }

    return undefined;
  };

  const instance = {
    platforms: platforms ?? [],

    dispatch: dispatch,
    poll: poll,

    read: () => poll<string>("read"),
    write: (text: string) => dispatch("write", text),
  };

  return instance;
};

export { environment, environment as default };
