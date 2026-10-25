// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// cert.ts reads the global fetch and indexedDB. Each test swaps them and puts
// the originals back in a finally; tests in one module run one at a time.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as cert from "./cert.ts";
import * as errors from "./errors.ts";

const BASE_URL = "https://daemon.test";

/** A fingerprint in the compact form the daemon sends: 64 hex digits. */
const FINGERPRINT = "0a0bff".padEnd(64, "0");
const FINGERPRINT_BYTES = [0x0a, 0x0b, 0xff, ...new Array<number>(29).fill(0)];
const OTHER_FINGERPRINT = "1213".padEnd(64, "e");

type FetchCall = { readonly url: string; readonly signal: unknown };

const withFetch = async (
  respond: (url: string, init?: RequestInit) => Promise<Response>,
  fn: (calls: ReadonlyArray<FetchCall>) => Promise<void>,
): Promise<void> => {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (input, init) => {
    calls.push({ url: String(input), signal: init?.signal });
    return respond(String(input), init);
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = original;
  }
};

const fingerprintResponse = (fingerprint: unknown) => () =>
  Promise.resolve(Response.json({ fingerprint, algorithm: "sha-256" }));

/** A daemon that never answers: the request settles only when aborted. */
const neverAnswers = (_url: string, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    signal?.addEventListener("abort", () => reject(signal.reason));
  });

/**
 * An in-memory stand-in for the IndexedDB calls cert.ts makes. Callbacks fire
 * in a microtask, after cert.ts has attached its handlers, as in a browser.
 */
const createFakeIndexedDB = (options: { readonly failOpen?: boolean } = {}) => {
  const records = new Map<string, unknown>();
  let storeCreated = false;
  let openConnections = 0;

  type FakeRequest = {
    result: unknown;
    error: DOMException | null;
    onsuccess: (() => void) | null;
    onerror: (() => void) | null;
    onupgradeneeded: (() => void) | null;
  };

  const newRequest = (): FakeRequest => ({
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  });

  const succeed = (request: FakeRequest, result: () => unknown) => {
    queueMicrotask(() => {
      request.result = result();
      request.onsuccess?.();
    });
    return request;
  };

  const db = {
    createObjectStore: () => {
      storeCreated = true;
    },
    transaction: () => ({
      objectStore: () => ({
        put: (value: unknown, key: string) =>
          succeed(newRequest(), () => records.set(key, value)),
        get: (key: string) => succeed(newRequest(), () => records.get(key)),
      }),
    }),
    close: () => {
      openConnections--;
    },
  };

  const factory = {
    open: () => {
      const request = newRequest();
      queueMicrotask(() => {
        if (options.failOpen === true) {
          request.error = new DOMException("open blocked", "UnknownError");
          request.onerror?.();
          return;
        }
        openConnections++;
        request.result = db;
        if (!storeCreated) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  } as unknown as IDBFactory;

  return {
    factory,
    records,
    openConnections: () => openConnections,
  };
};

/** Runs `fn` with `factory` as the global indexedDB; `undefined` removes it. */
const withIndexedDB = async (
  factory: IDBFactory | undefined,
  fn: () => Promise<void>,
): Promise<void> => {
  const scope = globalThis as { indexedDB?: IDBFactory };
  const hadOwn = Object.hasOwn(scope, "indexedDB");
  const original = scope.indexedDB;
  if (factory === undefined) {
    delete scope.indexedDB;
  } else {
    scope.indexedDB = factory;
  }
  try {
    await fn();
  } finally {
    if (hadOwn) {
      scope.indexedDB = original;
    } else {
      delete scope.indexedDB;
    }
  }
};

const bytes = (buffer: ArrayBuffer | null): number[] | null =>
  buffer === null ? null : [...new Uint8Array(buffer)];

nodeTest.test(
  "fetchAndPinCertFingerprint returns the fingerprint as bytes",
  async () => {
    await withFetch(fingerprintResponse(FINGERPRINT), async (calls) => {
      const result = await cert.fetchAndPinCertFingerprint(`${BASE_URL}/`);

      assert.assertEquals(bytes(result), FINGERPRINT_BYTES);
      assert.assertEquals(calls.length, 1);
      assert.assertEquals(calls[0]?.url, `${BASE_URL}/api/cert-fingerprint`);
      // The request is bounded by a timeout signal.
      assert.assertInstanceOf(calls[0]?.signal, AbortSignal);
    });
  },
);

nodeTest.test(
  "fetchAndPinCertFingerprint accepts the colon-separated display form",
  async () => {
    const display = FINGERPRINT.toUpperCase().match(/../g)!.join(":");

    await withFetch(fingerprintResponse(display), async () => {
      const result = await cert.fetchAndPinCertFingerprint(BASE_URL);

      assert.assertEquals(bytes(result), FINGERPRINT_BYTES);
    });
  },
);

nodeTest.test(
  "fetchAndPinCertFingerprint returns null when the daemon has no fingerprint endpoint",
  async () => {
    await withFetch(
      () => Promise.resolve(new Response("not found", { status: 404 })),
      async () => {
        assert.assertEquals(
          await cert.fetchAndPinCertFingerprint(BASE_URL),
          null,
        );
      },
    );
  },
);

const failureCases: ReadonlyArray<{
  readonly name: string;
  readonly respond: () => Promise<Response>;
  readonly status: number | null;
  readonly message: string;
}> = [
  {
    name: "the endpoint answers with an error status",
    respond: () =>
      Promise.resolve(new Response("cert not ready", { status: 503 })),
    status: 503,
    message: "the endpoint answered HTTP 503",
  },
  {
    name: "the request fails",
    respond: () => Promise.reject(new TypeError("network unreachable")),
    status: null,
    message: "the request failed",
  },
  {
    name: "the body is not JSON",
    respond: () => Promise.resolve(new Response("<html>")),
    status: null,
    message: "the answer is not JSON",
  },
  {
    name: "the body is JSON null",
    respond: () => Promise.resolve(Response.json(null)),
    status: null,
    message: "the answer has no SHA-256 fingerprint",
  },
  {
    name: "the fingerprint is empty",
    respond: fingerprintResponse(""),
    status: null,
    message: "the answer has no SHA-256 fingerprint",
  },
  {
    name: "the fingerprint is not a string",
    respond: fingerprintResponse(42),
    status: null,
    message: "the answer has no SHA-256 fingerprint",
  },
  {
    name: "the fingerprint is shorter than 64 hex digits",
    respond: fingerprintResponse("0a0bff"),
    status: null,
    message: "the answer has no SHA-256 fingerprint",
  },
  {
    name: "the fingerprint has a character that is not hex",
    respond: fingerprintResponse(`${FINGERPRINT.slice(0, 63)}g`),
    status: null,
    message: "the answer has no SHA-256 fingerprint",
  },
  {
    name: "the fingerprint uses another algorithm",
    respond: () =>
      Promise.resolve(
        Response.json({ fingerprint: FINGERPRINT, algorithm: "sha-1" }),
      ),
    status: null,
    message: 'the fingerprint uses algorithm "sha-1"',
  },
];

for (const { name, respond, status, message } of failureCases) {
  nodeTest.test(
    `fetchAndPinCertFingerprint throws CertFingerprintError when ${name}`,
    async () => {
      await withFetch(respond, async () => {
        const error = await assert.assertRejects(
          () => cert.fetchAndPinCertFingerprint(BASE_URL),
          errors.CertFingerprintError,
          message,
        );

        assert.assertEquals(error.status, status);
        assert.assertEquals(error.url, `${BASE_URL}/api/cert-fingerprint`);
      });
    },
  );
}

nodeTest.test(
  "fetchAndPinCertFingerprint keeps the network error as the cause",
  async () => {
    const cause = new TypeError("network unreachable");

    await withFetch(
      () => Promise.reject(cause),
      async () => {
        const error = await assert.assertRejects(
          () => cert.fetchAndPinCertFingerprint(BASE_URL),
          errors.CertFingerprintError,
        );

        assert.assertStrictEquals(error.cause, cause);
      },
    );
  },
);

nodeTest.test(
  "fetchAndPinCertFingerprint times out when the daemon never answers",
  async () => {
    await withFetch(neverAnswers, async () => {
      const error = await assert.assertRejects(
        () => cert.fetchAndPinCertFingerprint(BASE_URL, { timeoutMs: 20 }),
        errors.NoskillsTimeoutError,
        "GET /api/cert-fingerprint: the daemon did not answer within 20 ms",
      );

      assert.assertEquals(error.timeoutMs, 20);
    });
  },
);

nodeTest.test(
  "fetchAndPinCertFingerprint times out even when fetch ignores the signal",
  async () => {
    await withFetch(
      () => new Promise<Response>(() => {}),
      async () => {
        await assert.assertRejects(
          () => cert.fetchAndPinCertFingerprint(BASE_URL, { timeoutMs: 20 }),
          errors.NoskillsTimeoutError,
        );
      },
    );
  },
);

nodeTest.test(
  "fetchAndPinCertFingerprint rejects with the caller's reason when the signal aborts",
  async () => {
    const controller = new AbortController();
    const reason = new Error("user left the page");

    await withFetch(neverAnswers, async () => {
      const pending = cert.fetchAndPinCertFingerprint(BASE_URL, {
        signal: controller.signal,
      });
      controller.abort(reason);

      assert.assertStrictEquals(
        await pending.catch((error: unknown) => error),
        reason,
      );
    });
  },
);

nodeTest.test(
  "fetchAndPinCertFingerprint rejects a baseUrl that is not absolute",
  async () => {
    await withFetch(fingerprintResponse(FINGERPRINT), async (calls) => {
      await assert.assertRejects(
        () => cert.fetchAndPinCertFingerprint("daemon.test/"),
        TypeError,
        "expected one like https://localhost:4433",
      );
      assert.assertEquals(calls.length, 0);
    });
  },
);

nodeTest.test(
  "fetchAndPinCertFingerprint caches the fingerprint under the daemon's origin",
  async () => {
    const fake = createFakeIndexedDB();

    await withIndexedDB(fake.factory, async () => {
      await withFetch(fingerprintResponse(FINGERPRINT), async () => {
        await cert.fetchAndPinCertFingerprint(`${BASE_URL}/prefix/`);
      });

      assert.assertEquals([...fake.records.keys()], [BASE_URL]);
      assert.assertEquals(
        await cert.loadCertFingerprint(BASE_URL),
        FINGERPRINT,
      );
      assert.assertEquals(fake.openConnections(), 0);
    });
  },
);

nodeTest.test("each daemon origin keeps its own fingerprint", async () => {
  const fake = createFakeIndexedDB();
  const otherDaemon = "https://daemon.test:4434";

  await withIndexedDB(fake.factory, async () => {
    await cert.storeCertFingerprint(BASE_URL, FINGERPRINT);
    await cert.storeCertFingerprint(otherDaemon, OTHER_FINGERPRINT);

    assert.assertEquals(await cert.loadCertFingerprint(BASE_URL), FINGERPRINT);
    assert.assertEquals(
      await cert.loadCertFingerprint(`${otherDaemon}/`),
      OTHER_FINGERPRINT,
    );
    assert.assertEquals(
      await cert.loadCertFingerprint("https://elsewhere.test"),
      null,
    );
  });
});

nodeTest.test(
  "storeCertFingerprint stores the display form in the compact form",
  async () => {
    const fake = createFakeIndexedDB();
    const display = FINGERPRINT.toUpperCase().match(/../g)!.join(":");

    await withIndexedDB(fake.factory, async () => {
      await cert.storeCertFingerprint(BASE_URL, display);

      assert.assertEquals(fake.records.get(BASE_URL), FINGERPRINT);
    });
  },
);

nodeTest.test(
  "storeCertFingerprint refuses a value that is not a SHA-256 fingerprint",
  async () => {
    const fake = createFakeIndexedDB();

    await withIndexedDB(fake.factory, async () => {
      await assert.assertRejects(
        () => cert.storeCertFingerprint(BASE_URL, "0a0b"),
        RangeError,
        "expected 64 hex digits",
      );
      assert.assertEquals(fake.records.size, 0);
    });
  },
);

nodeTest.test(
  "getCertFingerprint uses the cached fingerprint without fetching",
  async () => {
    const fake = createFakeIndexedDB();

    await withIndexedDB(fake.factory, async () => {
      await cert.storeCertFingerprint(BASE_URL, FINGERPRINT);

      await withFetch(fingerprintResponse(OTHER_FINGERPRINT), async (calls) => {
        assert.assertEquals(
          bytes(await cert.getCertFingerprint(BASE_URL)),
          FINGERPRINT_BYTES,
        );
        assert.assertEquals(calls.length, 0);
      });
      assert.assertEquals(fake.openConnections(), 0);
    });
  },
);

nodeTest.test(
  "getCertFingerprint fetches for a daemon whose origin has no cached fingerprint",
  async () => {
    const fake = createFakeIndexedDB();
    const otherDaemon = "https://other.test";

    await withIndexedDB(fake.factory, async () => {
      await cert.storeCertFingerprint(BASE_URL, FINGERPRINT);

      await withFetch(fingerprintResponse(OTHER_FINGERPRINT), async (calls) => {
        const result = await cert.getCertFingerprint(otherDaemon);

        assert.assertEquals(bytes(result)?.slice(0, 2), [0x12, 0x13]);
        assert.assertEquals(
          calls[0]?.url,
          `${otherDaemon}/api/cert-fingerprint`,
        );
      });
      assert.assertEquals(fake.records.get(otherDaemon), OTHER_FINGERPRINT);
      assert.assertEquals(fake.records.get(BASE_URL), FINGERPRINT);
    });
  },
);

nodeTest.test(
  "getCertFingerprint replaces a cached entry that is not a fingerprint",
  async () => {
    const fake = createFakeIndexedDB();
    fake.records.set(BASE_URL, "0a0b");

    await withIndexedDB(fake.factory, async () => {
      await withFetch(fingerprintResponse(FINGERPRINT), async (calls) => {
        assert.assertEquals(
          bytes(await cert.getCertFingerprint(BASE_URL)),
          FINGERPRINT_BYTES,
        );
        assert.assertEquals(calls.length, 1);
      });
      assert.assertEquals(fake.records.get(BASE_URL), FINGERPRINT);
    });
  },
);

nodeTest.test(
  "getCertFingerprint fetches when IndexedDB fails to open",
  async () => {
    const fake = createFakeIndexedDB({ failOpen: true });

    await withIndexedDB(fake.factory, async () => {
      await withFetch(fingerprintResponse(FINGERPRINT), async (calls) => {
        assert.assertEquals(
          bytes(await cert.getCertFingerprint(BASE_URL)),
          FINGERPRINT_BYTES,
        );
        assert.assertEquals(calls.length, 1);
      });
    });
  },
);

nodeTest.test(
  "getCertFingerprint fetches when the runtime has no IndexedDB",
  async () => {
    await withIndexedDB(undefined, async () => {
      await withFetch(fingerprintResponse(FINGERPRINT), async (calls) => {
        assert.assertEquals(
          bytes(await cert.getCertFingerprint(BASE_URL)),
          FINGERPRINT_BYTES,
        );
        assert.assertEquals(calls.length, 1);
      });
    });
  },
);

nodeTest.test(
  "getCertFingerprint passes the time limit to the fetch",
  async () => {
    await withIndexedDB(undefined, async () => {
      await withFetch(neverAnswers, async () => {
        await assert.assertRejects(
          () => cert.getCertFingerprint(BASE_URL, { timeoutMs: 20 }),
          errors.NoskillsTimeoutError,
        );
      });
    });
  },
);

nodeTest.test(
  "the IndexedDB helpers name the fix when the runtime has none",
  async () => {
    await withIndexedDB(undefined, async () => {
      await assert.assertRejects(
        () => cert.storeCertFingerprint(BASE_URL, FINGERPRINT),
        Error,
        "pin the certificate with certHashes in NoskillsClientConfig instead",
      );
      await assert.assertRejects(
        () => cert.loadCertFingerprint(BASE_URL),
        Error,
        "IndexedDB is not available in this runtime",
      );
    });
  },
);
