// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as standardsLogging from "@eserstack/standards/logging";
import * as defaults from "./defaults.ts";
import * as loggingBrowserShim from "./logging-browser-shim.ts";

type ShimRecord = {
  readonly message: string;
  readonly severity: number;
  readonly category: readonly string[];
  readonly properties: Record<string, unknown>;
  readonly args: readonly unknown[];
};

type LogMethod = (message: unknown, ...args: unknown[]) => Promise<unknown>;

type ShimLogger = {
  readonly category: readonly string[];
  readonly log: (
    severity: number,
    message: unknown,
    ...args: unknown[]
  ) => Promise<unknown>;
  readonly trace: LogMethod;
  readonly debug: LogMethod;
  readonly info: LogMethod;
  readonly notice: LogMethod;
  readonly warn: LogMethod;
  readonly error: LogMethod;
  readonly critical: LogMethod;
  readonly alert: LogMethod;
  readonly emergency: LogMethod;
  readonly with: (properties: Record<string, unknown>) => ShimLogger;
  readonly getChild: (subcategory: string | readonly string[]) => ShimLogger;
};

type ShimModule = {
  readonly Severities: typeof standardsLogging.Severities;
  readonly SeverityNames: typeof standardsLogging.SeverityNames;
  readonly logger: {
    readonly getLogger: (category: string | readonly string[]) => ShimLogger;
  };
  readonly config: {
    readonly configure: (options: {
      readonly sinks: Record<string, (record: ShimRecord) => unknown>;
      readonly loggers: readonly {
        readonly category: string | readonly string[];
        readonly lowestLevel?: number;
        readonly sinks?: readonly string[];
        readonly parentSinks?: "inherit" | "override";
      }[];
    }) => Promise<void>;
    readonly reset: () => Promise<void>;
    readonly isConfigured: () => boolean;
  };
};

/**
 * Import the shim source as a module, the way a client bundle runs it. Each
 * call gets its own copy, so configuration and cached loggers do not carry
 * over between tests.
 */
const loadShim = async (): Promise<ShimModule> => {
  const source =
    `${loggingBrowserShim.LOGGING_BROWSER_SHIM}\n// copy ${crypto.randomUUID()}\n`;

  return await import(
    `data:text/javascript,${encodeURIComponent(source)}`
  ) as ShimModule;
};

const CONSOLE_METHODS = ["debug", "info", "warn", "error"] as const;

type ConsoleMethod = typeof CONSOLE_METHODS[number];

type ConsoleCall = {
  readonly method: ConsoleMethod;
  readonly args: readonly unknown[];
};

/** Run fn with the console methods the shim writes to replaced by a recorder. */
const recordConsole = async (
  fn: () => Promise<void>,
): Promise<readonly ConsoleCall[]> => {
  const calls: ConsoleCall[] = [];
  const target = globalThis.console as unknown as Record<
    ConsoleMethod,
    (...args: unknown[]) => void
  >;
  const originals = CONSOLE_METHODS.map((method) => target[method]);

  for (const method of CONSOLE_METHODS) {
    target[method] = (...args: unknown[]) => {
      calls.push({ method, args });
    };
  }

  try {
    await fn();
  } finally {
    for (const [index, method] of CONSOLE_METHODS.entries()) {
      const original = originals[index];
      if (original !== undefined) {
        target[method] = original;
      }
    }
  }

  return calls;
};

Deno.test("DEFAULT_BROWSER_SHIMS replaces @eserstack/logging with the logging shim", () => {
  assert.assertEquals(
    defaults.DEFAULT_BROWSER_SHIMS.jsr["@eserstack/logging"],
    loggingBrowserShim.LOGGING_BROWSER_SHIM,
  );
});

Deno.test("the logging shim has the same severities as @eserstack/logging", async () => {
  const shim = await loadShim();

  assert.assertEquals(shim.Severities, standardsLogging.Severities);
  assert.assertEquals(
    { ...shim.SeverityNames },
    { ...standardsLogging.SeverityNames },
  );
});

Deno.test("logger.with(...).warn(...) writes to console.warn with the category and properties", async () => {
  const shim = await loadShim();
  let returned: unknown;

  const calls = await recordConsole(async () => {
    returned = await shim.logger.getLogger(["app", "checkout"])
      .with({ orderId: "order-1" })
      .with({ durationMs: 1200 })
      .warn("payment took longer than a second");
  });

  assert.assertEquals(returned, "payment took longer than a second");
  assert.assertEquals(calls, [{
    method: "warn",
    args: [
      "[app.checkout] payment took longer than a second",
      { orderId: "order-1", durationMs: 1200 },
    ],
  }]);
});

Deno.test("the logging shim drops records below Warning by default", async () => {
  const shim = await loadShim();
  const log = shim.logger.getLogger("app");
  const built: string[] = [];

  const calls = await recordConsole(async () => {
    await log.trace("trace");
    await log.debug(() => {
      built.push("debug");
      return "debug";
    });
    await log.info("info");
    await log.notice("notice");
  });

  assert.assertEquals(calls, []);
  assert.assertEquals(built, []);
});

const ERROR_LEVEL_CASES = [
  "error",
  "critical",
  "alert",
  "emergency",
] as const;

for (const level of ERROR_LEVEL_CASES) {
  Deno.test(`the logging shim writes ${level} records to console.error`, async () => {
    const shim = await loadShim();

    const calls = await recordConsole(async () => {
      await shim.logger.getLogger("app")[level]("checkout failed");
    });

    assert.assertEquals(calls, [{
      method: "error",
      args: ["[app] checkout failed"],
    }]);
  });
}

Deno.test("the logging shim puts extra arguments in an args attribute", async () => {
  const shim = await loadShim();

  const calls = await recordConsole(async () => {
    await shim.logger.getLogger("app").warn("retrying", { attempt: 2 });
  });

  assert.assertEquals(calls, [{
    method: "warn",
    args: ["[app] retrying", { args: [{ attempt: 2 }] }],
  }]);
});

Deno.test("getChild extends the category and keeps the properties", async () => {
  const shim = await loadShim();
  const child = shim.logger.getLogger("app.http")
    .with({ requestId: "req-7" })
    .getChild(["routes", "stories"]);

  const calls = await recordConsole(async () => {
    await child.warn("slow route");
  });

  assert.assertEquals(child.category, ["app", "http", "routes", "stories"]);
  assert.assertEquals(calls, [{
    method: "warn",
    args: ["[app.http.routes.stories] slow route", { requestId: "req-7" }],
  }]);
});

Deno.test("config.configure sends records to a configured sink at the configured level", async () => {
  const shim = await loadShim();
  const records: ShimRecord[] = [];
  await shim.config.configure({
    sinks: { memory: (record) => records.push(record) },
    loggers: [{
      category: ["app"],
      lowestLevel: shim.Severities.Debug,
      sinks: ["memory"],
    }],
  });

  const calls = await recordConsole(async () => {
    await shim.logger.getLogger(["app", "cart"]).with({ cartId: "cart-3" })
      .debug("item added", "sku-9");
    await shim.logger.getLogger("other").info("not configured, dropped");
    await shim.logger.getLogger("other").warn("not configured, console");
  });

  assert.assertEquals(shim.config.isConfigured(), true);
  assert.assertEquals(
    records.map((record) => ({
      message: record.message,
      severity: record.severity,
      category: record.category,
      properties: record.properties,
      args: record.args,
    })),
    [{
      message: "item added",
      severity: shim.Severities.Debug,
      category: ["app", "cart"],
      properties: { cartId: "cart-3" },
      args: ["sku-9"],
    }],
  );
  assert.assertEquals(calls, [{
    method: "warn",
    args: ["[other] not configured, console"],
  }]);
});

Deno.test("parentSinks override keeps the sinks of less specific configurations out", async () => {
  const shim = await loadShim();
  const written: string[] = [];
  await shim.config.configure({
    sinks: {
      app: () => written.push("app"),
      payments: () => written.push("payments"),
    },
    loggers: [
      { category: "app", sinks: ["app"] },
      { category: "app.payments", sinks: ["payments"] },
      { category: "app.audit", sinks: ["payments"], parentSinks: "override" },
    ],
  });

  await shim.logger.getLogger("app.payments").warn("inherits app");
  await shim.logger.getLogger("app.audit").warn("overrides app");

  assert.assertEquals(written, ["payments", "app", "payments"]);
});

Deno.test("a failing sink is reported on the console and does not throw", async () => {
  const shim = await loadShim();
  await shim.config.configure({
    sinks: {
      broken: () => {
        throw new Error("sink offline");
      },
    },
    loggers: [{ category: "app", sinks: ["broken"] }],
  });

  const calls = await recordConsole(async () => {
    await shim.logger.getLogger("app").error("checkout failed");
  });

  assert.assertEquals(calls.length, 1);
  assert.assertEquals(calls[0]?.method, "error");
  assert.assertEquals(
    calls[0]?.args[0],
    "[eserstack/logging] writing a log record failed",
  );
  assert.assertInstanceOf(calls[0]?.args[1], Error);
});

Deno.test("config.reset restores console output at Warning", async () => {
  const shim = await loadShim();
  const records: ShimRecord[] = [];
  await shim.config.configure({
    sinks: { memory: (record) => records.push(record) },
    loggers: [{ category: "app", sinks: ["memory"] }],
  });
  await shim.config.reset();

  const calls = await recordConsole(async () => {
    await shim.logger.getLogger("app").warn("after reset");
  });

  assert.assertEquals(shim.config.isConfigured(), false);
  assert.assertEquals(records, []);
  assert.assertEquals(calls, [{
    method: "warn",
    args: ["[app] after reset"],
  }]);
});
