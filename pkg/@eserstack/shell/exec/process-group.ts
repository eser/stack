// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Process group — manages multiple PTY processes with graceful shutdown.
 *
 * @module
 */

import type * as pty from "./pty.ts";

// =============================================================================
// Types
// =============================================================================

/** A PTY process registered with a {@link ProcessGroup}. */
export type ManagedProcess = {
  /** The id it was added under. */
  readonly id: string;
  /** The process itself. */
  readonly process: pty.PtyProcess;
  /** False once the process has exited or been killed. */
  active: boolean;
};

// =============================================================================
// ProcessGroup
// =============================================================================

/** How long killAll waits for processes to exit after the signal. */
const GRACEFUL_EXIT_TIMEOUT_MS = 3000;

/**
 * A set of PTY processes, keyed by id, that shut down together: gracefully
 * with {@link ProcessGroup.killAll}, or at once with
 * {@link ProcessGroup.forceKillAll}.
 */
export class ProcessGroup {
  readonly #processes: Map<string, ManagedProcess> = new Map();

  /** How many processes are registered, exited ones included. */
  get size(): number {
    return this.#processes.size;
  }

  /**
   * Register `process` under `id`, replacing any process already there. It is
   * marked inactive when it exits.
   */
  add(id: string, process: pty.PtyProcess): ManagedProcess {
    const managed: ManagedProcess = { id, process, active: true };
    this.#processes.set(id, managed);

    // Mark inactive when process exits
    process.exitCode
      .then(() => {
        managed.active = false;
      })
      .catch(() => {
        managed.active = false;
      });

    return managed;
  }

  /** The process registered under `id`, or `undefined`. */
  get(id: string): ManagedProcess | undefined {
    return this.#processes.get(id);
  }

  /**
   * Kill the process under `id` if it is still running, and unregister it.
   * Returns false when no process has that id.
   */
  remove(id: string): boolean {
    const managed = this.#processes.get(id);
    if (managed === undefined) return false;

    if (managed.active) {
      managed.process.kill();
    }
    this.#processes.delete(id);
    return true;
  }

  /** Every registered process, as a copy. */
  list(): readonly ManagedProcess[] {
    return [...this.#processes.values()];
  }

  /**
   * Send `signal` to every running process, then wait until they have all
   * exited or 3 seconds have passed, whichever comes first. The processes stay
   * registered.
   *
   * @param signal - The signal to send; SIGTERM by default.
   */
  async killAll(signal = "SIGTERM"): Promise<void> {
    const running = [...this.#processes.values()].filter(
      (managed) => managed.active,
    );

    for (const managed of running) {
      managed.process.kill(signal);
    }

    // The processes exit independently, so wait for all of them against one
    // shared deadline.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, GRACEFUL_EXIT_TIMEOUT_MS);
    });

    try {
      await Promise.race([
        Promise.all(running.map((managed) => managed.process.exitCode)),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Send SIGKILL to every running process and unregister them all. */
  forceKillAll(): void {
    for (const managed of this.#processes.values()) {
      if (managed.active) {
        managed.process.kill("SIGKILL");
        managed.active = false;
      }
    }
    this.#processes.clear();
  }
}
