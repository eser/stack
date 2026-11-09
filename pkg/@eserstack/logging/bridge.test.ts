// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The category resolution that lives in Go (`logfx.ResolveCategoryConfig` in
 * `pkg/ajan/logfx`), reached through the bridge's dispatcher (`EserAjanCall`),
 * through `config.getEffectiveConfig` and through the TypeScript fallback that
 * logging keeps for processes without the bridge. The cases are the fixture
 * file that the Go test of logfx reads, written from the answers of the
 * TypeScript `getEffectiveConfig` before the resolution moved, so every side
 * checks the same behavior.
 *
 * The test reads the fixtures and starts its child process through Node's own
 * modules, as the other bridge tests of the leaf packages do.
 *
 * @module
 */

import * as childProcess from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as nodeProcess from "node:process";
import * as nodeTest from "node:test";
import * as util from "node:util";
import type * as ffiTypes from "@eserstack/ajan/ffi";
import * as wasm from "@eserstack/ajan/wasm";
import * as logging from "@eserstack/standards/logging";
import * as assert from "@eserstack/test-kit/assert";
import * as log from "./mod.ts";
import * as ffiClient from "./ffi-client.ts";
import * as resolveConfig from "./resolve-config.ts";
import type { LoggerConfig } from "./types.ts";

const FIXTURE = path.join(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "ajan",
  "logfx",
  "testdata",
  "category_configs.json",
);

interface CategoryConfigCase {
  readonly name: string;
  readonly category: readonly string[];
  readonly loggers: readonly LoggerConfig[];
  readonly want: {
    readonly lowestLevel: number;
    readonly sinks: readonly string[];
    readonly filters: readonly string[];
  };
}

const readCases = async (): Promise<CategoryConfigCase[]> =>
  JSON.parse(await fs.readFile(FIXTURE, "utf8")) as CategoryConfigCase[];

/** The loggers of a case as `configure()` stores them: categories normalized. */
const normalizedLoggers = (tc: CategoryConfigCase): LoggerConfig[] =>
  tc.loggers.map((loggerConfig) => ({
    ...loggerConfig,
    category: log.category.normalizeCategory(loggerConfig.category),
  }));

/** Reads a resolution's level index back to the level it names. */
const levelOf = (
  loggers: readonly LoggerConfig[],
  levelIndex: number,
): number =>
  levelIndex < 0
    ? logging.Severities.Info
    : (loggers[levelIndex]!.lowestLevel as number);

const runWireCases = async (lib: ffiTypes.FFILibrary): Promise<void> => {
  for (const tc of await readCases()) {
    const loggers = normalizedLoggers(tc);
    const answer = lib.call("logResolveConfig", {
      category: tc.category,
      loggers: resolveConfig.toWire(loggers),
    });

    assert.assertEquals(answer.error, undefined, tc.name);
    assert.assertEquals(
      {
        lowestLevel: levelOf(loggers, answer.levelIndex!),
        sinks: answer.sinks,
        filters: answer.filters,
      },
      tc.want,
      tc.name,
    );
  }
};

nodeTest.test(
  "logResolveConfig answers the cases of category_configs.json",
  async () => {
    await runWireCases(ffiClient.requireLib());
  },
);

nodeTest.test(
  "the WASM reactor answers the cases of category_configs.json",
  { skip: !wasm.isWasmAvailable() },
  async () => {
    const lib = await wasm.loadEserAjanWasm();
    try {
      await runWireCases(lib);
    } finally {
      lib.close();
    }
  },
);

nodeTest.test(
  "the TypeScript fallback answers the cases of category_configs.json",
  async () => {
    for (const tc of await readCases()) {
      const loggers = normalizedLoggers(tc);
      const resolution = resolveConfig.resolveInTypeScript(
        tc.category,
        loggers,
      );

      assert.assertEquals(
        {
          lowestLevel: levelOf(loggers, resolution.levelIndex),
          sinks: resolution.sinks,
          filters: resolution.filters,
        },
        tc.want,
        tc.name,
      );
    }
  },
);

/**
 * Configures each case with a named function per sink and filter name and
 * answers what getEffectiveConfig gives, the functions read back to names.
 * The child process below runs it from its source text, so it uses nothing
 * from this module's scope.
 */
const runEffectiveCases = async (
  module: typeof log,
  cases: readonly CategoryConfigCase[],
): Promise<Array<{ name: string; got: unknown }>> => {
  const out: Array<{ name: string; got: unknown }> = [];
  for (const tc of cases) {
    const names = new Map<unknown, string>();
    const sinks: Record<string, () => void> = {};
    const filters: Record<string, () => boolean> = {};
    for (const loggerConfig of tc.loggers) {
      for (const name of loggerConfig.sinks ?? []) {
        sinks[name] = () => {};
        names.set(sinks[name], name);
      }
      for (const name of loggerConfig.filters ?? []) {
        filters[name] = () => true;
        names.set(filters[name], name);
      }
    }
    // The cases share the logging registry, so they run one at a time.
    // oxlint-disable-next-line no-await-in-loop
    await module.config.configure({
      sinks,
      filters,
      loggers: tc.loggers,
      reset: true,
    });
    const got = module.config.getEffectiveConfig(tc.category);
    out.push({
      name: tc.name,
      got: {
        lowestLevel: got.lowestLevel,
        sinks: got.sinks.map((sink) => names.get(sink)),
        filters: got.filters.map((filter) => names.get(filter)),
      },
    });
  }
  await module.config.reset();
  return out;
};

const assertEffectiveCases = (
  cases: readonly CategoryConfigCase[],
  answers: ReadonlyArray<{ name: string; got: unknown }>,
): void => {
  assert.assertEquals(answers.length, cases.length);
  cases.forEach((tc, index) => {
    assert.assertEquals(answers[index]?.got, tc.want, tc.name);
  });
};

nodeTest.test(
  "getEffectiveConfig answers the cases of category_configs.json through Go",
  async () => {
    const cases = await readCases();
    const calls: unknown[] = [];
    const lib = ffiClient.requireLib() as unknown as {
      call: (name: string, request?: unknown) => unknown;
    };
    const realCall = lib.call;
    lib.call = (name, request) => {
      if (name === "logResolveConfig") calls.push(request);
      return realCall.call(lib, name, request);
    };

    try {
      assertEffectiveCases(cases, await runEffectiveCases(log, cases));
    } finally {
      lib.call = realCall;
    }

    // Every case with a logger config asked Go; without one there is nothing
    // to resolve.
    assert.assertEquals(
      calls.length,
      cases.filter((tc) => tc.loggers.length > 0).length,
    );
  },
);

nodeTest.test(
  "with ESER_AJAN=disabled logging configures, resolves in TypeScript, writes to the configured sinks and to the console fallback without them",
  async () => {
    const script = `
      import * as fs from "node:fs/promises";
      import * as log from ${JSON.stringify(import.meta.resolve("./mod.ts"))};
      import * as goLogger from ${JSON.stringify(import.meta.resolve("./go-logger.ts"))};
      const cases = JSON.parse(await fs.readFile(${JSON.stringify(FIXTURE)}, "utf8"));
      const run = ${runEffectiveCases.toString()};
      const out = {};
      out.effective = await run(log, cases);

      // laroux build configures logging this way before its first record.
      const { sink, records } = log.sinks.getRecordCollectorSink();
      await log.config.configure({
        sinks: { console: sink },
        loggers: [
          { category: ["laroux-bundler"], lowestLevel: log.Severities.Debug, sinks: ["console"] },
          { category: ["no-sinks"], lowestLevel: log.Severities.Debug },
        ],
      });
      const logger = log.logger.getLogger(["laroux-bundler", "cli"]);
      out.debug = await logger.debug("first record");
      out.warn = await logger.warn("second record");
      out.collected = records.map((record) => record.message);
      await log.logger.getLogger(["no-sinks"]).debug("third record");
      await log.config.configure({
        sinks: { console: sink },
        loggers: [{ category: ["laroux-bundler"], lowestLevel: log.Severities.Error, sinks: ["console"] }],
        reset: true,
      });
      out.reconfigured = true;
      const goLog = await goLogger.createGoLogger({ scopeName: "x" });
      goLog.write("info", "dropped");
      goLog.close();
      process.stdout.write(JSON.stringify(out));
    `;

    // execFile rejects when the child exits with a non-zero code.
    const { stdout, stderr } = await util.promisify(childProcess.execFile)(
      nodeProcess.execPath,
      ["--input-type=module", "--eval", script],
      { env: { ...nodeProcess.env, ESER_AJAN: "disabled" } },
    );

    const result = JSON.parse(stdout) as {
      effective: Array<{ name: string; got: unknown }>;
      debug: string;
      warn: string;
      collected: string[];
      reconfigured: boolean;
    };

    assertEffectiveCases(await readCases(), result.effective);
    assert.assertEquals(result.debug, "first record");
    assert.assertEquals(result.warn, "second record");
    assert.assertEquals(result.collected, ["first record", "second record"]);
    assert.assertEquals(result.reconfigured, true);

    const lines = stderr.split("\n");
    const warnings = lines.filter((line) =>
      line.includes("[eserstack/logging]"),
    );
    assert.assertEquals(warnings.length, 1);
    assert.assertStringIncludes(warnings[0]!, "ESER_AJAN=disabled");
    // The records of a category with sinks reach the sinks only; a category
    // without sinks writes to the console fallback.
    assert.assertEquals(
      lines.some((line) => line.includes("laroux-bundler.cli")),
      false,
    );
    assert.assertExists(
      lines.find((line) => line.includes(" DEBUG no-sinks: third record")),
    );
    assert.assertEquals(
      lines.some((line) => line.includes("dropped")),
      false,
    );
  },
);
