import { type Channel } from "./channel.ts";

type ChannelMethods = string; // "read" | "write";

interface Environment {
  channels: readonly Channel[];

  dispatch: <T>(
    method: ChannelMethods,
    ...args: readonly T[]
  ) => Promise<void>;
  poll: <TR, T1 = void>(
    method: ChannelMethods,
    ...args: readonly T1[]
  ) => Promise<TR | undefined>;
}

const environment = (
  // deno-lint-ignore no-explicit-any
  ...channels: Channel<any, any>[]
): Environment => {
  const dispatch = async <T>(
    method: ChannelMethods,
    ...args: readonly T[]
  ): Promise<void> => {
    await Promise.all(
      instance.channels.map(async (channel) => {
        if (!(method in channel)) {
          return undefined;
        }

        // @ts-ignore dispatcher call
        const result = await channel[method]?.apply(
          channel,
          args,
        );

        return result;
      }),
    );
  };

  const poll = async <TR, T1 = void>(
    method: ChannelMethods,
    ...args: readonly T1[]
  ): Promise<TR | undefined> => {
    for (const channel of instance.channels) {
      if (!(method in channel)) {
        continue;
      }

      // @ts-ignore object is not possibly undefined
      const result = await channel[method].apply(
        channel,
        args,
      );

      return <TR> <unknown> result;
    }

    return undefined;
  };

  const instance = {
    channels: channels ?? [],

    dispatch: dispatch,
    poll: poll,
  };

  return instance;
};

export { environment, environment as default };
