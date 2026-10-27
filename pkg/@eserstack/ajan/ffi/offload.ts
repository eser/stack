// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Runs the blocking names of the binding table off the main thread
 * (decision-37, TASK-239).
 *
 * node:ffi calls are synchronous, so a call that waits on the network, a child
 * process or the terminal would park the event loop for as long as it waits.
 * The native backend hands those names to `node:worker_threads` workers that
 * open the library with their own `dlopen` (offload.worker.ts) and answer by
 * message:
 *
 * - A bounded pool for request and response calls. It holds at most
 *   `poolSize` workers ({@link DEFAULT_POOL_SIZE} unless the loader is told
 *   otherwise); a call that finds every worker busy waits in a queue. A worker
 *   idle for {@link POOL_IDLE_MS} ends.
 * - One dedicated worker per long-lived reader (a stream of a blocking name),
 *   which ends when its stream closes or reads to its end.
 *
 * A worker holds the process open only while a job is in flight. When a
 * worker cannot start (the permission model without `--allow-worker`), the
 * jobs run on the calling thread instead, as before this module existed.
 *
 * @module
 */

import * as workerThreads from "node:worker_threads";
import type * as types from "./types.ts";

/** How many pool workers run request and response calls at once, by default. */
export const DEFAULT_POOL_SIZE = 8;

/** The largest pool the loader accepts. */
export const MAX_POOL_SIZE = 64;

/** How long an idle pool worker waits for its next call before it ends. */
export const POOL_IDLE_MS = 30_000;

/** What a worker gets as `workerData`. */
export interface WorkerData {
  readonly libraryPath: string;
}

/** One operation the main thread posts to a worker. */
export interface Job {
  readonly id: number;
  /** `call` and `open` take a name and its request, `read` a stream handle. */
  readonly op: "call" | "open" | "read";
  readonly name: string;
  /** The request for `call` and `open`, the handle for `read`. */
  readonly request: string;
}

/** A worker's answer to one {@link Job}. */
export type Answer =
  | { readonly id: number; readonly envelope: types.Envelope }
  | { readonly id: number; readonly failure: string };

/** The worker counts {@link Offload.stats} reports. */
export interface WorkerStats {
  /** The pool's bound. */
  readonly poolSize: number;
  /** Pool workers alive now. */
  readonly pool: number;
  /** Pool workers with a call in flight. */
  readonly busy: number;
  /** Calls waiting for a pool worker. */
  readonly queued: number;
  /** The most pool workers alive at once since the library opened. */
  readonly peakPool: number;
  /** Dedicated reader workers alive now. */
  readonly readers: number;
  /** Jobs posted to any worker since the library opened. */
  readonly posted: number;
}

/** The dedicated worker of one stream. */
export interface ReaderLane {
  /** Opens the stream in the worker. */
  readonly open: (name: string, request: string) => Promise<types.Envelope>;
  /** Reads the stream's next chunk in the worker. */
  readonly read: (name: string, handle: string) => Promise<types.Envelope>;
  /** Ends the worker once the job in flight, if any, has answered. */
  readonly end: () => void;
}

/** The workers of one library. */
export interface Offload {
  /** Runs a call in a pool worker. */
  readonly call: (name: string, request: string) => Promise<types.Envelope>;
  /** Starts the dedicated worker of a stream. */
  readonly reader: () => ReaderLane;
  /** The worker counts. */
  readonly stats: () => WorkerStats;
  /** Ends every worker and fails the queued calls. */
  readonly close: () => void;
}

/**
 * The members of a `node:worker_threads` Worker the pool uses. Declared here
 * so the published declarations do not name `node:worker_threads`, which a
 * consumer without @types/node cannot resolve.
 */
export interface PoolWorker {
  readonly postMessage: (job: Job) => void;
  readonly on: {
    (event: "message", listener: (answer: Answer) => void): unknown;
    (event: "error", listener: (error: Error) => void): unknown;
    (event: "exit", listener: (code: number) => void): unknown;
  };
  readonly ref: () => void;
  readonly unref: () => void;
  readonly terminate: () => Promise<number>;
}

/** Options for {@link createOffload}. */
export interface OffloadOptions {
  /** The library the workers open. */
  readonly libraryPath: string;
  /** The pool's bound. */
  readonly poolSize: number;
  /** Runs a job on the calling thread when no worker can start. */
  readonly inline: types.Transport;
  /** Starts a worker; tests replace it. */
  readonly spawn?: (data: WorkerData) => PoolWorker;
}

/** The worker module next to this one, with this module's own extension. */
const workerUrl = (): URL => {
  const extension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";

  return new URL(`./offload.worker${extension}`, import.meta.url);
};

const spawnWorker = (data: WorkerData): PoolWorker =>
  new workerThreads.Worker(workerUrl(), {
    workerData: data,
    name: "eser-ajan",
    // node:ffi prints its ExperimentalWarning once per thread; the main
    // thread has printed it already.
    execArgv: ["--no-warnings"],
  });

/** One worker and the jobs it has not answered yet. */
interface Lane {
  readonly send: (
    op: Job["op"],
    name: string,
    request: string,
  ) => Promise<types.Envelope>;
  readonly pending: () => number;
  readonly alive: () => boolean;
  /** Ends the worker; jobs still in flight fail with `reason`, if given. */
  readonly terminate: (reason?: Error) => void;
}

interface LaneHooks {
  /** Runs after each answer. */
  readonly settled: () => void;
  /** Runs once, when the worker is gone. */
  readonly exited: () => void;
  /** Counts a posted job. */
  readonly posted: () => void;
}

const startLane = (worker: PoolWorker, hooks: LaneHooks): Lane => {
  const waiting = new Map<
    number,
    {
      readonly resolve: (envelope: types.Envelope) => void;
      readonly reject: (error: Error) => void;
    }
  >();
  let nextId = 0;
  let gone: Error | null = null;

  // An idle worker must not hold the process open; one with a job in flight
  // must, or the process could exit before the answer arrives.
  worker.unref();

  const fail = (error: Error): void => {
    if (gone !== null) {
      return;
    }

    gone = error;
    for (const entry of waiting.values()) {
      entry.reject(error);
    }
    waiting.clear();
    hooks.exited();
  };

  worker.on("message", (answer: Answer) => {
    const entry = waiting.get(answer.id);
    if (entry === undefined) {
      return;
    }

    waiting.delete(answer.id);
    if (waiting.size === 0) {
      worker.unref();
    }

    if ("envelope" in answer) {
      entry.resolve(answer.envelope);
    } else {
      entry.reject(new Error(`eser-ajan worker: ${answer.failure}`));
    }

    hooks.settled();
  });

  worker.on("error", (error: Error) => {
    fail(
      new Error(`eser-ajan worker failed: ${error.message}`, { cause: error }),
    );
  });

  worker.on("exit", (code: number) => {
    fail(new Error(`the eser-ajan worker ended (exit code ${code})`));
  });

  return {
    send: (op, name, request) => {
      if (gone !== null) {
        return Promise.reject(gone);
      }

      nextId += 1;
      const id = nextId;
      if (waiting.size === 0) {
        worker.ref();
      }

      const answer = new Promise<types.Envelope>((resolve, reject) => {
        waiting.set(id, { resolve, reject });
      });
      worker.postMessage({ id, op, name, request } satisfies Job);
      hooks.posted();

      return answer;
    },
    pending: () => waiting.size,
    alive: () => gone === null,
    terminate: (reason) => {
      if (reason !== undefined) {
        fail(reason);
      }
      void worker.terminate();
    },
  };
};

/** A lane that runs its jobs on the calling thread. */
const inlineLane = (transport: types.Transport): ReaderLane => ({
  open: (name, request) =>
    Promise.resolve().then(() => transport.streamOpen(name, request)),
  read: (_name, handle) =>
    Promise.resolve().then(() => transport.streamRead(handle)),
  end: () => {},
});

/** A call that waits for a pool worker. */
interface QueuedCall {
  readonly name: string;
  readonly request: string;
  readonly resolve: (envelope: types.Envelope) => void;
  readonly reject: (error: Error) => void;
}

/**
 * Builds the workers of one library. No worker starts until the first
 * blocking name runs.
 *
 * @param options - The library path, the pool bound and the inline transport
 * @returns The offload
 */
export const createOffload = (options: OffloadOptions): Offload => {
  const spawn = options.spawn ?? spawnWorker;
  const poolSize = options.poolSize;
  const pool: Lane[] = [];
  const idleTimers = new Map<Lane, ReturnType<typeof setTimeout>>();
  const readers = new Set<Lane>();
  const queue: QueuedCall[] = [];
  let peakPool = 0;
  let posted = 0;
  let closed = false;
  // Set when a worker could not start; every later job runs inline.
  let spawnFailure: Error | null = null;

  const counted = (): void => {
    posted += 1;
  };

  const trySpawn = (hooks: LaneHooks): Lane | null => {
    if (spawnFailure !== null) {
      return null;
    }

    try {
      return startLane(spawn({ libraryPath: options.libraryPath }), hooks);
    } catch (error) {
      spawnFailure = error instanceof Error ? error : new Error(String(error));
      return null;
    }
  };

  const clearIdle = (lane: Lane): void => {
    const timer = idleTimers.get(lane);
    if (timer !== undefined) {
      clearTimeout(timer);
      idleTimers.delete(lane);
    }
  };

  const retire = (lane: Lane): void => {
    clearIdle(lane);
    const index = pool.indexOf(lane);
    if (index !== -1) {
      pool.splice(index, 1);
    }
  };

  const armIdle = (lane: Lane): void => {
    clearIdle(lane);
    const timer = setTimeout(() => {
      idleTimers.delete(lane);
      retire(lane);
      lane.terminate();
    }, POOL_IDLE_MS);
    // An idle worker's timer does not hold the process open either.
    timer.unref();
    idleTimers.set(lane, timer);
  };

  const dispatch = (lane: Lane, job: QueuedCall): void => {
    clearIdle(lane);
    lane.send("call", job.name, job.request).then(job.resolve, job.reject);
  };

  const next = (lane: Lane): void => {
    if (!lane.alive() || lane.pending() > 0) {
      return;
    }

    const job = queue.shift();
    if (job !== undefined) {
      dispatch(lane, job);
      return;
    }

    armIdle(lane);
  };

  // Starts a pool worker and adds it to the pool. A worker that ends while
  // calls wait is replaced, so the queue never stalls.
  const spawnPoolLane = (): Lane | null => {
    const lane: Lane | null = trySpawn({
      settled: () => {
        next(lane!);
      },
      exited: () => {
        retire(lane!);
        if (!closed && queue.length > 0 && pool.length < poolSize) {
          const replacement = spawnPoolLane();
          if (replacement !== null) {
            next(replacement);
          }
        }
      },
      posted: counted,
    });

    if (lane !== null) {
      pool.push(lane);
      peakPool = Math.max(peakPool, pool.length);
    }

    return lane;
  };

  const call = (name: string, request: string): Promise<types.Envelope> => {
    if (closed) {
      return Promise.reject(
        new Error(`${name}: the eser-ajan library is already closed`),
      );
    }

    return new Promise<types.Envelope>((resolve, reject) => {
      const job: QueuedCall = { name, request, resolve, reject };

      const idle = pool.find((lane) => lane.alive() && lane.pending() === 0);
      if (idle !== undefined) {
        dispatch(idle, job);
        return;
      }

      if (pool.length < poolSize) {
        const lane = spawnPoolLane();

        if (lane === null) {
          // No worker can start: run it here, after the caller's code.
          Promise.resolve()
            .then(() => options.inline.call(name, request))
            .then(resolve, reject);
          return;
        }

        dispatch(lane, job);
        return;
      }

      queue.push(job);
    });
  };

  const reader = (): ReaderLane => {
    if (closed) {
      throw new Error("the eser-ajan library is already closed");
    }

    let ending = false;
    const lane: Lane | null = trySpawn({
      settled: () => {
        if (ending && lane!.pending() === 0) {
          lane!.terminate();
        }
      },
      exited: () => {
        readers.delete(lane!);
      },
      posted: counted,
    });

    if (lane === null) {
      return inlineLane(options.inline);
    }

    readers.add(lane);

    return {
      open: (name, request) => lane.send("open", name, request),
      read: (name, handle) => lane.send("read", name, handle),
      end: () => {
        if (ending) {
          return;
        }

        ending = true;
        if (lane.pending() === 0) {
          lane.terminate();
        }
      },
    };
  };

  return {
    call,
    reader,
    stats: () => ({
      poolSize,
      pool: pool.length,
      busy: pool.filter((lane) => lane.pending() > 0).length,
      queued: queue.length,
      peakPool,
      readers: readers.size,
      posted,
    }),
    close: () => {
      if (closed) {
        return;
      }

      closed = true;
      for (const job of queue.splice(0)) {
        job.reject(
          new Error(`${job.name}: the eser-ajan library was closed first`),
        );
      }

      const reason = new Error(
        "the eser-ajan library was closed while this call was in flight",
      );
      for (const lane of [...pool, ...readers]) {
        clearIdle(lane);
        lane.terminate(reason);
      }
    },
  };
};
