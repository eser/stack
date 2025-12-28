// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as logging from "@eser/standards/logging";
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
  const { sink, records } = getTestSink();

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

  await loggerWithProps.info("test message");

  assert.assertEquals(records.length, 1);
  assert.assertEquals(records[0]!.properties["requestId"], "abc-123");
});

Deno.test("Logger.log() sends to configured sinks", async () => {
  await beforeEach();
  const { sink, records } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    }],
  });

  const logger = getLogger(["app"]);
  await logger.info("test message");

  assert.assertEquals(records.length, 1);
  assert.assertEquals(records[0]!.message, "test message");
  assert.assertEquals(records[0]!.severity, logging.Severities.Info);
  assert.assertEquals(records[0]!.category, ["app"]);
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
  const { sink, records } = getTestSink();

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
  assert.assertEquals(records.length, 1);
  assert.assertEquals(records[0]!.message, "function result");
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
  const { sink, records } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    }],
  });

  const logger = getLogger(["app"]);
  await logger.info("test message", "arg1", 42, { key: "value" });

  assert.assertEquals(records.length, 1);
  assert.assertEquals(records[0]!.message, "test message");
  assert.assertEquals(records[0]!.args, ["arg1", 42, { key: "value" }]);
});

Deno.test("Logger convenience methods work correctly", async () => {
  await beforeEach();
  const { sink, records } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    }],
  });

  const logger = getLogger(["app"]);

  await logger.debug("debug message");
  await logger.info("info message");
  await logger.warn("warn message");
  await logger.error("error message");
  await logger.critical("critical message");

  assert.assertEquals(records.length, 5);
  assert.assertEquals(records[0]!.message, "debug message");
  assert.assertEquals(records[0]!.severity, logging.Severities.Debug);
  assert.assertEquals(records[1]!.message, "info message");
  assert.assertEquals(records[1]!.severity, logging.Severities.Info);
  assert.assertEquals(records[2]!.message, "warn message");
  assert.assertEquals(records[2]!.severity, logging.Severities.Warning);
  assert.assertEquals(records[3]!.message, "error message");
  assert.assertEquals(records[3]!.severity, logging.Severities.Error);
  assert.assertEquals(records[4]!.message, "critical message");
  assert.assertEquals(records[4]!.severity, logging.Severities.Critical);
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
  const { sink, records } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["test-logger"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    }],
  });

  const logger = getLogger(["test-logger"]);
  await logger.info("test message", "arg1", 42);

  assert.assertEquals(records.length, 1);
  const record = records[0]!;

  assert.assertEquals(record.category, ["test-logger"]);
  assert.assertEquals(record.message, "test message");
  assert.assertEquals(record.severity, logging.Severities.Info);
  assert.assertInstanceOf(record.datetime, Date);
  assert.assertEquals(record.args, ["arg1", 42]);
});

Deno.test("Default log level is Info", () => {
  assert.assertEquals(DEFAULT_LEVEL, logging.Severities.Info);
});

Deno.test("Logger handles non-string messages correctly", async () => {
  await beforeEach();
  const { sink, records } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    }],
  });

  const logger = getLogger(["app"]);

  await logger.info(42);
  await logger.info({ key: "value" });
  await logger.info([1, 2, 3]);

  assert.assertEquals(records.length, 3);
  assert.assertEquals(records[0]!.message, "42");
  assert.assertEquals(records[1]!.message, '{"key":"value"}');
  assert.assertEquals(records[2]!.message, "[1,2,3]");
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
  const { sink, records } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    }],
  });

  const logger = getLogger(["app", "http", "handler"]);
  await logger.info("child message");

  assert.assertEquals(records.length, 1);
  assert.assertEquals(records[0]!.category, ["app", "http", "handler"]);
});

Deno.test("Logger RFC 5424 severity levels", async () => {
  await beforeEach();
  const { sink, records } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{
      category: ["app"],
      sinks: ["test"],
      lowestLevel: logging.Severities.Debug,
    }],
  });

  const logger = getLogger(["app"]);

  await logger.emergency("emergency");
  await logger.alert("alert");
  await logger.critical("critical");
  await logger.error("error");
  await logger.warn("warning");
  await logger.notice("notice");
  await logger.info("info");
  await logger.debug("debug");

  assert.assertEquals(records.length, 8);
  assert.assertEquals(records[0]!.severity, logging.Severities.Emergency);
  assert.assertEquals(records[1]!.severity, logging.Severities.Alert);
  assert.assertEquals(records[2]!.severity, logging.Severities.Critical);
  assert.assertEquals(records[3]!.severity, logging.Severities.Error);
  assert.assertEquals(records[4]!.severity, logging.Severities.Warning);
  assert.assertEquals(records[5]!.severity, logging.Severities.Notice);
  assert.assertEquals(records[6]!.severity, logging.Severities.Info);
  assert.assertEquals(records[7]!.severity, logging.Severities.Debug);
});
