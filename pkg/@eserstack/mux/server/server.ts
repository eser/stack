// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The mux server: owns engine state and the live PTYs, interprets reducer
 * effects, and broadcasts the neutral scene + per-pane output to a connected
 * frontend. It performs no rendering — that is the frontend's job — so the same
 * server drives an ANSI TUI or a browser identically.
 *
 * This first cut serves a single connected frontend (the in-process runner);
 * multi-client fanout and reattach snapshots come with the socket/WS transports.
 *
 * @module
 */

import type { Chrome } from "../engine/geometry.ts";
import {
  computeTabGeoms,
  DEFAULT_CHROME,
  effectiveChrome,
} from "../engine/geometry.ts";
import { reduce } from "../engine/reducer.ts";
import type {
  Action,
  Geom,
  MuxState,
  Pane,
  PaneId,
  ScrollAction,
} from "../engine/types.ts";
import type { Effect } from "../engine/effects.ts";
import type {
  FrontendToServer,
  ServerToFrontend,
  Transport,
} from "../ipc/protocol.ts";
import { diffScene } from "../scene/diff.ts";
import { deriveScene, type Scene } from "../scene/scene.ts";
import {
  createPtyHost,
  type PtyHost,
  type PtyHostCallbacks,
} from "./pty-host.ts";

/** Resolves how to actually launch a pane's process. */
export type SpawnResolver = (
  pane: Pane,
  geom: Geom,
) => {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: Record<string, string>;
};

export type MuxServerOptions = {
  readonly initialState: MuxState;
  readonly resolveSpawn: SpawnResolver;
  readonly chrome?: Chrome;
  /** Override the PTY host (for tests / alternate backends). */
  readonly createHost?: (cb: PtyHostCallbacks) => PtyHost;
  /**
   * Tear down the session when the last tab closes (default `true`). A TUI
   * client wants this — the program ends with its last pane. A long-lived host
   * (web, headless/remote daemon) sets it `false` so closing the last tab just
   * leaves an empty multiplexer the client can repopulate.
   */
  readonly exitOnEmpty?: boolean;
  /**
   * Called after a pane's process exits on its own (and its `paneExited` has
   * been applied). Lets an embedding host reconcile external bookkeeping — e.g.
   * deleting the persisted session for a tab that closed when its agent quit.
   */
  readonly onPaneExit?: (pane: PaneId) => void;
};

export type MuxServer = {
  /** Attach a frontend transport (server sends scene/output, receives input).
   *  Single-viewer: a new transport replaces and closes the previous one. */
  connect(transport: Transport<ServerToFrontend, FrontendToServer>): void;
  /** Detach a transport if it is the current sink (e.g. its socket closed), so
   *  the server stops addressing a dead connection. */
  disconnect(transport: Transport<ServerToFrontend, FrontendToServer>): void;
  /** Dispatch an action from outside a frontend (e.g. an agent driver). */
  dispatch(action: Action): void;
  /** Change the reserved-region chrome at runtime (e.g. toggle a sidebar). */
  setChrome(chrome: Chrome): void;
  /** Current engine state (read-only snapshot). */
  getState(): MuxState;
  dispose(): Promise<void>;
};

/** Interim scroll behavior: forward key sequences to the focused pane's process
 *  until the server keeps its own VTerminal scrollback. */
const SCROLL_SEQ: Record<ScrollAction, string> = {
  up: "\x1b[A\x1b[A\x1b[A",
  down: "\x1b[B\x1b[B\x1b[B",
  pageUp: "\x1b[5~",
  pageDown: "\x1b[6~",
  home: "\x1b[H",
  end: "\x1b[F",
};

export const createServer = (opts: MuxServerOptions): MuxServer => {
  let baseChrome: Chrome = opts.chrome ?? DEFAULT_CHROME;
  let state = opts.initialState;
  const exitOnEmpty = opts.exitOnEmpty ?? true;

  // Chrome actually applied, with decorations dropped when the viewport is too
  // small. Server and frontend both use this (it's carried in the scene).
  const currentChrome = (): Chrome =>
    effectiveChrome(state.viewport, baseChrome);
  let sink: Transport<ServerToFrontend, FrontendToServer> | null = null;
  let lastScene: Scene | null = null;
  let disposed = false;

  // Panes whose async spawn is in flight, and those killed before it resolved.
  const spawning = new Set<PaneId>();
  const pendingKill = new Set<PaneId>();

  const host: PtyHost = (opts.createHost ?? createPtyHost)({
    onData: (pane, data) => sink?.send({ t: "output", pane, data }),
    onExit: (pane, code) => {
      host.forget(pane);
      applyAction({ type: "paneExited", pane, code });
      opts.onPaneExit?.(pane);
    },
  });

  const activeGeoms = (): Map<PaneId, Geom> => {
    const tab = state.tabs[state.activeTab];
    if (tab === undefined) return new Map();

    return computeTabGeoms(tab, state.viewport, currentChrome());
  };

  const contentSize = (
    geom: Geom | undefined,
  ): { cols: number; rows: number } => ({
    cols: geom
      ? Math.max(1, geom.width - 2)
      : Math.max(1, state.viewport.cols - 2),
    rows: geom
      ? Math.max(1, geom.height - 2)
      : Math.max(1, state.viewport.rows - 2),
  });

  const spawnPane = async (paneId: PaneId): Promise<void> => {
    const pane = state.panes[paneId];
    if (pane === undefined || host.has(paneId) || spawning.has(paneId)) return;

    spawning.add(paneId);
    try {
      const geom = activeGeoms().get(paneId);
      const { cols, rows } = contentSize(geom);
      const spec = opts.resolveSpawn(
        pane,
        geom ?? { x: 0, y: 0, width: cols, height: rows },
      );

      await host.spawn({
        pane: paneId,
        command: spec.command,
        args: spec.args,
        cwd: spec.cwd,
        env: spec.env,
        cols,
        rows,
      });
    } finally {
      spawning.delete(paneId);
      // If the pane was closed while its spawn was in flight, kill the freshly
      // created process now so it isn't orphaned.
      if (pendingKill.delete(paneId) && host.has(paneId)) host.kill(paneId);
    }
  };

  const resizePtys = (): void => {
    for (const [paneId, geom] of activeGeoms()) {
      if (!host.has(paneId)) continue;
      const { cols, rows } = contentSize(geom);
      host.resize(paneId, cols, rows);
    }
  };

  const broadcastScene = (): void => {
    const scene = deriveScene(state, currentChrome());
    const wasNull = lastScene === null;
    const delta = diffScene(lastScene, scene);
    lastScene = scene;
    if (delta !== null) sink?.send({ t: "scene", full: wasNull, delta });
  };

  const runEffect = (effect: Effect): void => {
    switch (effect.type) {
      case "spawnPty":
        spawnPane(effect.pane).catch((err) => {
          // Surface spawn failures in the pane instead of swallowing them; the
          // pane stays closeable and shows why it didn't start.
          const msg = err instanceof Error ? err.message : String(err);
          sink?.send({
            t: "output",
            pane: effect.pane,
            data: `\r\n[mux] failed to start pane: ${msg}\r\n`,
          });
        });
        break;
      case "writePty":
        host.write(effect.pane, effect.data);
        break;
      case "killPty":
        if (host.has(effect.pane)) host.kill(effect.pane);
        else if (spawning.has(effect.pane)) pendingKill.add(effect.pane);
        break;
      case "scrollPane":
        host.write(effect.pane, SCROLL_SEQ[effect.action]);
        break;
      case "render":
        // Broadcast happens after every batch; nothing extra to do.
        break;
      case "detach":
        sink?.send({ t: "exit", code: 0 });
        break;
      case "exit":
        // A long-lived host keeps serving an empty multiplexer; the post-batch
        // broadcast pushes the now-tabless scene so the client can repopulate.
        if (!exitOnEmpty) break;
        sink?.send({ t: "exit", code: 0 });
        void dispose();
        break;
    }
  };

  const applyAction = (action: Action): void => {
    if (disposed) return;

    const result = reduce(state, action);
    state = result.state;
    for (const effect of result.effects) runEffect(effect);

    resizePtys();
    broadcastScene();
  };

  const handleFrontend = (msg: FrontendToServer): void => {
    switch (msg.t) {
      case "attach":
        state = { ...state, viewport: msg.viewport };
        lastScene = null; // force a full scene to the freshly-attached frontend
        resizePtys();
        broadcastScene();
        break;
      case "action":
        applyAction(msg.action);
        break;
      case "resize":
        applyAction({
          type: "resizeViewport",
          cols: msg.viewport.cols,
          rows: msg.viewport.rows,
        });
        break;
    }
  };

  // Cache the teardown promise so the un-awaited exit-effect dispose and the
  // caller's awaited dispose() share one run and both await full teardown.
  let disposePromise: Promise<void> | null = null;
  const dispose = (): Promise<void> => {
    if (disposePromise !== null) return disposePromise;
    disposed = true;
    disposePromise = (async () => {
      await host.killAll();
      sink?.close();
    })();

    return disposePromise;
  };

  return {
    connect(transport): void {
      // Single-viewer: replace and close any prior sink so its socket is torn
      // down rather than leaked on reconnect.
      const previous = sink;
      sink = transport;
      lastScene = null; // the new viewer's first broadcast must be a full scene
      transport.onMessage(handleFrontend);
      if (previous !== null && previous !== transport) previous.close();
    },
    disconnect(transport): void {
      if (sink === transport) sink = null;
    },
    dispatch: applyAction,
    setChrome(chrome: Chrome): void {
      baseChrome = chrome;
      resizePtys();
      broadcastScene();
    },
    getState: () => state,
    dispose,
  };
};
