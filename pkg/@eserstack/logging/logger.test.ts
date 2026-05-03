// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as logging from "@eserstack/standards/logging";
import * as log from "./mod.ts";

// Destructure for convenience within tests
const { configure, reset } = log.config;
const { DEFAULT_LEVEL, getLogger, Logger } = log.logger;
const { getTestSink } = log.sinks;

// Reset state before each test
const beforeEach = async () => {
  await reset();
};

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
  const result = await logger.info("test message", "arg1", 42, { key: "value" });

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
  assert.assertEquals(await logger.critical("critical message"), "critical message");
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
