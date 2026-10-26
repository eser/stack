// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The worker thread behind {@link offload}: it opens the eser-ajan library
 * with its own `dlopen` and answers the operations the main thread posts, one
 * at a time (decision-37).
 *
 * The second `dlopen` reaches the same Go image as the main thread's, so a
 * handle opened on one thread is read on the other. On macOS that is safe only
 * because the library pins itself with RTLD_NODELETE (pin_image_posix.go):
 * Node closes the library when a worker ends, and an unpinned Go image would
 * be unmapped under its own running threads.
 *
 * Protocol: the main thread posts {@link offload.Job} messages and the worker
 * answers each with a {@link offload.Answer} of the same id. A library that
 * does not open answers every job with its failure.
 *
 * @module
 */

import * as workerThreads from "node:worker_threads";
import * as backendNode from "./backend-node.ts";
import type * as offload from "./offload.ts";
import type * as types from "./types.ts";

const port = workerThreads.parentPort;
const data = workerThreads.workerData as offload.WorkerData;

const run = (transport: types.Transport, job: offload.Job): types.Envelope => {
  switch (job.op) {
    case "call":
      return transport.call(job.name, job.request);
    case "open":
      return transport.streamOpen(job.name, job.request);
    case "read":
      return transport.streamRead(job.request);
  }
};

if (port !== null) {
  // The library opens once, as the worker starts; jobs that arrive before it
  // is open wait for it, in the order they were posted. A library that does
  // not open fails every job with the reason.
  const opening = backendNode
    .openTransport(data.libraryPath)
    .then((opened) => opened.transport);
  opening.catch(() => {});

  const answer = async (job: offload.Job): Promise<offload.Answer> => {
    try {
      return { id: job.id, envelope: run(await opening, job) };
    } catch (error) {
      return {
        id: job.id,
        failure: error instanceof Error ? error.message : String(error),
      };
    }
  };

  port.on("message", (job: offload.Job) => {
    void answer(job).then((reply) => {
      port.postMessage(reply);
    });
  });
}
