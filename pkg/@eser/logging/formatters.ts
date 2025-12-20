// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// This file contains code from deno std lib (https://github.com/denoland/deno_std),
// which is a standard library, licensed under the MIT license.

// Copyright (c) 2023-2024 Eser Ozvataf and other contributors
// Copyright (c) 2021-2023 the Deno authors

import * as logging from "@eser/standards/logging";
import * as functions from "@eser/standards/functions";
import * as logger from "./logger.ts";

export type FormatterFn = (logRecord: logger.LogRecord) => string;

// deno-lint-ignore no-explicit-any
const flattenArgs = (args: functions.ArgList<any>): unknown => {
  if (args.length > 1) {
    return args;
  }

  return args[0];
};

export const jsonFormatter: FormatterFn = (
  logRecord: logger.LogRecord,
): string => {
  return `${
    JSON.stringify({
      level: logging.SeverityNames[logRecord.severity],
      datetime: logRecord.datetime.getTime(),
      message: logRecord.message,
      args: flattenArgs(logRecord.args),
    })
  }\n`;
};
