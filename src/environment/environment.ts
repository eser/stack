import type { Channel } from "../standards/channel.ts";

type ChannelMethods = "read" | "write";

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

  read: () => Promise<string | undefined>;
  write: (text: string) => Promise<void>;
}

const environment = function environment(
  // deno-lint-ignore no-explicit-any
  ...channels: Channel<any, any>[]
): Environment {
  const dispatch = async function dispatch<T>(
    method: ChannelMethods,
    ...args: readonly T[]
  ): Promise<void> {
    await Promise.all(
      instance.channels.map(async (channel) => {
        // @ts-ignore dispatcher call
        const result = await channel[method]?.apply(
          channel,
          args,
        );

        return result;
      }),
    );
  };

  const poll = async function poll<TR, T1 = void>(
    method: ChannelMethods,
    ...args: readonly T1[]
  ): Promise<TR | undefined> {
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

    read: () => poll<string>("read"),
    write: (text: string) => dispatch("write", text),
  };

  return instance;
};

export { environment, environment as default };
