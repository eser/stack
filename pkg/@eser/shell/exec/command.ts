// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CommandBuilder - Fluent API for shell command execution
 *
 * @module
 */

import * as standardsRuntime from "@eser/standards/runtime";
import type { CommandOptions, CommandResult, StdioOption } from "./types.ts";
import { CommandError } from "./types.ts";

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
    } else if (typeof keyOrVars === "object") {
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
    const { runtime } = standardsRuntime;

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
   * Spawn child process with streaming I/O support.
   * Returns a handle with stdin/stdout/stderr streams for advanced use cases.
   *
   * @example
   * ```ts
   * const child = exec`deno fmt -`.child();
   * await input.pipeTo(child.stdin!);
   * const { stdout } = await child.output();
   * ```
   */
  child(): standardsRuntime.ChildProcess {
    const { runtime } = standardsRuntime;

    return runtime.exec.spawnChild(this.#cmd, this.#args, {
      cwd: this.#options.cwd,
      env: this.#options.env,
      stdin: this.#options.stdin ?? "piped",
      stdout: this.#options.stdout ?? "piped",
      stderr: this.#options.stderr ?? "piped",
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
