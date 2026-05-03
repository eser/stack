// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CommandBuilder - Fluent API for shell command execution
 *
 * @module
 */

import * as standardsCrossRuntime from "@eserstack/standards/cross-runtime";
import { ensureLib, getLib } from "../ffi-client.ts";
import type { CommandOptions, CommandResult, StdioOption } from "./types.ts";
import { CommandError } from "./types.ts";
import * as childGo from "./child-go.ts";

const encoder = new TextEncoder();

const decoder = new TextDecoder();

/**
 * CommandBuilder provides a fluent API for building and executing shell commands
 */
export class CommandBuilder {
  readonly #cmd: string;
  readonly #args: string[];
  #options: CommandOptions;

  constructor(cmd: string, args: string[] = [], options: CommandOptions = {}) {
    this.#cmd = cmd;
    this.#args = args;
    this.#options = {
      throwOnError: true,
      stdout: "piped",
      stderr: "piped",
      ...options,
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

  /** Set timeout in milliseconds */
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
    // deno-lint-ignore no-console
    console.log(`$ ${fullCmd}`);
    return this;
  }

  /** Execute command and return result */
  async spawn(): Promise<CommandResult> {
    // Try Go FFI path first (not applicable when stdin is piped — streaming not supported)
    if (this.#options.stdin !== "piped") {
      await ensureLib();
      const lib = getLib();

      if (lib !== null) {
        try {
          const raw = lib.symbols.EserAjanShellExec(
            JSON.stringify({
              command: this.#cmd,
              args: this.#args,
              cwd: this.#options.cwd,
              env: this.#options.env,
              timeout: this.#options.timeout,
            }),
          );
          const goResult = JSON.parse(raw) as {
            stdout: string;
            stderr: string;
            code: number;
            error?: string;
          };

          if (!goResult.error) {
            const stdoutBytes = encoder.encode(goResult.stdout);
            const stderrBytes = encoder.encode(goResult.stderr);
            const result: CommandResult = {
              code: goResult.code,
              success: goResult.code === 0,
              stdout: stdoutBytes,
              stderr: stderrBytes,
            };

            if (!result.success && this.#options.throwOnError === true) {
              throw new CommandError(
                `Command failed with exit code ${result.code}: ${this.#cmd}`,
                this.#cmd,
                result.code,
                goResult.stderr,
              );
            }

            return result;
          }
        } catch (err) {
          if (err instanceof CommandError) throw err;
          // fall through to TS runtime
        }
      }
    }

    const { runtime } = standardsCrossRuntime;

    const result = await runtime.exec.spawn(this.#cmd, this.#args, {
      cwd: this.#options.cwd,
      env: this.#options.env,
      stdin: this.#options.stdin,
      stdout: this.#options.stdout,
      stderr: this.#options.stderr,
    });

    if (!result.success && this.#options.throwOnError === true) {
      const stderrText = decoder.decode(result.stderr);
      throw new CommandError(
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

  /** Pipe this command's output to another command */
  pipe(next: CommandBuilder): PipedCommandBuilder {
    return new PipedCommandBuilder([this, next]);
  }

  /**
   * Spawn child process with streaming I/O support (Option B — FFI only).
   * Throws if the native library is not available.
   *
   * @example
   * ```ts
   * const child = exec`deno fmt -`.child();
   * await input.pipeTo(child.stdin!);
   * const { stdout } = await child.output();
   * ```
   */
  child(): standardsCrossRuntime.ChildProcess {
    const lib = getLib();

    if (lib === null) {
      throw new Error(
        "@eserstack/ajan native library is not available — " +
          "exec.child() requires FFI or command-mode WASM",
      );
    }

    const env = this.#options.env !== undefined
      ? Object.entries(this.#options.env).map(([k, v]) => `${k}=${v}`)
      : undefined;

    return childGo.spawnChildGoSync(lib, {
      command: this.#cmd,
      args: this.#args,
      cwd: this.#options.cwd,
      env,
    });
  }
}

/**
 * Represents a pipeline of commands
 */
class PipedCommandBuilder {
  readonly #commands: CommandBuilder[];

  constructor(commands: CommandBuilder[]) {
    this.#commands = commands;
  }

  /** Add another command to the pipeline */
  pipe(next: CommandBuilder): PipedCommandBuilder {
    return new PipedCommandBuilder([...this.#commands, next]);
  }

  /** Execute the pipeline and return final stdout as text */
  async text(): Promise<string> {
    let input = "";

    for (const cmd of this.#commands) {
      // For now, simple implementation: run each command and pass output
      // A more sophisticated implementation would use actual pipes
      const result = await cmd.spawn();
      input = decoder.decode(result.stdout);
    }

    return input.trim();
  }

  /** Execute the pipeline and return final stdout as lines */
  async lines(): Promise<string[]> {
    const text = await this.text();
    if (text === "") return [];
    return text.split("\n");
  }
}
