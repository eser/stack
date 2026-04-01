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

export type ManagedProcess = {
  readonly id: string;
  readonly process: pty.PtyProcess;
  active: boolean;
};

// =============================================================================
// ProcessGroup
// =============================================================================

export class ProcessGroup {
  readonly #processes: Map<string, ManagedProcess> = new Map();

  get size(): number {
    return this.#processes.size;
  }

  add(id: string, process: pty.PtyProcess): ManagedProcess {
    const managed: ManagedProcess = { id, process, active: true };
    this.#processes.set(id, managed);

    // Mark inactive when process exits
    process.exitCode.then(() => {
      managed.active = false;
    }).catch(() => {
      managed.active = false;
    });

    return managed;
  }

  get(id: string): ManagedProcess | undefined {
    return this.#processes.get(id);
  }

  remove(id: string): boolean {
    const managed = this.#processes.get(id);
    if (managed === undefined) return false;

    if (managed.active) {
      managed.process.kill();
    }
    this.#processes.delete(id);
    return true;
  }

  list(): readonly ManagedProcess[] {
    return [...this.#processes.values()];
  }

  async killAll(signal = "SIGTERM"): Promise<void> {
    for (const managed of this.#processes.values()) {
      if (managed.active) {
        managed.process.kill(signal);
      }
    }

    // Wait up to 3s for graceful exit
    const timeout = 3000;
    const start = Date.now();

    for (const managed of this.#processes.values()) {
      if (managed.active) {
        const remaining = timeout - (Date.now() - start);
        if (remaining > 0) {
          await Promise.race([
            managed.process.exitCode,
            new Promise((r) => setTimeout(r, remaining)),
          ]);
        }
      }
    }
  }

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
