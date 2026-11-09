// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The retry policy that lives in Go (`resilience.ResolveRetryPlan` and
 * `RetryPlan.Next` in `pkg/ajan/httpclient/resilience`), reached through the
 * bridge's dispatcher (`EserAjanCall`) and through HttpClient. The cases are
 * the fixture file that the Go tests of resilience read, written from the
 * answers of the TypeScript HttpClient before the policy moved, so both sides
 * check the same behavior.
 *
 * The package does not depend on `@eserstack/standards`, so this test reads
 * the fixtures and starts its child process through Node's own modules.
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
import type * as bindings from "@eserstack/ajan/ffi/bindings";
import * as wasm from "@eserstack/ajan/wasm";
import * as assert from "@eserstack/test-kit/assert";
import * as mock from "@eserstack/test-kit/mock";
import * as httpclient from "./mod.ts";
import * as ffiClient from "./ffi-client.ts";

const FIXTURES = path.join(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "ajan",
  "httpclient",
  "resilience",
  "testdata",
);

/** A JavaScript number as the fixture file spells it. */
type FixtureNumber = number | "NaN" | "Infinity" | "-Infinity";

interface RetryStep {
  readonly status?: number;
  readonly network?: boolean;
  readonly retryAfterMs?: number;
  readonly random?: number;
}

interface RetryPolicyCase {
  readonly name: string;
  readonly client?: Record<string, unknown> | false;
  readonly request?: Record<string, unknown> | false;
  readonly streamBody?: boolean;
  readonly steps: readonly RetryStep[];
  readonly want: {
    readonly fetches: number;
    readonly delays: readonly FixtureNumber[];
    readonly retries?: number;
    readonly status?: number;
    readonly error?: string;
    readonly message?: string;
  };
}

const readRetryPolicyCases = async (): Promise<RetryPolicyCase[]> =>
  JSON.parse(
    await fs.readFile(path.join(FIXTURES, "retry_policy_cases.json"), "utf8"),
  ) as RetryPolicyCase[];

const toNumber = (value: FixtureNumber): number =>
  typeof value === "number" ? value : Number(value);

/** Turns the fixture's spelled numbers into JavaScript numbers. */
const decodeSetting = (value: unknown): unknown => {
  if (value === "NaN" || value === "Infinity" || value === "-Infinity") {
    return Number(value);
  }
  if (Array.isArray(value)) {
    return value.map(decodeSetting);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, field]) => [key, decodeSetting(field)]),
    );
  }
  return value;
};

const isSuccess = (step: RetryStep): boolean =>
  step.network !== true &&
  step.status !== undefined &&
  step.status >= 200 &&
  step.status < 300;

nodeTest.test(
  "HttpClient answers the cases of retry_policy_cases.json",
  async () => {
    for (const tc of await readRetryPolicyCases()) {
      let fetches = 0;
      let random = 0;
      const delays: number[] = [];
      using _random = mock.stub(Math, "random", () => random);

      const client = httpclient.createHttpClient({
        ...(tc.client !== undefined && {
          retry: decodeSetting(tc.client) as httpclient.RetryConfig | false,
        }),
        fetchFn: () => {
          const step = tc.steps[fetches];
          fetches++;
          if (step === undefined) {
            throw new Error(`${tc.name}: no step for attempt ${fetches}`);
          }
          random = step.random ?? 0;
          if (step.network === true) {
            return Promise.reject(new TypeError("fetch failed"));
          }
          const nullBody = [204, 205, 304].includes(step.status ?? 0);
          return Promise.resolve(
            new Response(nullBody ? null : "{}", {
              status: step.status,
              headers: {
                "Content-Type": "application/json",
                ...(step.retryAfterMs !== undefined && {
                  "Retry-After": String(step.retryAfterMs / 1_000),
                }),
              },
            }),
          );
        },
        _delayFn: (ms) => {
          delays.push(ms);
          return Promise.resolve();
        },
      });

      const options: httpclient.RequestOptions = {
        ...(tc.request !== undefined && {
          retry: decodeSetting(tc.request) as httpclient.RetryConfig | false,
        }),
        ...(tc.streamBody === true && {
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("x"));
              controller.close();
            },
          }),
        }),
      };

      let got: Record<string, unknown>;
      try {
        // The cases share the Math.random stub, so they run one at a time.
        // oxlint-disable-next-line no-await-in-loop
        const response = await client.request(
          "POST",
          "https://example.test/x",
          options,
        );
        got = {
          fetches,
          delays,
          retries: response.retries,
          status: response.status,
        };
      } catch (error) {
        const e = error as httpclient.HttpClientError;
        got = { fetches, delays, error: e.name, message: e.message };
        if (e.statusCode !== null) got["status"] = e.statusCode;
      }

      assert.assertEquals(
        got,
        { ...tc.want, delays: tc.want.delays.map(toNumber) },
        tc.name,
      );
    }
  },
);

/**
 * Drives HttpClient's attempt loop over `lib`'s answers, as the Go test of
 * resilience drives it over the policy.
 */
const runPolicyCases = async (lib: ffiTypes.FFILibrary): Promise<void> => {
  for (const tc of await readRetryPolicyCases()) {
    const resolved = lib.call("httpRetryResolve", {
      ...(tc.client !== undefined && {
        client: tc.client as bindings.HttpRetryConfigWire | false,
      }),
      ...(tc.request !== undefined && {
        request: tc.request as bindings.HttpRetryConfigWire | false,
      }),
      streamBody: tc.streamBody === true,
    });
    assert.assertEquals(resolved.error, undefined, tc.name);
    const plan = resolved.plan!;

    let fetches = 0;
    const delays: number[] = [];
    let final: RetryStep | null = null;

    for (
      let attempt = 0;
      attempt < toNumber(plan.maxAttempts) && final === null;
      attempt++
    ) {
      const step = tc.steps[attempt]!;
      fetches++;
      if (isSuccess(step)) {
        final = step;
        break;
      }

      const answer = lib.call("httpRetryNext", {
        plan,
        attempt,
        status: step.network === true ? 0 : step.status!,
        retryAfterMs: step.retryAfterMs ?? null,
        random: step.random ?? 0,
      });
      assert.assertEquals(answer.error, undefined, tc.name);
      if (answer.retry !== true) {
        final = step;
        break;
      }
      delays.push(toNumber(answer.delayMs!));
    }

    assert.assertEquals(fetches, tc.want.fetches, `${tc.name}: fetches`);
    assert.assertEquals(
      delays,
      tc.want.delays.map(toNumber),
      `${tc.name}: delays`,
    );
    if (final === null) {
      assert.assertEquals(tc.want.error, "HttpClientError", tc.name);
    } else if (final.network === true) {
      assert.assertEquals(tc.want.error, "HttpNetworkError", tc.name);
    } else {
      assert.assertEquals(final.status, tc.want.status, tc.name);
    }
  }
};

nodeTest.test(
  "httpRetryResolve and httpRetryNext answer the cases of retry_policy_cases.json",
  async () => {
    await runPolicyCases(ffiClient.requireLibSync());
  },
);

nodeTest.test(
  "the WASM reactor answers the cases of retry_policy_cases.json",
  { skip: !wasm.isWasmAvailable() },
  async () => {
    const lib = await wasm.loadEserAjanWasm();
    try {
      await runPolicyCases(lib);
    } finally {
      lib.close();
    }
  },
);

nodeTest.test("a retry setting outside RetryConfig is refused", async () => {
  const client = httpclient.createHttpClient({
    retry: { jitter: "yes" } as unknown as httpclient.RetryConfig,
    fetchFn: () => Promise.resolve(new Response("{}")),
  });

  const error = await assert.assertRejects(
    () => client.get("https://example.test/x"),
    httpclient.HttpClientError,
  );
  assert.assertStringIncludes(
    error.message,
    "HttpClient: the retry policy refused the request: invalid request JSON",
  );
});

nodeTest.test(
  "with ESER_AJAN=disabled requests throw the bridge's load error and the TypeScript exports still work",
  async () => {
    const script = `
      import * as httpclient from ${JSON.stringify(import.meta.resolve("./mod.ts"))};
      import * as h3Fetch from ${JSON.stringify(import.meta.resolve("./h3-fetch.ts"))};
      const out = { failures: [], ts: {} };
      let fetches = 0;
      const client = httpclient.createHttpClient({
        fetchFn: () => { fetches++; return Promise.resolve(new Response("{}")); },
      });
      for (const run of [
        () => client.get("https://example.test/x"),
        () => client.postStream("https://example.test/x"),
        () => client.request("PUT", "https://example.test/x", { retry: false }),
      ]) {
        try {
          await run();
          out.failures.push(null);
        } catch (error) {
          out.failures.push({
            name: error.name,
            isClientError: error instanceof httpclient.HttpClientError,
            message: error.message,
            cause: error.cause?.message ?? null,
            causeCause: error.cause?.cause?.message ?? null,
          });
        }
      }
      const result = await client.getResult("https://example.test/x");
      out.ts.resultFailed = result.error instanceof httpclient.HttpClientError;
      out.ts.fetches = fetches;
      const chain = new httpclient.InterceptorChain().add({ name: "a", intercept: (r) => r });
      out.ts.chain = chain.remove("a") && chain.length === 0;
      const sent = await httpclient.applyRequestInterceptors(new Request("https://example.test/"), [
        { intercept: (r) => new Request(r, { headers: { "X-A": "1" } }) },
      ]);
      out.ts.intercepted = sent.headers.get("X-A");
      out.ts.retryAfter = httpclient.parseRetryAfter("2");
      out.ts.rateLimit = httpclient.extractRateLimitInfo(new Headers({ "X-RateLimit-Remaining": "4" }));
      out.ts.classified = httpclient.classifyHttpStatus(429) === httpclient.HttpRateLimitError;
      out.ts.wrapped = httpclient.classifyAndWrap(503, new Error("x")).name;
      out.ts.h3 = typeof h3Fetch.createH3FetchFn();
      process.stdout.write(JSON.stringify(out));
    `;

    // execFile rejects when the child exits with a non-zero code.
    const { stdout } = await util.promisify(childProcess.execFile)(
      nodeProcess.execPath,
      ["--input-type=module", "--eval", script],
      { env: { ...nodeProcess.env, ESER_AJAN: "disabled" } },
    );

    const result = JSON.parse(stdout) as {
      failures: Array<{
        name: string;
        isClientError: boolean;
        message: string;
        cause: string | null;
        causeCause: string | null;
      } | null>;
      ts: Record<string, unknown>;
    };

    assert.assertEquals(result.failures.length, 3);
    for (const failure of result.failures) {
      assert.assertExists(failure);
      assert.assertEquals(failure.name, "HttpClientError");
      assert.assertEquals(failure.isClientError, true);
      assert.assertStringIncludes(
        failure.message,
        "eser-ajan native library unavailable",
      );
      assert.assertStringIncludes(
        failure.cause ?? "",
        "eser-ajan native library unavailable",
      );
      assert.assertStringIncludes(
        failure.causeCause ?? "",
        "ESER_AJAN=disabled",
      );
    }

    assert.assertEquals(result.ts, {
      resultFailed: true,
      // No request leaves the process without the policy.
      fetches: 0,
      chain: true,
      intercepted: "1",
      retryAfter: 2,
      rateLimit: { remaining: 4 },
      classified: true,
      wrapped: "HttpResponseError",
      h3: "function",
    });
  },
);
