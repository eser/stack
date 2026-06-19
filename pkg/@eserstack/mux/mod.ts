// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `@eserstack/mux` — a frontend-neutral terminal-multiplexer core.
 *
 * The pure engine (split tree, geometry, reducer), the keybinding/mode registry,
 * the neutral scene model, the server that owns PTYs, and an ANSI TUI frontend.
 * Frontends and transports are interchangeable: the server speaks one neutral
 * protocol whether it drives a terminal or a browser.
 *
 * @module
 */

export * as engine from "./engine/mod.ts";
export * as keybindings from "./keybindings/mod.ts";
export * as scene from "./scene/mod.ts";

export type {
  FrontendToServer,
  ServerToFrontend,
  Transport,
} from "./ipc/protocol.ts";
export { createInProcessPair } from "./ipc/transport-inprocess.ts";
export { wsTransport } from "./ipc/transport-ws.ts";
export type { WsTransportOptions } from "./ipc/transport-ws.ts";

export { createScheduler } from "./render/scheduler.ts";
export type { RenderScheduler } from "./render/scheduler.ts";

export type { Frontend } from "./frontends/frontend.ts";
export { createTuiFrontend } from "./frontends/tui/tui-frontend.ts";
export type {
  DecorateFn,
  TuiFrontendOptions,
} from "./frontends/tui/tui-frontend.ts";

export { createServer } from "./server/server.ts";
export type {
  MuxServer,
  MuxServerOptions,
  SpawnResolver,
} from "./server/server.ts";

export { createPtyHost } from "./server/pty-host.ts";
export type {
  PtyHost,
  PtyHostCallbacks,
  SpawnRequest,
} from "./server/pty-host.ts";

export { runInProcess } from "./runner/inprocess.ts";
export type { RunInProcessOptions } from "./runner/inprocess.ts";
