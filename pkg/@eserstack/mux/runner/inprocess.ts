// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Run the mux server and the ANSI TUI frontend together in one process.
 *
 * This is the drop-in replacement for the old hand-rolled multiplexer loop, and
 * the simplest way to exercise the whole stack end-to-end. The socket/daemon
 * runners reuse the same server unchanged.
 *
 * @module
 */

import * as tui from "@eserstack/shell/tui";
import { getPlatform, runtime } from "@eserstack/standards/cross-runtime";
import { createInitialState } from "../engine/reducer.ts";
import { defaultKeymap } from "../keybindings/mod.ts";
import { createInProcessPair } from "../ipc/transport-inprocess.ts";
import type { FrontendToServer, ServerToFrontend } from "../ipc/protocol.ts";
import { createTuiFrontend } from "../frontends/tui/tui-frontend.ts";
import { createServer, type SpawnResolver } from "../server/server.ts";

export type RunInProcessOptions = {
  /** Override the default shell command for terminal panes. */
  readonly shell?: string;
  readonly shellArgs?: readonly string[];
  readonly cwd?: string;
  /** Fully custom spawn resolver (e.g. an agent adapter). */
  readonly resolveSpawn?: SpawnResolver;
};

const defaultShell = (): { command: string; args: readonly string[] } => {
  if (getPlatform() === "windows") {
    return { command: "powershell.exe", args: [] };
  }

  return { command: runtime.env.get("SHELL") ?? "/bin/sh", args: [] };
};

export const runInProcess = async (
  opts: RunInProcessOptions = {},
): Promise<number> => {
  const size = tui.terminal.getTerminalSize();
  const initialState = createInitialState({ cols: size.cols, rows: size.rows });

  const resolveSpawn: SpawnResolver = opts.resolveSpawn ?? ((pane) => {
    const fallback = defaultShell();

    return {
      command: pane.command ?? opts.shell ?? fallback.command,
      args: pane.args ?? opts.shellArgs ?? fallback.args,
      cwd: pane.cwd ?? opts.cwd,
      env: runtime.env.toObject(),
    };
  });

  const server = createServer({ initialState, resolveSpawn });

  const [serverSide, frontendSide] = createInProcessPair<
    ServerToFrontend,
    FrontendToServer
  >();
  server.connect(serverSide);

  const frontend = createTuiFrontend({
    transport: frontendSide,
    keymap: defaultKeymap,
  });

  // Open the first tab; the frontend's attach will pull a full scene.
  server.dispatch({ type: "newTab" });

  try {
    await frontend.run();
  } finally {
    frontend.stop();
    await server.dispose();
  }

  return 0;
};
