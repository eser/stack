// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Owns the live PtyProcess for each pane and bridges them to the engine: pane
 * output is forwarded out, process exit is reported back. Resizes are
 * de-duplicated so a steady stream of identical geometry costs nothing.
 *
 * @module
 */

import * as exec from "@eserstack/shell/exec";
import type { PaneId } from "../engine/types.ts";

export type PtyHostCallbacks = {
  onData(pane: PaneId, data: string): void;
  onExit(pane: PaneId, code: number): void;
};

export type SpawnRequest = {
  readonly pane: PaneId;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly cols: number;
  readonly rows: number;
};

export type PtyHost = {
  spawn(req: SpawnRequest): Promise<void>;
  write(pane: PaneId, data: string): void;
  resize(pane: PaneId, cols: number, rows: number): void;
  kill(pane: PaneId): void;
  /** Drop a pane that already exited (no signal sent). */
  forget(pane: PaneId): void;
  killAll(): Promise<void>;
  has(pane: PaneId): boolean;
};

export const createPtyHost = (cb: PtyHostCallbacks): PtyHost => {
  const ptys = new Map<PaneId, exec.PtyProcess>();
  const sizes = new Map<PaneId, string>();

  return {
    async spawn(req: SpawnRequest): Promise<void> {
      if (ptys.has(req.pane)) return;

      const pty = await exec.spawnPty({
        command: req.command,
        args: [...req.args],
        cwd: req.cwd,
        env: req.env,
        cols: req.cols,
        rows: req.rows,
      });

      ptys.set(req.pane, pty);
      sizes.set(req.pane, `${req.cols}x${req.rows}`);

      pty.onData((data) => cb.onData(req.pane, data));
      pty.exitCode
        .then((code) => cb.onExit(req.pane, code))
        .catch(() => cb.onExit(req.pane, -1));
    },

    write(pane: PaneId, data: string): void {
      ptys.get(pane)?.write(data);
    },

    resize(pane: PaneId, cols: number, rows: number): void {
      const key = `${cols}x${rows}`;
      if (sizes.get(pane) === key) return;
      sizes.set(pane, key);
      ptys.get(pane)?.resize(cols, rows);
    },

    kill(pane: PaneId): void {
      const p = ptys.get(pane);
      if (p === undefined) return;
      p.kill();
      ptys.delete(pane);
      sizes.delete(pane);
    },

    forget(pane: PaneId): void {
      ptys.delete(pane);
      sizes.delete(pane);
    },

    async killAll(): Promise<void> {
      const live = [...ptys.values()];
      ptys.clear();
      sizes.clear();

      for (const p of live) p.kill("SIGTERM");

      // Wait briefly for clean exits, then hard-kill stragglers so a process
      // that ignores SIGTERM can't hang shutdown forever.
      const exits = live.map((p) => p.exitCode.catch(() => -1));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = await Promise.race([
        Promise.allSettled(exits).then(() => false),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(true), 2000);
        }),
      ]);
      if (timer !== undefined) clearTimeout(timer);
      if (timedOut) { for (const p of live) p.kill("SIGKILL"); }
    },

    has(pane: PaneId): boolean {
      return ptys.has(pane);
    },
  };
};
