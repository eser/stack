type ChannelParams = unknown;

interface Channel<TWrite = ChannelParams, TRead = ChannelParams> {
  name: string;

  read?: () => Promise<TRead>;
  write: (payload: TWrite) => Promise<void>;
}

export { type Channel, type Channel as default, type ChannelParams };
