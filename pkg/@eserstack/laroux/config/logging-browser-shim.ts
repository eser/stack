// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * The browser shim for `@eserstack/logging`.
 *
 * `@eserstack/logging` writes through a native library that a browser cannot
 * load, so laroux client bundles replace it with this module (see
 * `DEFAULT_BROWSER_SHIMS`). The shim keeps the package's logger API, so client
 * code logs the way server code does, `logger.with(...)` included:
 *
 * - `logger.getLogger(category)` returns a logger with `log()`, `trace()`,
 *   `debug()`, `info()`, `notice()`, `warn()`, `error()`, `critical()`,
 *   `alert()`, `emergency()`, `with()` and `getChild()`.
 * - Records at `Warning` and above go to the browser console; lower ones are
 *   dropped.
 * - `config.configure()` takes the package's options (`sinks`, `filters` and
 *   `loggers` with `category`, `lowestLevel`, `sinks`, `parentSinks` and
 *   `filters`) to change the level or send records to other sinks. A logger
 *   whose configuration names no sink still writes to the console.
 * - `Severities` and `SeverityNames` match the package's.
 *
 * The package's `context`, `sinks`, `filters`, `formatters` and `tracer`
 * modules are not part of the shim.
 *
 * @module
 */

/**
 * JavaScript source of the shim. The bundler loads it in place of
 * `@eserstack/logging`, so it is plain JavaScript without imports.
 */
export const LOGGING_BROWSER_SHIM: string = `
// Browser shim for @eserstack/logging (laroux client bundles).

export const Severities = Object.freeze({
  Trace: 1,
  Debug: 5,
  Info: 9,
  Notice: 10,
  Warning: 13,
  Error: 17,
  Critical: 21,
  Alert: 22,
  Emergency: 23,
});

export const SeverityNames = Object.freeze({
  1: "Trace",
  5: "Debug",
  9: "Info",
  10: "Notice",
  13: "Warning",
  17: "Error",
  21: "Critical",
  22: "Alert",
  23: "Emergency",
});

// Without configuration, only warnings and more severe records are written.
const DEFAULT_LEVEL = Severities.Warning;

const normalizeCategory = (value) =>
  typeof value === "string"
    ? value.split(".").filter((part) => part !== "")
    : [...value];

const categoryKey = (category) => category.join(".");

const isAncestorOrSelf = (ancestor, category) =>
  ancestor.length <= category.length &&
  ancestor.every((part, index) => category[index] === part);

const consoleMethod = (severity) => {
  if (severity >= Severities.Error) {
    return "error";
  }
  if (severity >= Severities.Warning) {
    return "warn";
  }
  if (severity >= Severities.Info) {
    return "info";
  }
  return "debug";
};

// Writes "[category] message", then the logger's properties and the call's
// extra arguments as one object when there are any.
const consoleSink = (record) => {
  const line = "[" + categoryKey(record.category) + "] " + record.message;
  const attributes = { ...record.properties };
  if (record.args.length > 0) {
    attributes.args = record.args;
  }
  const write = globalThis.console[consoleMethod(record.severity)];
  if (Object.keys(attributes).length > 0) {
    write(line, attributes);
  } else {
    write(line);
  }
};

// A logging fault must not break the page, so it is reported, not thrown.
const reportLoggingFault = (error) => {
  globalThis.console.error("[eserstack/logging] writing a log record failed", error);
};

const toText = (value) => {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return value.stack ?? value.name + ": " + value.message;
  }
  if (value === null || typeof value !== "object") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

let registry = null;
const resolvedConfigs = new Map();

// The level, sinks and filters for a category: the most specific configured
// level, and the sinks and filters of every matching configuration up to one
// with parentSinks "override".
const resolveConfig = (category) => {
  const key = categoryKey(category);
  const cached = resolvedConfigs.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let lowestLevel = DEFAULT_LEVEL;
  const sinks = [];
  const filters = [];

  if (registry !== null) {
    const matches = registry.loggers
      .filter((entry) => isAncestorOrSelf(entry.category, category))
      .sort((a, b) => b.category.length - a.category.length);
    const levelEntry = matches.find((entry) => entry.lowestLevel !== undefined);
    if (levelEntry !== undefined) {
      lowestLevel = levelEntry.lowestLevel;
    }

    const sinkNames = new Set();
    const filterNames = new Set();
    for (const entry of matches) {
      for (const name of entry.filters ?? []) {
        filterNames.add(name);
      }
      if (entry.sinks !== undefined && entry.sinks.length > 0) {
        for (const name of entry.sinks) {
          sinkNames.add(name);
        }
        if (entry.parentSinks === "override") {
          break;
        }
      }
    }
    for (const name of sinkNames) {
      const sink = registry.sinks.get(name);
      if (sink !== undefined) {
        sinks.push(sink);
      }
    }
    for (const name of filterNames) {
      const filter = registry.filters.get(name);
      if (filter !== undefined) {
        filters.push(filter);
      }
    }
  }

  const resolved = {
    lowestLevel,
    sinks: sinks.length > 0 ? sinks : [consoleSink],
    filters,
  };
  resolvedConfigs.set(key, resolved);
  return resolved;
};

const createLogger = (category, parent, properties) => {
  const log = async (severity, message, ...args) => {
    const resolved = resolveConfig(category);
    if (severity < resolved.lowestLevel) {
      return typeof message === "function" ? undefined : message;
    }

    const value = typeof message === "function" ? message() : message;
    try {
      const text = toText(value);
      const record = {
        message: text,
        rawMessage: text,
        args,
        datetime: new Date(),
        severity,
        category,
        properties,
        context: {},
      };
      if (resolved.filters.every((filter) => filter(record))) {
        await Promise.all(
          resolved.sinks.map(async (sink) => {
            try {
              await sink(record);
            } catch (error) {
              reportLoggingFault(error);
            }
          }),
        );
      }
    } catch (error) {
      reportLoggingFault(error);
    }
    return value;
  };

  const logger = {
    category,
    parent,
    log,
    trace: (message, ...args) => log(Severities.Trace, message, ...args),
    debug: (message, ...args) => log(Severities.Debug, message, ...args),
    info: (message, ...args) => log(Severities.Info, message, ...args),
    notice: (message, ...args) => log(Severities.Notice, message, ...args),
    warn: (message, ...args) => log(Severities.Warning, message, ...args),
    error: (message, ...args) => log(Severities.Error, message, ...args),
    critical: (message, ...args) => log(Severities.Critical, message, ...args),
    alert: (message, ...args) => log(Severities.Alert, message, ...args),
    emergency: (message, ...args) =>
      log(Severities.Emergency, message, ...args),
    with: (extra) => createLogger(category, parent, { ...properties, ...extra }),
    getChild: (subcategory) =>
      createLogger(
        [...category, ...normalizeCategory(subcategory)],
        logger,
        properties,
      ),
  };
  return logger;
};

const loggers = new Map();

const getLogger = (category) => {
  const normalized = normalizeCategory(category);
  const key = categoryKey(normalized);
  let existing = loggers.get(key);
  if (existing === undefined) {
    existing = createLogger(normalized, null, {});
    loggers.set(key, existing);
  }
  return existing;
};

export const logger = Object.freeze({
  DEFAULT_LEVEL,
  getLogger,
  clearLoggerCache: () => {
    loggers.clear();
  },
});

export const config = Object.freeze({
  configure: (options) => {
    registry = {
      sinks: new Map(Object.entries(options.sinks ?? {})),
      filters: new Map(Object.entries(options.filters ?? {})),
      loggers: (options.loggers ?? []).map((entry) => ({
        ...entry,
        category: normalizeCategory(entry.category),
      })),
    };
    resolvedConfigs.clear();
    return Promise.resolve();
  },
  reset: () => {
    registry = null;
    resolvedConfigs.clear();
    return Promise.resolve();
  },
  isConfigured: () => registry !== null,
});
`;
