// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as logging from "@eserstack/standards/logging";
import * as log from "./mod.ts";
import * as ffiClient from "./ffi-client.ts";

// Destructure for convenience within tests
const { configure, reset } = log.config;
const { DEFAULT_LEVEL, getLogger, Logger } = log.logger;
const { getTestSink } = log.sinks;

// Reset state before each test
const beforeEach = async () => {
  await reset();
};

// Importing the package loads nothing, so this test module opens the bridge
// before registering tests: the `skip` flags below need to know whether it
// loaded, and the load stays outside every test body.
// oxlint-disable-next-line node/no-top-level-await
await ffiClient.ensureLib();

// The FFI singleton is shared by the whole test process; the fallback tests
// answer individual names on it and restore it before yielding.
const ffiLib = ffiClient.getLib();
const withoutFfi = ffiLib === null;

/** The shared library's `call`, as the stubs below swap it. */
type AnyCall = (name: string, request?: unknown) => unknown;

const mutableLib = ffiLib as unknown as { call: AnyCall } | null;
const realCall: AnyCall | undefined = mutableLib?.call;

/** The real logWrite, answering its JSON text, for stubs that pass through. */
const passthroughWrite = (request: unknown): string =>
  JSON.stringify(realCall?.("logWrite", request) ?? {});

/**
 * Answers logCreate and logWrite with the JSON text the overrides return,
 * until the returned function restores the library. The overrides receive the
 * request as the logger passed it.
 */
const stubLogSymbols = (overrides: {
  create?: (request: unknown) => string;
  write?: (request: unknown) => string;
}): (() => void) => {
  if (mutableLib === null || realCall === undefined) {
    return () => {};
  }

  mutableLib.call = (name, request) => {
    if (name === "logCreate" && overrides.create !== undefined) {
      return JSON.parse(overrides.create(request));
    }

    if (name === "logWrite" && overrides.write !== undefined) {
      return JSON.parse(overrides.write(request));
    }

    return realCall(name, request);
  };

  return () => {
    mutableLib.call = realCall;
  };
};

/** Collects what the console fallback sink writes while `run` executes. */
const captureConsole = async (run: () => Promise<void>): Promise<string[]> => {
  const lines: string[] = [];
  // oxlint-disable-next-line no-console
  const original = console.error;

  // oxlint-disable-next-line no-console
  console.error = (...args: unknown[]): void => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };

  try {
    await run();
  } finally {
    // oxlint-disable-next-line no-console
    console.error = original;
  }

  return lines;
};

const WARNING_MARKER = "[eserstack/logging]";

const configureFallbackTest = async (category: string): Promise<void> => {
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [
      {
        category: [category],
        sinks: ["test"],
        lowestLevel: logging.Severities.Debug,
      },
    ],
  });
};

nodeTest.test(
  "Logger.log() falls back to console when LogCreate fails",
  { skip: withoutFfi },
  async () => {
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
);

nodeTest.test(
  "Logger.log() falls back to console when the FFI call throws",
  { skip: withoutFfi },
  async () => {
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
);

nodeTest.test(
  "Logger.log() falls back to console when LogWrite fails",
  { skip: withoutFfi },
  async () => {
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
);

nodeTest.test(
  "Logger.log() warns once but keeps writing every degraded record",
  { skip: withoutFfi },
  async () => {
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
          // oxlint-disable-next-line no-await-in-loop
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
);

nodeTest.test(
  "Logger.log() takes the Go path when the write succeeds",
  { skip: withoutFfi },
  async () => {
    await beforeEach();
    await configureFallbackTest("write-ok");

    const seen: string[] = [];
    const restore = stubLogSymbols({
      write: (request: unknown): string => {
        seen.push(String(request));

        return passthroughWrite(request);
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
);

/** An error with a cause, the shape a handled site logs as `{ error }`. */
const createErrorWithCause = (): Error =>
  new Error("bundle client entry", {
    cause: new TypeError("module ./app.tsx not found"),
  });

type SerializedError = {
  readonly name: string;
  readonly message: string;
  readonly stack: string;
  readonly cause?: SerializedError;
};

const assertSerializedErrorWithCause = (value: unknown): void => {
  const error = value as SerializedError;

  assert.assertEquals(error.name, "Error");
  assert.assertEquals(error.message, "bundle client entry");
  assert.assertStringIncludes(error.stack, "bundle client entry");
  assert.assertEquals(error.cause?.name, "TypeError");
  assert.assertEquals(error.cause?.message, "module ./app.tsx not found");
  assert.assertStringIncludes(
    error.cause?.stack ?? "",
    "module ./app.tsx not found",
  );
};

nodeTest.test(
  "Logger.log() sends an Error attribute with its cause to Go",
  { skip: withoutFfi },
  async () => {
    await beforeEach();
    await configureFallbackTest("error-attr-go");

    const seen: string[] = [];
    const restore = stubLogSymbols({
      write: (request: unknown): string => {
        seen.push(String(request));

        return passthroughWrite(request);
      },
    });

    const lines = await captureConsole(async () => {
      try {
        await getLogger(["error-attr-go"])
          .with({ error: createErrorWithCause() })
          .warn("client bundle skipped");
      } finally {
        restore();
      }
    });

    assert.assertEquals(lines, []);
    assert.assertEquals(seen.length, 1);

    const request = JSON.parse(seen[0]!) as {
      attrs: { error: unknown };
    };
    assertSerializedErrorWithCause(request.attrs.error);
  },
);

nodeTest.test(
  "Logger.log() writes an Error attribute with its cause on the console fallback",
  async () => {
    await beforeEach();
    await configureFallbackTest("error-attr-fallback");

    // Forces the fallback where the bridge loaded; without the bridge the
    // logger takes the fallback on its own.
    const restore = stubLogSymbols({
      create: () => JSON.stringify({ error: "create-boom" }),
    });

    const message = "client bundle skipped";
    const lines = await captureConsole(async () => {
      try {
        await getLogger(["error-attr-fallback"])
          .with({ error: createErrorWithCause() })
          .warn(message);
      } finally {
        restore();
      }
    });

    const record = lines.find((line) => line.includes(`${message} `));
    assert.assertExists(record);

    const attrs = JSON.parse(
      record.slice(record.indexOf(`${message} `) + message.length + 1),
    ) as { error: unknown };
    assertSerializedErrorWithCause(attrs.error);
  },
);

nodeTest.test(
  "Logger.log() includes context set in an async parent in a nested awaited call",
  async () => {
    await beforeEach();
    await configureFallbackTest("context-nested");

    // Forces the console fallback, so the record's attributes can be read back.
    const restore = stubLogSymbols({
      create: () => JSON.stringify({ error: "create-boom" }),
    });

    const message = "nested context call";
    const logNested = async (): Promise<void> => {
      await Promise.resolve();
      await getLogger(["context-nested"]).info(message);
    };

    const lines = await captureConsole(async () => {
      try {
        await log.context.withContext({ requestId: "req-42" }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
          await logNested();
        });
      } finally {
        restore();
      }
    });

    const record = lines.find((line) => line.includes(`${message} `));
    assert.assertExists(record);

    const attrs = JSON.parse(
      record.slice(record.indexOf(`${message} `) + message.length + 1),
    ) as { requestId?: unknown };
    assert.assertEquals(attrs.requestId, "req-42");
  },
);

nodeTest.test("Logger constructor creates logger with category", async () => {
  await beforeEach();

  const logger = new Logger(["test", "logger"]);

  assert.assertEquals(logger.category, ["test", "logger"]);
  assert.assertEquals(logger.loggerName, "test.logger");
  assert.assertEquals(logger.parent, null);
});

nodeTest.test("Logger constructor accepts string category", async () => {
  await beforeEach();

  const logger = new Logger("test.logger");

  assert.assertEquals(logger.category, ["test", "logger"]);
  assert.assertEquals(logger.loggerName, "test.logger");
});

nodeTest.test("Logger.getChild() creates child logger", async () => {
  await beforeEach();

  const parent = new Logger(["app"]);
  const child = parent.getChild("http");

  assert.assertEquals(child.category, ["app", "http"]);
  assert.assertEquals(child.parent, parent);
});

nodeTest.test("Logger.getChild() with array subcategory", async () => {
  await beforeEach();

  const parent = new Logger(["app"]);
  const child = parent.getChild(["http", "request"]);

  assert.assertEquals(child.category, ["app", "http", "request"]);
});

nodeTest.test("Logger.with() creates logger with properties", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [
      {
        category: ["app"],
        sinks: ["test"],
        lowestLevel: logging.Severities.Debug,
      },
    ],
  });

  const logger = getLogger(["app"]);
  const loggerWithProps = logger.with({ requestId: "abc-123" });

  // Properties are forwarded to Go as attrs; verify no throw and correct return value.
  const result = await loggerWithProps.info("test message");
  assert.assertEquals(result, "test message");
});

nodeTest.test("Logger.log() dispatches to Go FFI", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [
      {
        category: ["app"],
        sinks: ["test"],
        lowestLevel: logging.Severities.Debug,
      },
    ],
  });

  const logger = getLogger(["app"]);
  const result = await logger.info("test message");

  assert.assertEquals(result, "test message");
});

nodeTest.test(
  "Logger.log() skips logging when level is insufficient",
  async () => {
    await beforeEach();
    const { sink, records } = getTestSink();

    await configure({
      sinks: { test: sink },
      loggers: [
        {
          category: ["app"],
          sinks: ["test"],
          lowestLevel: logging.Severities.Error,
        },
      ],
    });

    const logger = getLogger(["app"]);
    const result = await logger.info("test message");

    assert.assertEquals(result, "test message");
    assert.assertEquals(records.length, 0);
  },
);

nodeTest.test(
  "Logger.log() with function message calls function only when logging",
  async () => {
    await beforeEach();
    const { sink } = getTestSink();

    await configure({
      sinks: { test: sink },
      loggers: [
        {
          category: ["app"],
          sinks: ["test"],
          lowestLevel: logging.Severities.Debug,
        },
      ],
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
  },
);

nodeTest.test(
  "Logger.log() with function message skips function when level insufficient",
  async () => {
    await beforeEach();
    const { sink, records } = getTestSink();

    await configure({
      sinks: { test: sink },
      loggers: [
        {
          category: ["app"],
          sinks: ["test"],
          lowestLevel: logging.Severities.Error,
        },
      ],
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
  },
);

nodeTest.test("Logger.log() with additional arguments", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [
      {
        category: ["app"],
        sinks: ["test"],
        lowestLevel: logging.Severities.Debug,
      },
    ],
  });

  const logger = getLogger(["app"]);
  const result = await logger.info("test message", "arg1", 42, {
    key: "value",
  });

  assert.assertEquals(result, "test message");
});

nodeTest.test("Logger convenience methods work correctly", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [
      {
        category: ["app"],
        sinks: ["test"],
        lowestLevel: logging.Severities.Debug,
      },
    ],
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
  nodeTest.test(`Logger.asString() handles ${name}`, () => {
    const logger = new Logger(["test"]);
    assert.assertEquals(logger.asString(input), expected);
  });
}

nodeTest.test("Logger creates proper LogRecord", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [
      {
        category: ["test-logger"],
        sinks: ["test"],
        lowestLevel: logging.Severities.Debug,
      },
    ],
  });

  const logger = getLogger(["test-logger"]);
  const result = await logger.info("test message", "arg1", 42);

  assert.assertEquals(result, "test message");
});

nodeTest.test("Default log level is Info", () => {
  assert.assertEquals(DEFAULT_LEVEL, logging.Severities.Info);
});

nodeTest.test("Logger handles non-string messages correctly", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [
      {
        category: ["app"],
        sinks: ["test"],
        lowestLevel: logging.Severities.Debug,
      },
    ],
  });

  const logger = getLogger(["app"]);

  assert.assertEquals(await logger.info(42), 42);
  assert.assertEquals(await logger.info({ key: "value" }), { key: "value" });
  assert.assertEquals(await logger.info([1, 2, 3]), [1, 2, 3]);
});

nodeTest.test(
  "getLogger() returns same instance for same category",
  async () => {
    await beforeEach();
    const { sink } = getTestSink();

    await configure({
      sinks: { test: sink },
      loggers: [{ category: ["app"], sinks: ["test"] }],
    });

    const logger1 = getLogger(["app", "http"]);
    const logger2 = getLogger(["app", "http"]);

    assert.assertStrictEquals(logger1, logger2);
  },
);

nodeTest.test("getLogger() accepts string category", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [{ category: "app", sinks: ["test"] }],
  });

  const logger = getLogger("app.http");

  assert.assertEquals(logger.category, ["app", "http"]);
});

nodeTest.test("Child loggers inherit parent sinks", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [
      {
        category: ["app"],
        sinks: ["test"],
        lowestLevel: logging.Severities.Debug,
      },
    ],
  });

  const logger = getLogger(["app", "http", "handler"]);
  const result = await logger.info("child message");

  assert.assertEquals(result, "child message");
});

nodeTest.test("Logger OpenTelemetry severity levels", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [
      {
        category: ["app"],
        sinks: ["test"],
        lowestLevel: logging.Severities.Trace,
      },
    ],
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

nodeTest.test("OpenTelemetry severity values are correct", () => {
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

nodeTest.test("Logger.trace() logs at trace level", async () => {
  await beforeEach();
  const { sink } = getTestSink();

  await configure({
    sinks: { test: sink },
    loggers: [
      {
        category: ["app"],
        sinks: ["test"],
        lowestLevel: logging.Severities.Trace,
      },
    ],
  });

  const logger = getLogger(["app"]);
  const result = await logger.trace("trace message");

  assert.assertEquals(result, "trace message");
});

nodeTest.test(
  "Logger.trace() is filtered when lowestLevel is Debug",
  async () => {
    await beforeEach();
    const { sink } = getTestSink();

    await configure({
      sinks: { test: sink },
      loggers: [
        {
          category: ["app"],
          sinks: ["test"],
          lowestLevel: logging.Severities.Debug, // Debug=5, Trace=1
        },
      ],
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
  },
);
