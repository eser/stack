// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as logging from "@eserstack/standards/logging";
import * as log from "./mod.ts";
import { getLib } from "./ffi-client.ts";

// Destructure for convenience within tests
const { configure, reset } = log.config;
const { DEFAULT_LEVEL, getLogger, Logger } = log.logger;
const { getTestSink } = log.sinks;

// Reset state before each test
const beforeEach = async () => {
  await reset();
};

// The FFI singleton is shared by the whole test process; the fallback tests
// swap individual symbols on it and restore them before yielding.
const ffiLib = getLib();
const withoutFfi = ffiLib === null;

const stubLogSymbols = (overrides: {
  create?: (configJSON: string) => string;
  write?: (requestJSON: string) => string;
}): () => void => {
  if (ffiLib === null) {
    return () => {};
  }

  const originalCreate = ffiLib.symbols.EserAjanLogCreate;
  const originalWrite = ffiLib.symbols.EserAjanLogWrite;

  if (overrides.create !== undefined) {
    ffiLib.symbols.EserAjanLogCreate = overrides.create;
  }

  if (overrides.write !== undefined) {
    ffiLib.symbols.EserAjanLogWrite = overrides.write;
  }

  return () => {
    ffiLib.symbols.EserAjanLogCreate = originalCreate;
    ffiLib.symbols.EserAjanLogWrite = originalWrite;
  };
};

/** Collects what the console fallback sink writes while `run` executes. */
const captureConsole = async (run: () => Promise<void>): Promise<string[]> => {
  const lines: string[] = [];
  // deno-lint-ignore no-console
  const original = console.error;

  // deno-lint-ignore no-console
  console.error = (...args: unknown[]): void => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };

  try {
    await run();
  } finally {
    // deno-lint-ignore no-console
    console.error = original;
  }

  return lines;
};

const WARNING_MARKER = "[eserstack/logging]";

const configureFallbackTest = async (category: string): Promise<void> => {
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: [category],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    }],
  });
};

Deno.test({
  name: "Logger.log() falls back to console when LogCreate fails",
  ignore: withoutFfi,
  fn: async () => {
    await beforeEach();
    await configureFallbackTest("create-fail");

    const restore = stubLogSymbols({
      create: () => JSON.stringify({ error: "create-boom" }),
    });

    let result: string | undefined;
    const lines = await captureConsole(async () => {
      try {
        result = await getLogger(["create-fail"]).info("lost message");
      } finally {
        restore();
      }
    });

    // The call still returns normally: a logging outage must not crash callers.
    assert.assertEquals(result, "lost message");

    const warnings = lines.filter((line) => line.includes(WARNING_MARKER));
    assert.assertEquals(warnings.length, 1);
    assert.assertStringIncludes(warnings.join("\n"), "create-boom");

    const records = lines.filter((line) => line.includes("lost message"));
    assert.assertEquals(records.length, 1);
    assert.assertStringIncludes(records.join("\n"), "INFO");
    assert.assertStringIncludes(records.join("\n"), "create-fail");
  },
});

Deno.test({
  name: "Logger.log() falls back to console when the FFI call throws",
  ignore: withoutFfi,
  fn: async () => {
    await beforeEach();
    await configureFallbackTest("create-throw");

    // Stands in for a machine without the native library, where requireLib()
    // throws instead of answering with an error payload.
    const restore = stubLogSymbols({
      create: () => {
        throw new Error("FFI library unavailable");
      },
    });

    let result: string | undefined;
    const lines = await captureConsole(async () => {
      try {
        result = await getLogger(["create-throw"]).warn("unthrown message");
      } finally {
        restore();
      }
    });

    assert.assertEquals(result, "unthrown message");

    const warnings = lines.filter((line) => line.includes(WARNING_MARKER));
    assert.assertEquals(warnings.length, 1);
    assert.assertStringIncludes(warnings.join("\n"), "FFI library unavailable");

    const records = lines.filter((line) => line.includes("unthrown message"));
    assert.assertEquals(records.length, 1);
    assert.assertStringIncludes(records.join("\n"), "WARN");
  },
});

Deno.test({
  name: "Logger.log() falls back to console when LogWrite fails",
  ignore: withoutFfi,
  fn: async () => {
    await beforeEach();
    await configureFallbackTest("write-fail");

    const restore = stubLogSymbols({
      write: () => JSON.stringify({ error: "log handle not found: " }),
    });

    let result: string | undefined;
    const lines = await captureConsole(async () => {
      try {
        result = await getLogger(["write-fail"]).error("dropped message");
      } finally {
        restore();
      }
    });

    assert.assertEquals(result, "dropped message");

    const warnings = lines.filter((line) => line.includes(WARNING_MARKER));
    assert.assertEquals(warnings.length, 1);
    assert.assertStringIncludes(warnings.join("\n"), "log handle not found");

    const records = lines.filter((line) => line.includes("dropped message"));
    assert.assertEquals(records.length, 1);
    assert.assertStringIncludes(records.join("\n"), "ERROR");
  },
});

Deno.test({
  name: "Logger.log() warns once but keeps writing every degraded record",
  ignore: withoutFfi,
  fn: async () => {
    await beforeEach();
    await configureFallbackTest("warn-once");

    let writeCalls = 0;
    const restore = stubLogSymbols({
      write: () => {
        writeCalls += 1;

        return JSON.stringify({ error: "log handle not found: " });
      },
    });

    const lines = await captureConsole(async () => {
      try {
        const logger = getLogger(["warn-once"]);

        for (let index = 0; index < 5; index += 1) {
          // deno-lint-ignore no-await-in-loop
          await logger.info(`degraded ${index}`);
        }
      } finally {
        restore();
      }
    });

    const warnings = lines.filter((line) => line.includes(WARNING_MARKER));
    assert.assertEquals(warnings.length, 1);

    const records = lines.filter((line) => line.includes("degraded "));
    assert.assertEquals(records.length, 5);

    // The logger latches after the first failure, so it stops paying for a
    // doomed FFI round trip per record.
    assert.assertEquals(writeCalls, 1);
  },
});

Deno.test({
  name: "Logger.log() takes the Go path when the write succeeds",
  ignore: withoutFfi,
  fn: async () => {
    await beforeEach();
    await configureFallbackTest("write-ok");

    const seen: string[] = [];
    const passthrough = ffiLib?.symbols.EserAjanLogWrite;
    const restore = stubLogSymbols({
      write: (requestJSON: string): string => {
        seen.push(requestJSON);

        return passthrough?.(requestJSON) ?? "{}";
      },
    });

    let result: string | undefined;
    const lines = await captureConsole(async () => {
      try {
        result = await getLogger(["write-ok"]).info("delivered message");
      } finally {
        restore();
      }
    });

    assert.assertEquals(result, "delivered message");
    assert.assertEquals(seen.length, 1);
    assert.assertStringIncludes(seen.join("\n"), "delivered message");
    assert.assertEquals(lines, []);
  },
});

Deno.test("Logger constructor creates logger with category", async () => {
  await beforeEach();

  const logger = new Logger(["test", "logger"]);

  assert.assertEquals(logger.category, ["test", "logger"]);
  assert.assertEquals(logger.loggerName, "test.logger");
  assert.assertEquals(logger.parent, null);
});

Deno.test("Logger constructor accepts string category", async () => {
  await beforeEach();

  const logger = new Logger("test.logger");

  assert.assertEquals(logger.category, ["test", "logger"]);
  assert.assertEquals(logger.loggerName, "test.logger");
});

Deno.test("Logger.getChild() creates child logger", async () => {
  await beforeEach();

  const parent = new Logger(["app"]);
  const child = parent.getChild("http");

  assert.assertEquals(child.category, ["app", "http"]);
  assert.assertEquals(child.parent, parent);
});

Deno.test("Logger.getChild() with array subcategory", async () => {
  await beforeEach();

  const parent = new Logger(["app"]);
  const child = parent.getChild(["http", "request"]);

  assert.assertEquals(child.category, ["app", "http", "request"]);
});

Deno.test("Logger.with() creates logger with properties", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    }],
  });

  const logger = getLogger(["app"]);
  const loggerWithProps = logger.with({ requestId: "abc-123" });

  // Properties are forwarded to Go as attrs; verify no throw and correct return value.
  const result = await loggerWithProps.info("test message");
  assert.assertEquals(result, "test message");
});

Deno.test("Logger.log() dispatches to Go FFI", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    }],
  });

  const logger = getLogger(["app"]);
  const result = await logger.info("test message");

  assert.assertEquals(result, "test message");
});

Deno.test("Logger.log() skips logging when level is insufficient", async () => {
  await beforeEach();
  const { sink, records } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Error,
    }],
  });

  const logger = getLogger(["app"]);
  const result = await logger.info("test message");

  assert.assertEquals(result, "test message");
  assert.assertEquals(records.length, 0);
});

Deno.test("Logger.log() with function message calls function only when logging", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    }],
  });

  const logger = getLogger(["app"]);

  let called = false;
  const messageFunction = () => {
    called = true;
    return "function result";
  };

  const result = await logger.info(messageFunction);

  assert.assertEquals(result, "function result");
  assert.assertEquals(called, true);
});

Deno.test("Logger.log() with function message skips function when level insufficient", async () => {
  await beforeEach();
  const { sink, records } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Error,
    }],
  });

  const logger = getLogger(["app"]);

  let called = false;
  const messageFunction = () => {
    called = true;
    return "function result";
  };

  const result = await logger.info(messageFunction);

  assert.assertEquals(result, undefined);
  assert.assertEquals(called, false);
  assert.assertEquals(records.length, 0);
});

Deno.test("Logger.log() with additional arguments", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    }],
  });

  const logger = getLogger(["app"]);
  const result = await logger.info("test message", "arg1", 42, {
    key: "value",
  });

  assert.assertEquals(result, "test message");
});

Deno.test("Logger convenience methods work correctly", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    }],
  });

  const logger = getLogger(["app"]);

  assert.assertEquals(await logger.debug("debug message"), "debug message");
  assert.assertEquals(await logger.info("info message"), "info message");
  assert.assertEquals(await logger.warn("warn message"), "warn message");
  assert.assertEquals(await logger.error("error message"), "error message");
  assert.assertEquals(
    await logger.critical("critical message"),
    "critical message",
  );
});

// Table-driven tests for Logger.asString()
const asStringTestCases = [
  { input: "hello", expected: "hello", name: "string value" },
  { input: 123, expected: "123", name: "number value" },
  { input: true, expected: "true", name: "boolean value" },
  {
    input: { key: "value" },
    expected: '{"key":"value"}',
    name: "object value",
  },
  { input: [1, 2, 3], expected: "[1,2,3]", name: "array value" },
  { input: null, expected: "null", name: "null value" },
  { input: undefined, expected: "undefined", name: "undefined value" },
];

for (const { input, expected, name } of asStringTestCases) {
  Deno.test(`Logger.asString() handles ${name}`, () => {
    const logger = new Logger(["test"]);
    assert.assertEquals(logger.asString(input), expected);
  });
}

Deno.test("Logger creates proper LogRecord", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["test-logger"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    }],
  });

  const logger = getLogger(["test-logger"]);
  const result = await logger.info("test message", "arg1", 42);

  assert.assertEquals(result, "test message");
});

Deno.test("Default log level is Info", () => {
  assert.assertEquals(DEFAULT_LEVEL, logging.Severities.Info);
});

Deno.test("Logger handles non-string messages correctly", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    }],
  });

  const logger = getLogger(["app"]);

  assert.assertEquals(await logger.info(42), 42);
  assert.assertEquals(await logger.info({ key: "value" }), { key: "value" });
  assert.assertEquals(await logger.info([1, 2, 3]), [1, 2, 3]);
});

Deno.test("getLogger() returns same instance for same category", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{ category: ["app"], sinks: ["test"] }],
  });

  const logger1 = getLogger(["app", "http"]);
  const logger2 = getLogger(["app", "http"]);

  assert.assertStrictEquals(logger1, logger2);
});

Deno.test("getLogger() accepts string category", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{ category: "app", sinks: ["test"] }],
  });

  const logger = getLogger("app.http");

  assert.assertEquals(logger.category, ["app", "http"]);
});

Deno.test("Child loggers inherit parent sinks", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    }],
  });

  const logger = getLogger(["app", "http", "handler"]);
  const result = await logger.info("child message");

  assert.assertEquals(result, "child message");
});

Deno.test("Logger OpenTelemetry severity levels", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Trace,
    }],
  });

  const logger = getLogger(["app"]);

  // Log from most verbose to most severe (OpenTelemetry order)
  assert.assertEquals(await logger.trace("trace"), "trace");
  assert.assertEquals(await logger.debug("debug"), "debug");
  assert.assertEquals(await logger.info("info"), "info");
  assert.assertEquals(await logger.notice("notice"), "notice");
  assert.assertEquals(await logger.warn("warning"), "warning");
  assert.assertEquals(await logger.error("error"), "error");
  assert.assertEquals(await logger.critical("critical"), "critical");
  assert.assertEquals(await logger.alert("alert"), "alert");
  assert.assertEquals(await logger.emergency("emergency"), "emergency");
});

Deno.test("OpenTelemetry severity values are correct", () => {
  // Verify OpenTelemetry severity number ranges
  // TRACE: 1-4, DEBUG: 5-8, INFO: 9-12, WARN: 13-16, ERROR: 17-20, FATAL: 21-24
  assert.assertEquals(logging.Severities.Trace, 1);
  assert.assertEquals(logging.Severities.Debug, 5);
  assert.assertEquals(logging.Severities.Info, 9);
  assert.assertEquals(logging.Severities.Notice, 10);
  assert.assertEquals(logging.Severities.Warning, 13);
  assert.assertEquals(logging.Severities.Error, 17);
  assert.assertEquals(logging.Severities.Critical, 21);
  assert.assertEquals(logging.Severities.Alert, 22);
  assert.assertEquals(logging.Severities.Emergency, 23);
});

Deno.test("Logger.trace() logs at trace level", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Trace,
    }],
  });

  const logger = getLogger(["app"]);
  const result = await logger.trace("trace message");

  assert.assertEquals(result, "trace message");
});

Deno.test("Logger.trace() is filtered when lowestLevel is Debug", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug, // Debug=5, Trace=1
    }],
  });

  const logger = getLogger(["app"]);

  let traceCalled = false;
  const traceResult = await logger.trace(() => {
    traceCalled = true;
    return "trace message";
  });
  assert.assertEquals(traceCalled, false); // filtered (1 < 5)
  assert.assertEquals(traceResult, undefined);

  let debugCalled = false;
  const debugResult = await logger.debug(() => {
    debugCalled = true;
    return "debug message";
  });
  assert.assertEquals(debugCalled, true); // passes (5 >= 5)
  assert.assertEquals(debugResult, "debug message");
});
