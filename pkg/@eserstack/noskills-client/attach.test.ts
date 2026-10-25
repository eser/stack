// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// attachSession dials through the global WebTransport and, with no pinned
// hash, the global fetch. Each test swaps them and puts the originals back in
// a finally; tests in one module run one at a time.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as noskillsClient from "./mod.ts";

const BASE_URL = "https://daemon.test";

/** One dialed session: the test plays the daemon's side of the stream. */
type Dial = {
  readonly url: string;
  readonly options: WebTransportOptions | undefined;
  readonly closeCalls: number;
  /** Sends text to the client, as the daemon would. */
  readonly serverWrite: (text: string | Uint8Array) => void;
  /** Ends the stream from the daemon's side. */
  readonly serverEnd: () => void;
  /** Everything the client wrote, decoded. */
  readonly written: () => string;
};

/** How one fake dial behaves; by default it connects and opens its stream. */
type DialBehavior = {
  /**
   * "never" leaves the handshake pending, an Error fails it, and a promise
   * completes it when the promise resolves.
   */
  readonly ready?: "never" | Error | Promise<void>;
  /** "never" leaves the bidi stream pending after the handshake. */
  readonly stream?: "never";
};

const pending = <T>(): Promise<T> => new Promise<T>(() => {});

const withFakeWebTransport = async (
  fn: (dials: ReadonlyArray<Dial>) => Promise<void>,
  behave: (
    options: WebTransportOptions | undefined,
  ) => DialBehavior = () => ({}),
): Promise<void> => {
  const dials: Dial[] = [];

  class FakeWebTransport {
    readonly ready: Promise<void>;
    #stream: WebTransportBidirectionalStream;
    #dial: { closeCalls: number };
    #behavior: DialBehavior;

    constructor(url: string, options?: WebTransportOptions) {
      this.#behavior = behave(options);
      const ready = this.#behavior.ready;
      if (ready === undefined) {
        this.ready = Promise.resolve();
      } else if (ready === "never") {
        this.ready = pending();
      } else if (ready instanceof Promise) {
        this.ready = ready;
      } else {
        this.ready = Promise.reject(ready);
      }

      let server!: ReadableStreamDefaultController<Uint8Array>;
      const chunks: Uint8Array[] = [];
      const encoder = new TextEncoder();
      const state = { closeCalls: 0 };

      this.#dial = state;
      this.#stream = {
        readable: new ReadableStream<Uint8Array>({
          start: (controller) => {
            server = controller;
          },
        }),
        writable: new WritableStream<Uint8Array>({
          write: (chunk) => {
            chunks.push(chunk);
          },
        }),
      } as unknown as WebTransportBidirectionalStream;

      dials.push({
        url,
        options,
        get closeCalls() {
          return state.closeCalls;
        },
        serverWrite: (text) =>
          server.enqueue(
            typeof text === "string" ? encoder.encode(text) : text,
          ),
        serverEnd: () => server.close(),
        written: () =>
          chunks.map((chunk) => new TextDecoder().decode(chunk)).join(""),
      });
    }

    createBidirectionalStream(): Promise<WebTransportBidirectionalStream> {
      return this.#behavior.stream === "never"
        ? pending()
        : Promise.resolve(this.#stream);
    }

    close(): void {
      this.#dial.closeCalls++;
    }
  }

  const original = globalThis.WebTransport;
  globalThis.WebTransport = FakeWebTransport as unknown as typeof WebTransport;
  try {
    await fn(dials);
  } finally {
    globalThis.WebTransport = original;
  }
};

const withFetch = async (
  respond: (init?: RequestInit) => Promise<Response>,
  fn: (calls: ReadonlyArray<string>) => Promise<void>,
): Promise<void> => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (input, init) => {
    calls.push(String(input));
    return respond(init);
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = original;
  }
};

const failFetch = () =>
  Promise.reject(new Error("the test expected no fingerprint fetch"));

/** A SHA-256 fingerprint: 32 bytes, all set to `fill`. */
const pinOf = (fill: number): ArrayBuffer =>
  new Uint8Array(32).fill(fill).buffer;

const hexOf = (fill: number): string =>
  fill.toString(16).padStart(2, "0").repeat(32);

const fingerprintAnswer = (fill: number) => () =>
  Promise.resolve(Response.json({ fingerprint: hexOf(fill) }));

/** The first byte of each pin a dial offered, or null when it pinned none. */
const pinnedFills = (dial: Dial | undefined): number[] | null => {
  const hashes = dial?.options?.serverCertificateHashes;
  return hashes === undefined
    ? null
    : hashes.map((hash) => new Uint8Array(hash.value as ArrayBuffer)[0]!);
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const collect = async (
  session: noskillsClient.AttachSession,
): Promise<noskillsClient.DaemonEvent[]> => {
  const events: noskillsClient.DaemonEvent[] = [];
  for await (const event of session.events()) {
    events.push(event);
  }
  return events;
};

/** Attaches with no certificate pin, so no fingerprint is fetched. */
const attach = (
  config: Partial<noskillsClient.NoskillsClientConfig> = {},
  options: noskillsClient.AttachOptions = {},
) =>
  noskillsClient.attachSession({ baseUrl: BASE_URL, ...config }, "app", "s-1", {
    certHash: null,
    ...options,
  });

nodeTest.test(
  "attachSession puts the token, resume point and kind in the query",
  async () => {
    await withFakeWebTransport(async (dials) => {
      await noskillsClient.attachSession(
        { baseUrl: BASE_URL, token: "t-1" },
        "my app",
        "s/1",
        { certHash: null, afterSeq: 42, kind: "mux" },
      );

      assert.assertEquals(
        dials[0]?.url,
        `${BASE_URL}/attach/my%20app/s%2F1?token=t-1&after=42&kind=mux`,
      );
    });
  },
);

nodeTest.test(
  "attachSession leaves out an empty token, a zero afterSeq and an empty query",
  async () => {
    await withFakeWebTransport(async (dials) => {
      await attach({ token: "" }, { afterSeq: 0 });

      assert.assertEquals(dials[0]?.url, `${BASE_URL}/attach/app/s-1`);
    });
  },
);

const pinCases: ReadonlyArray<{
  readonly name: string;
  readonly configHashes?: ArrayBuffer[];
  readonly certHash?: ArrayBuffer | null;
  readonly expected: number[] | null;
}> = [
  {
    name: "pins the certHash option over config.certHashes",
    configHashes: [pinOf(1)],
    certHash: pinOf(2),
    expected: [2],
  },
  {
    name: "pins every config.certHashes entry when no option is given",
    configHashes: [pinOf(3), pinOf(4)],
    expected: [3, 4],
  },
  {
    name: "pins nothing for certHash null, without fetching",
    configHashes: [pinOf(5)],
    certHash: null,
    expected: null,
  },
];

for (const { name, configHashes, certHash, expected } of pinCases) {
  nodeTest.test(`attachSession ${name}`, async () => {
    await withFetch(failFetch, async (fetches) => {
      await withFakeWebTransport(async (dials) => {
        const options: noskillsClient.AttachOptions =
          certHash === undefined ? {} : { certHash };
        await noskillsClient.attachSession(
          { baseUrl: BASE_URL, certHashes: configHashes },
          "app",
          "s-1",
          options,
        );

        assert.assertEquals(pinnedFills(dials[0]), expected);
        assert.assertEquals(
          dials[0]?.options?.serverCertificateHashes?.[0]?.algorithm ?? null,
          expected === null ? null : "sha-256",
        );
        assert.assertEquals(fetches, []);
      });
    });
  });
}

const badPinCases: ReadonlyArray<{
  readonly name: string;
  readonly config: Partial<noskillsClient.NoskillsClientConfig>;
  readonly options: noskillsClient.AttachOptions;
  readonly message: string;
}> = [
  {
    name: "a certHash option",
    config: {},
    options: { certHash: new Uint8Array(16).buffer },
    message: "the certHash option is 16 bytes",
  },
  {
    name: "a config.certHashes entry",
    config: { certHashes: [pinOf(1), new Uint8Array(20).buffer] },
    options: {},
    message: "config.certHashes[1] is 20 bytes",
  },
];

for (const { name, config, options, message } of badPinCases) {
  nodeTest.test(
    `attachSession refuses ${name} that is not 32 bytes`,
    async () => {
      await withFakeWebTransport(async (dials) => {
        await assert.assertRejects(
          () =>
            noskillsClient.attachSession(
              { baseUrl: BASE_URL, ...config },
              "app",
              "s-1",
              options,
            ),
          RangeError,
          message,
        );
        assert.assertEquals(dials.length, 0);
      });
    },
  );
}

nodeTest.test(
  "attachSession fetches the daemon's fingerprint when nothing is pinned",
  async () => {
    await withFetch(fingerprintAnswer(0x0a), async (fetches) => {
      await withFakeWebTransport(async (dials) => {
        await noskillsClient.attachSession({ baseUrl: BASE_URL }, "app", "s-1");

        assert.assertEquals(fetches, [`${BASE_URL}/api/cert-fingerprint`]);
        assert.assertEquals(pinnedFills(dials[0]), [0x0a]);
      });
    });
  },
);

nodeTest.test(
  "attachSession pins nothing when the daemon has no fingerprint endpoint",
  async () => {
    await withFetch(
      () => Promise.resolve(new Response("not found", { status: 404 })),
      async () => {
        await withFakeWebTransport(async (dials) => {
          await noskillsClient.attachSession(
            { baseUrl: BASE_URL },
            "app",
            "s-1",
          );

          assert.assertEquals(pinnedFills(dials[0]), null);
        });
      },
    );
  },
);

nodeTest.test(
  "attachSession dials again with the daemon's new fingerprint when the pin went stale",
  async () => {
    // The daemon reports 0x0a first and 0x0b after its certificate changed.
    const answers = [0x0a, 0x0b];
    await withFetch(
      () => fingerprintAnswer(answers.shift() ?? 0x0b)(),
      async (fetches) => {
        await withFakeWebTransport(
          async (dials) => {
            await noskillsClient.attachSession(
              { baseUrl: BASE_URL },
              "app",
              "s-1",
            );

            assert.assertEquals(dials.map(pinnedFills), [[0x0a], [0x0b]]);
            assert.assertEquals(fetches.length, 2);
          },
          (options) =>
            pinnedFills({ options } as Dial)?.[0] === 0x0a
              ? { ready: new Error("certificate does not match the pin") }
              : {},
        );
      },
    );
  },
);

nodeTest.test(
  "attachSession reports the dial error when the daemon's fingerprint did not change",
  async () => {
    await withFetch(fingerprintAnswer(0x0a), async (fetches) => {
      await withFakeWebTransport(
        async (dials) => {
          await assert.assertRejects(
            () =>
              noskillsClient.attachSession({ baseUrl: BASE_URL }, "app", "s-1"),
            Error,
            "connection refused",
          );
          assert.assertEquals(dials.length, 1);
          assert.assertEquals(fetches.length, 2);
        },
        () => ({ ready: new Error("connection refused") }),
      );
    });
  },
);

nodeTest.test(
  "attachSession does not refetch when a configured pin fails",
  async () => {
    await withFetch(failFetch, async (fetches) => {
      await withFakeWebTransport(
        async () => {
          await assert.assertRejects(
            () =>
              noskillsClient.attachSession(
                { baseUrl: BASE_URL, certHashes: [pinOf(1)] },
                "app",
                "s-1",
              ),
            Error,
            "certificate does not match the pin",
          );
          assert.assertEquals(fetches, []);
        },
        () => ({ ready: new Error("certificate does not match the pin") }),
      );
    });
  },
);

nodeTest.test(
  "attachSession times out when the handshake never completes, and closes it",
  async () => {
    await withFakeWebTransport(
      async (dials) => {
        const error = await assert.assertRejects(
          () => attach({}, { timeoutMs: 20 }),
          noskillsClient.NoskillsTimeoutError,
          "attach app/s-1: the daemon did not answer within 20 ms",
        );
        assert.assertEquals(error.operation, "attach app/s-1");

        // The WebTransport client's dialTimeout closes the abandoned handshake.
        await sleep(60);
        assert.assertEquals(dials[0]?.closeCalls, 1);
      },
      () => ({ ready: "never" }),
    );
  },
);

nodeTest.test(
  "attachSession times out when the stream never opens, and closes the session",
  async () => {
    await withFakeWebTransport(
      async (dials) => {
        await assert.assertRejects(
          () => attach({}, { timeoutMs: 20 }),
          noskillsClient.NoskillsTimeoutError,
        );
        assert.assertEquals(dials[0]?.closeCalls, 1);
      },
      () => ({ stream: "never" }),
    );
  },
);

nodeTest.test(
  "attachSession times out when the fingerprint fetch never answers",
  async () => {
    const neverAnswers = (init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      });

    await withFetch(neverAnswers, async () => {
      await withFakeWebTransport(async (dials) => {
        await assert.assertRejects(
          () =>
            noskillsClient.attachSession({ baseUrl: BASE_URL }, "app", "s-1", {
              timeoutMs: 20,
            }),
          noskillsClient.NoskillsTimeoutError,
          "attach app/s-1",
        );
        assert.assertEquals(dials.length, 0);
      });
    });
  },
);

nodeTest.test(
  "attachSession rejects with the caller's reason when its signal aborts",
  async () => {
    await withFakeWebTransport(
      async (dials) => {
        const controller = new AbortController();
        const reason = new Error("user left the session");

        const attaching = attach({}, { signal: controller.signal });
        await sleep(5);
        controller.abort(reason);

        assert.assertStrictEquals(
          await attaching.catch((error: unknown) => error),
          reason,
        );
        assert.assertEquals(dials.length, 1);
      },
      () => ({ ready: "never" }),
    );
  },
);

nodeTest.test(
  "attachSession closes a session that connects after the caller gave up",
  async () => {
    let connect!: () => void;
    const late = new Promise<void>((resolve) => {
      connect = resolve;
    });

    await withFakeWebTransport(
      async (dials) => {
        const reason = new Error("gave up");
        const controller = new AbortController();
        const attaching = attach({}, { signal: controller.signal });
        await sleep(5);
        controller.abort(reason);
        assert.assertStrictEquals(
          await attaching.catch((error: unknown) => error),
          reason,
        );

        connect();
        await sleep(5);
        assert.assertEquals(dials[0]?.closeCalls, 1);
      },
      () => ({ ready: late }),
    );
  },
);

nodeTest.test(
  "events yields one event per JSON line, across reads",
  async () => {
    await withFakeWebTransport(async (dials) => {
      const session = await attach();
      const daemon = dials[0]!;

      daemon.serverWrite(`{"type":"worker_ready","v":1,"seq":1}\n{"type":"cli`);
      daemon.serverWrite(`ent_count","v":1,"n":2,"seq":2}\n`);
      daemon.serverEnd();

      assert.assertEquals(await collect(session), [
        { type: "worker_ready", v: 1, seq: 1 },
        { type: "client_count", v: 1, n: 2, seq: 2 },
      ]);
      assert.assertEquals(session.lastSeq, 2);
    });
  },
);

nodeTest.test(
  "events decodes a character split between two reads",
  async () => {
    await withFakeWebTransport(async (dials) => {
      const session = await attach();
      const daemon = dials[0]!;
      const bytes = new TextEncoder().encode(
        `{"type":"error","v":1,"code":"x","message":"çalışma"}\n`,
      );
      const cut = bytes.indexOf(0xc3) + 1;

      daemon.serverWrite(bytes.slice(0, cut));
      daemon.serverWrite(bytes.slice(cut));
      daemon.serverEnd();

      const [event] = await collect(session);
      assert.assertEquals(
        event?.type === "error" ? event.message : null,
        "çalışma",
      );
    });
  },
);

nodeTest.test(
  "events skips blank lines and lines that are not JSON",
  async () => {
    await withFakeWebTransport(async (dials) => {
      const session = await attach();
      const daemon = dials[0]!;

      daemon.serverWrite(`not json\n\n   \n{"type":"worker_ready","v":1}\n`);
      daemon.serverEnd();

      assert.assertEquals(await collect(session), [
        { type: "worker_ready", v: 1 },
      ]);
    });
  },
);

nodeTest.test("events yields a last line that has no newline", async () => {
  await withFakeWebTransport(async (dials) => {
    const session = await attach();
    const daemon = dials[0]!;

    daemon.serverWrite(`{"type":"worker_ready","v":1,"seq":7}`);
    daemon.serverEnd();

    assert.assertEquals(await collect(session), [
      { type: "worker_ready", v: 1, seq: 7 },
    ]);
  });
});

nodeTest.test(
  "lastSeq keeps the last seq when later events carry none",
  async () => {
    await withFakeWebTransport(async (dials) => {
      const session = await attach();
      const daemon = dials[0]!;

      assert.assertEquals(session.lastSeq, 0);
      daemon.serverWrite(`{"type":"worker_ready","v":1,"seq":5}\n`);
      daemon.serverWrite(`{"type":"transcript_replay_end","v":1}\n`);
      daemon.serverEnd();
      await collect(session);

      assert.assertEquals(session.lastSeq, 5);
    });
  },
);

nodeTest.test("send writes each command as one JSON line", async () => {
  await withFakeWebTransport(async (dials) => {
    const session = await attach();

    await session.send({ type: "user_message", content: "Run the tests" });
    await session.send({ type: "stop" });

    assert.assertEquals(
      dials[0]?.written(),
      `{"type":"user_message","content":"Run the tests"}\n{"type":"stop"}\n`,
    );
  });
});

nodeTest.test(
  "close closes the WebTransport session once, and send then rejects",
  async () => {
    await withFakeWebTransport(async (dials) => {
      const session = await attach();

      session.close();
      session.close();

      assert.assertEquals(dials[0]?.closeCalls, 1);
      await assert.assertRejects(
        () => session.send({ type: "stop" }),
        Error,
        "AttachSession is closed",
      );
    });
  },
);
