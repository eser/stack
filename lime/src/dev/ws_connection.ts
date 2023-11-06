// Copyright 2023 the cool authors. All rights reserved. MIT license.

export const WS_REVISION = "revision" as const;

export interface WsServerState {
  type: typeof WS_REVISION;
  value: number;
  hot: boolean;
}

// deno-lint-ignore no-explicit-any
export function isWsRevision(msg: any): msg is WsServerState {
  return msg !== null && typeof msg === "object" && msg.type === WS_REVISION;
}
