// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Runs the probe programs in this directory in a child Node process, for the
 * adapter tests.
 *
 * @module
 */

import * as crossRuntime from "../../mod.ts";

/** How long a probe may run before the test kills it. */
const PROBE_TIMEOUT_MS = 30_000;

const decoder = new TextDecoder();

/** A runtime that can run a TypeScript file. */
export type ProbeRuntime = {
  readonly command: string;
  readonly args: readonly string[];
};

/**
 * The runtimes the probes run under: the Node that runs the tests, which
 * strips the types itself.
 */
export const PROBE_RUNTIMES: { readonly node: ProbeRuntime } = {
  node: { command: crossRuntime.runtime.process.execPath(), args: [] },
};

const probePath = (name: string): string =>
  crossRuntime.runtime.path.join(import.meta.dirname ?? ".", name);

/** What a probe process printed and how it ended. */
export type ProbeOutcome = {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
  readonly timedOut: boolean;
};

/**
 * Kills `child` when the probe takes too long, and returns the function that
 * cancels the timer.
 */
const killAfterTimeout = (
  child: ReturnType<typeof crossRuntime.runtime.exec.spawnChild>,
  timedOut: { value: boolean },
): () => void => {
  const timer = setTimeout(() => {
    timedOut.value = true;
    child.kill("SIGKILL");
  }, PROBE_TIMEOUT_MS);

  return () => clearTimeout(timer);
};

/**
 * Runs http-probe.ts under `probeRuntime`.
 *
 * @param probeRuntime - The runtime to run it with
 * @returns The probe's output and exit status
 */
export const runHttpProbe = async (
  probeRuntime: ProbeRuntime,
): Promise<ProbeOutcome> => {
  const child = crossRuntime.runtime.exec.spawnChild(
    probeRuntime.command,
    [...probeRuntime.args, probePath("http-probe.ts")],
    { stdout: "piped", stderr: "piped" },
  );
  const timedOut = { value: false };
  const cancelTimer = killAfterTimeout(child, timedOut);

  try {
    const output = await child.output();

    return {
      stdout: decoder.decode(output.stdout),
      stderr: decoder.decode(output.stderr),
      code: output.code,
      timedOut: timedOut.value,
    };
  } finally {
    cancelTimer();
  }
};

/**
 * Runs signal-probe.ts under `probeRuntime`: waits until it is ready, sends it
 * SIGTERM, and waits for it to end.
 *
 * @param probeRuntime - The runtime to run it with
 * @returns The probe's output and exit status
 */
export const runSignalProbe = async (
  probeRuntime: ProbeRuntime,
): Promise<ProbeOutcome> => {
  const child = crossRuntime.runtime.exec.spawnChild(
    probeRuntime.command,
    [...probeRuntime.args, probePath("signal-probe.ts")],
    { stdout: "piped", stderr: "piped" },
  );
  const timedOut = { value: false };
  const cancelTimer = killAfterTimeout(child, timedOut);

  if (child.stdout === null || child.stderr === null) {
    throw new Error('spawnChild returned no stdout or stderr for "piped"');
  }

  const stderr = new Response(child.stderr).text();
  const reader = child.stdout.getReader();
  let stdout = "";
  let signalled = false;

  try {
    while (true) {
      // The output arrives in order, and the signal goes out after "ready".
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      stdout += decoder.decode(value, { stream: true });
      if (!signalled && stdout.includes("ready\n")) {
        signalled = true;
        child.kill("SIGTERM");
      }
    }

    const status = await child.status;

    return {
      stdout,
      stderr: await stderr,
      code: status.code,
      timedOut: timedOut.value,
    };
  } finally {
    cancelTimer();
    reader.releaseLock();
  }
};
