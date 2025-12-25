// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as logging from "@eser/standards/logging";
import {
  createLoggerState,
  DEFAULT_LEVEL,
  Logger,
  type LogRecord,
} from "./logger.ts";
import * as formatters from "./formatters.ts";

// Helper to create a writable stream that captures output
function createTestStream(): {
  stream: WritableStream<Uint8Array>;
  output: string[];
} {
  const output: string[] = [];
  const stream = new WritableStream<Uint8Array>({
    write(chunk) {
      const text = new TextDecoder().decode(chunk);
      output.push(text);
    },
  });
  return { stream, output };
}

Deno.test("createLoggerState() creates valid initial state", () => {
  const { stream } = createTestStream();
  const state = createLoggerState("test-logger", stream);

  assert.assertEquals(state.loggerName, "test-logger");
  assert.assertEquals(state.targetStream, stream);
  assert.assertEquals(state.loglevel, DEFAULT_LEVEL);
  assert.assertEquals(state.formatter, formatters.jsonFormatter);
  assert.assertInstanceOf(state.encoder, TextEncoder);
});

Deno.test("createLoggerState() with custom log level and formatter", () => {
  const { stream } = createTestStream();
  const customFormatter = (record: LogRecord) => `CUSTOM: ${record.message}`;

  const state = createLoggerState(
    "custom-logger",
    stream,
    logging.Severities.Error,
    customFormatter,
  );

  assert.assertEquals(state.loggerName, "custom-logger");
  assert.assertEquals(state.loglevel, logging.Severities.Error);
  assert.assertEquals(state.formatter, customFormatter);
});

Deno.test("Logger constructor initializes with state", () => {
  const { stream } = createTestStream();
  const state = createLoggerState("test-logger", stream);
  const logger = new Logger(state);

  assert.assertEquals(logger.state, state);
});

Deno.test("Logger.log() logs message when level is sufficient", async () => {
  const { stream, output } = createTestStream();
  const state = createLoggerState(
    "test-logger",
    stream,
    logging.Severities.Debug,
  );
  const logger = new Logger(state);

  const result = await logger.log(logging.Severities.Info, "test message");

  assert.assertEquals(result, "test message");
  assert.assertEquals(output.length, 1);
  assert.assert(output[0]!.includes("test message"));
});

Deno.test("Logger.log() skips logging when level is insufficient", async () => {
  const { stream, output } = createTestStream();
  const state = createLoggerState(
    "test-logger",
    stream,
    logging.Severities.Error,
  );
  const logger = new Logger(state);

  const result = await logger.log(logging.Severities.Info, "test message");

  assert.assertEquals(result, "test message");
  assert.assertEquals(output.length, 0);
});

Deno.test("Logger.log() with function message calls function only when logging", async () => {
  const { stream, output } = createTestStream();
  const state = createLoggerState(
    "test-logger",
    stream,
    logging.Severities.Info,
  );
  const logger = new Logger(state);

  let called = false;
  const messageFunction = () => {
    called = true;
    return "function result";
  };

  const result = await logger.log(logging.Severities.Info, messageFunction);

  assert.assertEquals(result, "function result");
  assert.assertEquals(called, true);
  assert.assertEquals(output.length, 1);
  assert.assert(output[0]!.includes("function result"));
});

Deno.test("Logger.log() with function message skips function when level insufficient", async () => {
  const { stream, output } = createTestStream();
  const state = createLoggerState(
    "test-logger",
    stream,
    logging.Severities.Error,
  );
  const logger = new Logger(state);

  let called = false;
  const messageFunction = () => {
    called = true;
    return "function result";
  };

  const result = await logger.log(logging.Severities.Info, messageFunction);

  assert.assertEquals(result, undefined);
  assert.assertEquals(called, false);
  assert.assertEquals(output.length, 0);
});

Deno.test("Logger.log() with additional arguments", async () => {
  const { stream, output } = createTestStream();
  const state = createLoggerState(
    "test-logger",
    stream,
    logging.Severities.Debug,
  );
  const logger = new Logger(state);

  await logger.log(logging.Severities.Info, "test message", "arg1", 42, {
    key: "value",
  });

  assert.assertEquals(output.length, 1);
  const loggedData = JSON.parse(output[0]!);
  assert.assertEquals(loggedData.message, "test message");
  assert.assertEquals(loggedData.args, ["arg1", 42, { key: "value" }]);
});

Deno.test("Logger convenience methods work correctly", async () => {
  const { stream, output } = createTestStream();
  const state = createLoggerState(
    "test-logger",
    stream,
    logging.Severities.Debug,
  );
  const logger = new Logger(state);

  await logger.debug("debug message");
  await logger.info("info message");
  await logger.warn("warn message");
  await logger.error("error message");
  await logger.critical("critical message");

  assert.assertEquals(output.length, 5);
  assert.assert(output[0]!.includes("debug message"));
  assert.assert(output[1]!.includes("info message"));
  assert.assert(output[2]!.includes("warn message"));
  assert.assert(output[3]!.includes("error message"));
  assert.assert(output[4]!.includes("critical message"));
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
    const { stream } = createTestStream();
    const state = createLoggerState("test-logger", stream);
    const logger = new Logger(state);
    assert.assertEquals(logger.asString(input), expected);
  });
}

Deno.test("Logger creates proper LogRecord", async () => {
  const { stream, output } = createTestStream();
  const customFormatter = (record: LogRecord) => {
    // Verify record structure
    assert.assertEquals(record.loggerName, "test-logger");
    assert.assertEquals(record.message, "test message");
    assert.assertEquals(record.severity, logging.Severities.Info);
    assert.assertInstanceOf(record.datetime, Date);
    assert.assertEquals(record.args, ["arg1", 42]);

    return JSON.stringify(record);
  };

  const state = createLoggerState(
    "test-logger",
    stream,
    logging.Severities.Debug,
    customFormatter,
  );
  const logger = new Logger(state);

  await logger.log(logging.Severities.Info, "test message", "arg1", 42);

  assert.assertEquals(output.length, 1);
});

Deno.test("Default log level is Info", () => {
  assert.assertEquals(DEFAULT_LEVEL, logging.Severities.Info);
});

Deno.test("Logger handles non-string messages correctly", async () => {
  const { stream, output } = createTestStream();
  const state = createLoggerState(
    "test-logger",
    stream,
    logging.Severities.Debug,
  );
  const logger = new Logger(state);

  await logger.log(logging.Severities.Info, 42);
  await logger.log(logging.Severities.Info, { key: "value" });
  await logger.log(logging.Severities.Info, [1, 2, 3]);

  assert.assertEquals(output.length, 3);

  const log1 = JSON.parse(output[0]!);
  const log2 = JSON.parse(output[1]!);
  const log3 = JSON.parse(output[2]!);

  assert.assertEquals(log1.message, "42");
  assert.assertEquals(log2.message, '{"key":"value"}');
  assert.assertEquals(log3.message, "[1,2,3]");
});
