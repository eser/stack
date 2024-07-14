// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// This file contains code from deno std lib (https://github.com/denoland/deno_std),
// which is a standard library, licensed under the MIT license.

// Copyright (c) 2023-2024 Eser Ozvataf and other contributors
// Copyright (c) 2021-2023 the Deno authors

import * as jsRuntime from "@eser/standards/js-runtime";
import * as logging from "@eser/standards/logging";
import * as functions from "@eser/standards/functions";
import * as formatters from "./formatters.ts";

export const DEFAULT_LEVEL = logging.Severities.Info;

export type LogRecord = {
  message: string;
  // deno-lint-ignore no-explicit-any
  args: functions.ArgList<any>;
  datetime: Date;
  severity: logging.Severity;
  loggerName: string;
};

export type LoggerState = {
  readonly loggerName: string;
  readonly targetStream: WritableStream;
  loglevel: logging.Severity;
  readonly formatter: formatters.FormatterFn;
  encoder: TextEncoder;
};

export const createLoggerState = (
  loggerName: string,
  targetStream: WritableStream,
  loglevel: logging.Severity = DEFAULT_LEVEL,
  formatter: formatters.FormatterFn = formatters.jsonFormatter,
): LoggerState => {
  return {
    loggerName: loggerName,
    targetStream: targetStream,
    loglevel: loglevel,
    formatter: formatter,
    encoder: new TextEncoder(),
  };
};

export class Logger implements logging.Logger {
  readonly state: LoggerState;

  constructor(state: LoggerState) {
    this.state = state;
  }

  /**
   * If the level of the logger is greater than the level to log, then nothing
   * is logged, otherwise a log record is passed to each log handler.  `message` data
   * passed in is returned.  If a function is passed in, it is only evaluated
   * if the message will be logged and the return value will be the result of the
   * function, not the function itself, unless the function isn't called, in which
   * case undefined is returned.  All types are coerced to strings for logging.
   */
  async log<T>(
    severity: logging.Severity,
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined> {
    if (this.state.loglevel > severity) {
      return message instanceof Function ? undefined : message;
    }

    let fnResult: T | undefined;
    let logMessage: string;
    if (message instanceof Function) {
      fnResult = message();
      logMessage = this.asString(fnResult);
    } else {
      logMessage = this.asString(message);
    }
    const record: LogRecord = {
      message: logMessage,
      args: args,
      datetime: new Date(),
      severity: severity,
      loggerName: this.state.loggerName,
    };

    const outputWriter = this.state.targetStream.getWriter();
    await outputWriter.ready;

    const formatted = this.state.formatter(record);
    const encoded = this.state.encoder.encode(formatted);
    await outputWriter.write(encoded);

    outputWriter.releaseLock();

    return message instanceof Function ? fnResult : message;
  }

  asString(data: unknown, isProperty = false): string {
    if (typeof data === "string") {
      if (isProperty) {
        return `"${data}"`;
      }

      return data;
    }

    if (
      data === null ||
      typeof data === "number" ||
      typeof data === "bigint" ||
      typeof data === "boolean" ||
      typeof data === "undefined" ||
      typeof data === "symbol"
    ) {
      return String(data);
    }

    if (data instanceof Error) {
      return data.stack!;
    }

    if (typeof data === "object") {
      return `{${
        Object.entries(data)
          .map(([k, v]) => `"${k}":${this.asString(v, true)}`)
          .join(",")
      }}`;
    }

    return "undefined";
  }

  debug<T>(
    message: () => T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined>;
  debug<T>(
    // deno-lint-ignore no-explicit-any
    message: T extends functions.GenericFunction<any, any> ? never : T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T>;
  debug<T>(
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Debug, message, ...args);
  }

  info<T>(
    message: () => T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined>;
  info<T>(
    // deno-lint-ignore no-explicit-any
    message: T extends functions.GenericFunction<any, any> ? never : T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T>;
  info<T>(
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Info, message, ...args);
  }

  warn<T>(
    message: () => T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined>;
  warn<T>(
    // deno-lint-ignore no-explicit-any
    message: T extends functions.GenericFunction<any, any> ? never : T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T>;
  warn<T>(
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Warning, message, ...args);
  }

  error<T>(
    message: () => T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined>;
  error<T>(
    // deno-lint-ignore no-explicit-any
    message: T extends functions.GenericFunction<any, any> ? never : T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T>;
  error<T>(
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Error, message, ...args);
  }

  critical<T>(
    message: () => T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined>;
  critical<T>(
    // deno-lint-ignore no-explicit-any
    message: T extends functions.GenericFunction<any, any> ? never : T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T>;
  critical<T>(
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Critical, message, ...args);
  }
}

export const current: Logger = new Logger(
  createLoggerState(
    "default",
    jsRuntime.current.getStdout(),
    DEFAULT_LEVEL,
  ),
);
