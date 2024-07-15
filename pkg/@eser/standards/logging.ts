// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as functions from "./functions.ts";

// taken from RFC5424 (see: https://datatracker.ietf.org/doc/html/rfc5424#section-6.2.1)
export const Severities = {
  Emergency: 0, // system is unusable
  Alert: 1, // action must be taken immediately
  Critical: 2, // critical conditions
  Error: 3, // error conditions
  Warning: 4, // warning conditions
  Notice: 5, // normal but significant condition
  Info: 6, // informational messages
  Debug: 7, // debug-level messages
} as const;

export type SeverityKey = Exclude<keyof typeof Severities, number>;
export type Severity = typeof Severities[SeverityKey];

export const SeverityNames = {
  [Severities.Emergency]: "Emergency",
  [Severities.Alert]: "Alert",
  [Severities.Critical]: "Critical",
  [Severities.Error]: "Error",
  [Severities.Warning]: "Warning",
  [Severities.Notice]: "Notice",
  [Severities.Info]: "Info",
  [Severities.Debug]: "Debug",
} as const;

export interface Logger {
  log<T>(
    severity: Severity,
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined>;
}
