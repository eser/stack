// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// This file contains code from deno std lib (https://github.com/denoland/deno_std),
// which is a standard library, licensed under the MIT license.

// Copyright (c) 2023-2024 Eser Ozvataf and other contributors
// Copyright (c) 2021-2023 the Deno authors

import * as runtime from "../standards/runtime.ts";
import * as logging from "../standards/logging.ts";
import * as functions from "../standards/functions.ts";
import * as formatters from "./formatters.ts";

export const DEFAULT_LEVEL = logging.Severities.Info;

export interface LogRecord {
  message: string;
  args: functions.ArgList;
  datetime: Date;
  severity: logging.Severity;
  loggerName: string;
}

export const Logger = class implements logging.Logger {
  readonly loggerName: string;
  readonly targetStream: WritableStream;
  loglevel: logging.Severity;
  readonly formatter: formatters.FormatterFn;
  encoder: TextEncoder;

  constructor(
    loggerName: string,
    targetStream: WritableStream,
    loglevel: logging.Severity = DEFAULT_LEVEL,
    formatter: formatters.FormatterFn = formatters.jsonFormatter,
  ) {
    this.loggerName = loggerName;
    this.targetStream = targetStream;
    this.loglevel = loglevel;
    this.formatter = formatter;
    this.encoder = new TextEncoder();
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
    message: (T extends functions.GenericFunction ? never : T) | (() => T),
    ...args: functions.ArgList
  ): Promise<T | undefined> {
    if (this.loglevel > severity) {
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
      loggerName: this.loggerName,
    };

    const outputWriter = this.targetStream.getWriter();
    await outputWriter.ready;

    const formatted = this.formatter(record);
    const encoded = this.encoder.encode(formatted);
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
    ...args: functions.ArgList
  ): Promise<T | undefined>;
  debug<T>(
    message: T extends functions.GenericFunction ? never : T,
    ...args: functions.ArgList
  ): Promise<T>;
  debug<T>(
    message: (T extends functions.GenericFunction ? never : T) | (() => T),
    ...args: functions.ArgList
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Debug, message, ...args);
  }

  info<T>(message: () => T, ...args: functions.ArgList): Promise<T | undefined>;
  info<T>(
    message: T extends functions.GenericFunction ? never : T,
    ...args: functions.ArgList
  ): Promise<T>;
  info<T>(
    message: (T extends functions.GenericFunction ? never : T) | (() => T),
    ...args: functions.ArgList
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Info, message, ...args);
  }

  warn<T>(message: () => T, ...args: functions.ArgList): Promise<T | undefined>;
  warn<T>(
    message: T extends functions.GenericFunction ? never : T,
    ...args: functions.ArgList
  ): Promise<T>;
  warn<T>(
    message: (T extends functions.GenericFunction ? never : T) | (() => T),
    ...args: functions.ArgList
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Warning, message, ...args);
  }

  error<T>(
    message: () => T,
    ...args: functions.ArgList
  ): Promise<T | undefined>;
  error<T>(
    message: T extends functions.GenericFunction ? never : T,
    ...args: functions.ArgList
  ): Promise<T>;
  error<T>(
    message: (T extends functions.GenericFunction ? never : T) | (() => T),
    ...args: functions.ArgList
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Error, message, ...args);
  }

  critical<T>(
    message: () => T,
    ...args: functions.ArgList
  ): Promise<T | undefined>;
  critical<T>(
    message: T extends functions.GenericFunction ? never : T,
    ...args: functions.ArgList
  ): Promise<T>;
  critical<T>(
    message: (T extends functions.GenericFunction ? never : T) | (() => T),
    ...args: functions.ArgList
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Critical, message, ...args);
  }
};

export const current = new Logger(
  "default",
  runtime.current.getStdout(),
  DEFAULT_LEVEL,
);
