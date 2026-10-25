// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CommandBuilder - Fluent API for shell command execution
 *
 * @module
 */

import * as standardsCrossRuntime from "@eserstack/standards/cross-runtime";
import type * as ffiTypes from "@eserstack/ajan/ffi";
import * as ffiClient from "../ffi-client.ts";
import type { CommandOptions, CommandResult, StdioOption } from "./types.ts";
import * as types from "./types.ts";
import * as childGo from "./child-go.ts";
import * as execGo from "./exec-go.ts";

const encoder = new TextEncoder();

const decoder = new TextDecoder();

/**
 * CommandBuilder provides a fluent API for building and executing shell commands
 */
export class CommandBuilder {
  readonly #cmd: string;
  readonly #args: string[];
  readonly #options: CommandOptions;

  /**
   * Create a builder for one command; nothing runs until `spawn()` or one of
   * the methods that call it.
   *
   * @param cmd - The program to run, looked up on PATH unless it is a path.
   * @param args - Its arguments, passed as argv without a shell.
   * @param options - Initial options; the methods below return a copy with one
   *   changed. Output is piped and a non-zero exit throws unless set otherwise.
   * @throws {RangeError} When `options.timeout` is out of range; see
   *   {@link CommandBuilder.timeout}.
   */
  constructor(cmd: string, args: string[] = [], options: CommandOptions = {}) {
    this.#cmd = cmd;
    this.#args = args;
    this.#options = {
      throwOnError: true,
      stdout: "piped",
      stderr: "piped",
      ...options,
      timeout:
        options.timeout !== undefined
          ? execGo.normalizeTimeout(options.timeout)
          : undefined,
    };
  }

  /** Set working directory */
  cwd(path: string): CommandBuilder {
    return new CommandBuilder(this.#cmd, this.#args, {
      ...this.#options,
      cwd: path,
    });
  }

  /** Set environment variable(s) */
  env(
    keyOrVars: string | Record<string, string>,
    value?: string,
  ): CommandBuilder {
    const currentEnv = this.#options.env ?? {};
    let newEnv: Record<string, string>;

    if (typeof keyOrVars === "string" && value !== undefined) {
      newEnv = { ...currentEnv, [keyOrVars]: value };
    } else if (keyOrVars !== null && typeof keyOrVars === "object") {
      newEnv = { ...currentEnv, ...keyOrVars };
    } else {
      newEnv = currentEnv;
    }

    return new CommandBuilder(this.#cmd, this.#args, {
      ...this.#options,
      env: newEnv,
    });
  }

  /** Set stdin handling */
  stdin(option: StdioOption): CommandBuilder {
    return new CommandBuilder(this.#cmd, this.#args, {
      ...this.#options,
      stdin: option,
    });
  }

  /**
   * Write `data` to the process's stdin and close it.
   *
   * Prefer this over interpolating a large value into the command: argv is
   * bounded, stdin is not.
   */
  stdinText(data: string): CommandBuilder {
    return new CommandBuilder(this.#cmd, this.#args, {
      ...this.#options,
      stdin: "piped",
      stdinText: data,
    });
  }

  /** Set stdout handling */
  stdout(option: StdioOption): CommandBuilder {
    return new CommandBuilder(this.#cmd, this.#args, {
      ...this.#options,
      stdout: option,
    });
  }

  /** Set stderr handling */
  stderr(option: StdioOption): CommandBuilder {
    return new CommandBuilder(this.#cmd, this.#args, {
      ...this.#options,
      stderr: option,
    });
  }

  /**
   * Stop the command after `ms` milliseconds.
   *
   * Without a timeout, a command whose output is captured ("piped" or "null"
   * stdio) stops after 10 minutes, the same default the Go bridge applies. A
   * command with any "inherit" stdio has no default: it is attached to the
   * terminal, where the person running it can interrupt it.
   *
   * There is no value for "no limit". 0, a negative number, NaN and Infinity
   * throw, as does a value above 2147483647 (about 24.8 days), the longest
   * delay a timer holds. Pass a larger value for a long command.
   *
   * A command stopped at its timeout throws {@link types.CommandRunError},
   * with or without `noThrow()`.
   *
   * @param ms - Milliseconds, above 0 and at most 2147483647; a fraction is
   *   rounded up.
   * @throws {RangeError} When `ms` is out of that range.
   */
  timeout(ms: number): CommandBuilder {
    return new CommandBuilder(this.#cmd, this.#args, {
      ...this.#options,
      timeout: ms,
    });
  }

  /** Disable throwing on non-zero exit code */
  noThrow(): CommandBuilder {
    return new CommandBuilder(this.#cmd, this.#args, {
      ...this.#options,
      throwOnError: false,
    });
  }

  /** Suppress all output (null stdout and stderr) */
  quiet(): CommandBuilder {
    return new CommandBuilder(this.#cmd, this.#args, {
      ...this.#options,
      stdout: "null",
      stderr: "null",
    });
  }

  /** Print command before execution */
  printCommand(): CommandBuilder {
    const fullCmd = [this.#cmd, ...this.#args].join(" ");
    // Echoing the command to the terminal is what the caller asked for.
    // oxlint-disable-next-line no-console
    console.log(`$ ${fullCmd}`);
    return this;
  }

  /**
   * Execute the command and return its result.
   *
   * A command whose stdio is all "piped" or "null" runs through the Go bridge
   * when the native library is available, and through the runtime spawn
   * otherwise. Any "inherit" stdio, or piped stdin, uses the runtime spawn.
   *
   * @throws {types.CommandError} When the command exits non-zero, unless
   *   `noThrow()` was set.
   * @throws {types.CommandRunError} When the command could not start, or ran
   *   past its timeout.
   */
  async spawn(): Promise<CommandResult> {
    const attachedToTerminal =
      this.#options.stdin === "inherit" ||
      this.#options.stdout === "inherit" ||
      this.#options.stderr === "inherit";

    // The bridge's one-shot exec captures stdout and stderr into buffers: it
    // can neither stream to the terminal nor connect a stdin stream.
    if (!attachedToTerminal && this.#options.stdin !== "piped") {
      const lib = await ffiClient.ensureNativeLib();

      // Only a missing native library falls back to the runtime. Once the
      // bridge has the command its answer stands: retrying after an error
      // would run the command a second time, and one the bridge stopped at its
      // timeout would then run with no timeout at all.
      if (lib !== null) {
        return this.#spawnNative(lib);
      }
    }

    return await this.#spawnRuntime(attachedToTerminal);
  }

  #spawnNative(lib: ffiTypes.FFILibrary): CommandResult {
    const reply = execGo.runExecGo(
      lib,
      execGo.buildExecGoRequest(this.#cmd, {
        args: this.#args,
        cwd: this.#options.cwd,
        env: this.#options.env,
        timeout: this.#options.timeout,
      }),
    );

    return this.#checkExit(
      {
        code: reply.code,
        success: reply.code === 0,
        stdout: encoder.encode(reply.stdout),
        stderr: encoder.encode(reply.stderr),
      },
      reply.stderr,
    );
  }

  async #spawnRuntime(attachedToTerminal: boolean): Promise<CommandResult> {
    const { runtime } = standardsCrossRuntime;

    // A captured command gets the bridge's default, so the outcome does not
    // depend on whether the native library is installed. One attached to the
    // terminal gets none; see timeout().
    const timeoutMs =
      this.#options.timeout ??
      (attachedToTerminal ? undefined : execGo.DEFAULT_TIMEOUT_MS);

    // An own timer rather than AbortSignal.timeout(), so it is cleared the
    // moment the command exits instead of staying pending for the full delay.
    const controller =
      timeoutMs !== undefined ? new AbortController() : undefined;
    const timer =
      controller !== undefined
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined;
    const timedOut = (): boolean => controller?.signal.aborted === true;

    let result: CommandResult;

    try {
      result = await runtime.exec.spawn(
        this.#cmd,
        this.#args,
        this.#runtimeOptions(controller?.signal),
      );
    } catch (error) {
      // Node rejects the spawn when its signal aborts.
      if (timeoutMs !== undefined && timedOut()) {
        throw this.#timeoutError(timeoutMs, error);
      }

      // The runtime rejects when the program or the working directory does not
      // exist: the same failure the bridge reports, so the same error type.
      throw new types.CommandRunError(
        `run ${this.#cmd}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        this.#cmd,
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }

    // Deno resolves with the killed process's exit status.
    if (timeoutMs !== undefined && !result.success && timedOut()) {
      throw this.#timeoutError(timeoutMs);
    }

    return this.#checkExit(result, decoder.decode(result.stderr));
  }

  #runtimeOptions(
    signal: AbortSignal | undefined,
  ): standardsCrossRuntime.SpawnOptions {
    return {
      cwd: this.#options.cwd,
      env: this.#options.env,
      stdin: this.#options.stdin,
      stdinText: this.#options.stdinText,
      stdout: this.#options.stdout,
      stderr: this.#options.stderr,
      signal,
    };
  }

  #timeoutError(timeoutMs: number, cause?: unknown): types.CommandRunError {
    return new types.CommandRunError(
      `run ${this.#cmd}: the command ran past its ${timeoutMs} ms timeout ` +
        `and was stopped; pass a larger value to timeout() to allow more time`,
      this.#cmd,
      cause !== undefined ? { cause } : undefined,
    );
  }

  #checkExit(result: CommandResult, stderrText: string): CommandResult {
    if (!result.success && this.#options.throwOnError === true) {
      throw new types.CommandError(
        `Command failed with exit code ${result.code}: ${this.#cmd}`,
        this.#cmd,
        result.code,
        stderrText,
      );
    }

    return result;
  }

  /** Execute and return stdout as trimmed text */
  async text(
    stream: "stdout" | "stderr" | "combined" = "stdout",
  ): Promise<string> {
    const result = await this.spawn();

    switch (stream) {
      case "stdout":
        return decoder.decode(result.stdout).trim();
      case "stderr":
        return decoder.decode(result.stderr).trim();
      case "combined":
        return (
          decoder.decode(result.stdout) + decoder.decode(result.stderr)
        ).trim();
    }
  }

  /** Execute and parse stdout as JSON */
  async json<T = unknown>(): Promise<T> {
    const text = await this.text();
    return JSON.parse(text) as T;
  }

  /** Execute and return stdout as lines */
  async lines(): Promise<string[]> {
    const text = await this.text();
    if (text === "") return [];
    return text.split("\n");
  }

  /** Execute and return stdout as bytes */
  async bytes(): Promise<Uint8Array> {
    const result = await this.spawn();
    return result.stdout;
  }

  /** Execute and return only the exit code (never throws) */
  async code(): Promise<number> {
    const result = await this.noThrow().spawn();
    return result.code;
  }

  /**
   * Not implemented — always throws.
   *
   * This used to return a builder that ran each command in turn and threw every
   * command's output away except the last: nothing was ever written to the next
   * child's stdin, so `a.pipe(b).text()` returned b's output with b reading the
   * inherited stdin rather than a's. It reported success while producing an
   * answer unrelated to the pipeline that was asked for, which is worse than
   * being absent.
   *
   * Compose a real pipeline with {@link CommandBuilder.child}, which exposes the
   * child's stdin and stdout as streams.
   *
   * @throws {Error} Always.
   */
  pipe(_next: CommandBuilder): never {
    throw new Error(
      "exec(...).pipe() is not implemented. It previously discarded the " +
        "upstream output instead of writing it to the next command's stdin, " +
        "so results were silently wrong. Build the pipeline with .child() " +
        "and pipe the streams yourself: " +
        "const a = exec`...`.child(); const b = exec`...`.child(); " +
        "await a.stdout.pipeTo(b.stdin);",
    );
  }

  /**
   * Spawn a child process with streaming stdin, stdout and stderr, through the
   * Go bridge only; there is no runtime fallback.
   *
   * It is synchronous, so the bridge must already be loaded: by an earlier
   * `spawn()` in this process, or by another package that uses the bridge.
   *
   * @throws {Error} When no bridge library has loaded.
   *
   * @example
   * ```ts
   * import * as shell from "@eserstack/shell";
   *
   * const input = ReadableStream.from([new TextEncoder().encode("const a=1")]);
   * const child = shell.exec.exec`deno fmt -`.child();
   * await input.pipeTo(child.stdin!);
   * const { stdout } = await child.output();
   * ```
   */
  child(): standardsCrossRuntime.ChildProcess {
    // child() is synchronous, so it can only use a library that has already
    // loaded: the native one spawn() loads, or the shared one.
    const lib = ffiClient.getNativeLib() ?? ffiClient.getLib();

    if (lib === null) {
      const nativeCause = ffiClient.describeNativeLoadFailure();

      throw new Error(
        "@eserstack/ajan native library is not available: " +
          "exec.child() requires the native library (the WASM fallback does not serve shell functions)" +
          (nativeCause !== "" ? nativeCause : ffiClient.describeLoadFailure()),
      );
    }

    const env = execGo.envToPairs(this.#options.env);

    return childGo.spawnChildGoSync(lib, {
      command: this.#cmd,
      args: this.#args,
      cwd: this.#options.cwd,
      env,
    });
  }
}
