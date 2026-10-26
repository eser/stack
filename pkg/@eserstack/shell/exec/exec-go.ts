// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * One-shot command execution through the Go bridge's `shellExec` call.
 *
 * `CommandBuilder.spawn()` and `goExec()` both build their request here, so the
 * two cannot drift apart again. the bridge's `shellExecRequest` reads `env` as
 * `KEY=VALUE` strings and `timeout` as a Go duration string; a `Record` or a
 * plain number fails its JSON unmarshal with "invalid request JSON".
 *
 * @module
 */

import type * as ffiTypes from "@eserstack/ajan/ffi";
import * as types from "./types.ts";

/**
 * How long a command may run when the caller sets no timeout: 10 minutes, the
 * same value as the bridge's `defaultShellExecTimeout`. Every request carries it
 * explicitly, so the runtime spawn and the bridge stop a command at the same
 * point.
 */
export const DEFAULT_TIMEOUT_MS: number = 10 * 60 * 1000;

/**
 * The largest timeout accepted, in milliseconds (about 24.8 days). It is the
 * longest delay a JavaScript timer holds: a larger one fires at once, so the
 * runtime spawn would stop the command as soon as it started.
 */
export const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Checks a timeout and rounds it up to whole milliseconds.
 *
 * There is no value for "no limit": every command the bridge runs has one, and
 * 0 or a negative value is a caller error rather than a request to wait
 * forever. A caller with a long command passes a larger value.
 *
 * @throws {RangeError} When `ms` is not above 0 and at most
 *   {@link MAX_TIMEOUT_MS}.
 */
export const normalizeTimeout = (ms: number): number => {
  if (!Number.isFinite(ms) || ms <= 0 || ms > MAX_TIMEOUT_MS) {
    throw new RangeError(
      `timeout ${ms} ms is out of range: pass milliseconds above 0 and at ` +
        `most ${MAX_TIMEOUT_MS} (about 24.8 days), such as 30_000, or leave ` +
        `the timeout unset for the default`,
    );
  }

  return Math.ceil(ms);
};

/**
 * Converts an env record to the `KEY=VALUE` list the bridge reads (its
 * `shellExecRequest.Env` is `[]string`). The runtime spawn takes the record
 * directly.
 */
export const envToPairs = (
  env: Readonly<Record<string, string>> | undefined,
): string[] | undefined =>
  env !== undefined
    ? Object.entries(env).map(([key, value]) => `${key}=${value}`)
    : undefined;

/** What a caller asks the bridge to run, in this package's terms. */
export type ExecGoOptions = {
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly stdin?: string;
  /** Milliseconds; {@link DEFAULT_TIMEOUT_MS} when unset. */
  readonly timeout?: number;
};

/** The JSON body of a `shellExec` call: the bridge's `shellExecRequest`. */
export type ExecGoRequest = {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: readonly string[];
  readonly stdin?: string;
  /** A Go duration string such as "30000ms". */
  readonly timeout: string;
};

/** A successful `shellExec` reply. */
export type ExecGoReply = {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
};

/**
 * Builds the request the bridge reads from this package's options.
 *
 * @throws {RangeError} When `options.timeout` is out of range; see
 *   {@link normalizeTimeout}.
 */
export const buildExecGoRequest = (
  command: string,
  options: ExecGoOptions,
): ExecGoRequest => ({
  command,
  args: options.args,
  cwd: options.cwd,
  env: envToPairs(options.env),
  stdin: options.stdin,
  timeout: `${normalizeTimeout(options.timeout ?? DEFAULT_TIMEOUT_MS)}ms`,
});

/**
 * Runs one request through the bridge and unwraps its reply.
 *
 * A non-zero exit code is a normal reply and comes back in `code`. An `error`
 * means the command did not run to an exit code, and is thrown rather than
 * retried: the command may already have run, up to its timeout.
 *
 * @throws {types.CommandRunError} When the bridge reports an error: the
 *   program or working directory is missing, the request was rejected, or the
 *   command ran past its timeout.
 */
export const runExecGo = (
  lib: ffiTypes.FFILibrary,
  request: ExecGoRequest,
): ExecGoReply => {
  // The bridge's shellExecResponse: stdout and stderr are omitted when empty,
  // code is always present.
  const reply = lib.call("shellExec", request) as {
    readonly stdout?: string;
    readonly stderr?: string;
    readonly code: number;
    readonly error?: string;
  };

  if (reply.error !== undefined && reply.error !== "") {
    throw new types.CommandRunError(
      `run ${request.command}: ${reply.error}`,
      request.command,
    );
  }

  return {
    stdout: reply.stdout ?? "",
    stderr: reply.stderr ?? "",
    code: reply.code,
  };
};
