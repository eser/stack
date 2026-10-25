// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as noskillsClient from "./mod.ts";

const BASE_URL = "https://daemon.test";

type Call = {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly signal: AbortSignal | undefined;
};

/** A fetch that records each request and answers with `respond`. */
const createFakeFetch = (
  respond: (call: Call) => Response | Promise<Response>,
) => {
  const calls: Call[] = [];
  const fetchFn: typeof globalThis.fetch = (input, init) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body:
        init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      signal: init?.signal ?? undefined,
    };
    calls.push(call);

    return Promise.resolve(respond(call));
  };

  return { fetchFn, calls };
};

/** A daemon that never answers: the request settles only when aborted. */
const neverAnswers = (call: Call): Promise<Response> =>
  new Promise((_resolve, reject) => {
    call.signal?.addEventListener("abort", () => reject(call.signal?.reason));
  });

const createClient = (
  config: Partial<noskillsClient.NoskillsClientConfig> = {},
  respond: (call: Call) => Response | Promise<Response> = () =>
    Response.json({}),
) => {
  const fake = createFakeFetch(respond);
  const client = noskillsClient.createNoskillsClient(
    { baseUrl: BASE_URL, ...config },
    fake.fetchFn,
  );

  return { client, calls: fake.calls };
};

const subscription: PushSubscriptionJSON = {
  endpoint: "https://push.example/endpoint",
  keys: { p256dh: "key", auth: "secret" },
};

const routes: ReadonlyArray<{
  readonly name: string;
  readonly call: (client: noskillsClient.NoskillsClient) => Promise<unknown>;
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
}> = [
  {
    name: "health",
    call: (client) => client.health(),
    method: "GET",
    path: "/api/health",
  },
  {
    name: "listProjects",
    call: (client) => client.listProjects(),
    method: "GET",
    path: "/api/projects",
  },
  {
    name: "registerProject",
    call: (client) => client.registerProject({ path: "/src/app" }),
    method: "POST",
    path: "/api/projects",
    body: { path: "/src/app" },
  },
  {
    name: "deleteProject",
    call: (client) => client.deleteProject("app"),
    method: "DELETE",
    path: "/api/projects/app",
  },
  {
    name: "listSessions",
    call: (client) => client.listSessions("app"),
    method: "GET",
    path: "/api/projects/app/sessions",
  },
  {
    name: "createSession with no options",
    call: (client) => client.createSession("app"),
    method: "POST",
    path: "/api/projects/app/sessions",
    body: {},
  },
  {
    name: "createSession for a mux session",
    call: (client) => client.createSession("app", { kind: "mux" }),
    method: "POST",
    path: "/api/projects/app/sessions",
    body: { kind: "mux" },
  },
  {
    name: "forkSession",
    call: (client) => client.forkSession("app", "s-1", "m-9", "try b"),
    method: "POST",
    path: "/api/projects/app/sessions/s-1/fork",
    body: { at_message_id: "m-9", label: "try b" },
  },
  {
    name: "getSessionLineage",
    call: (client) => client.getSessionLineage("app", "s-1"),
    method: "GET",
    path: "/api/projects/app/sessions/s-1/lineage",
  },
  {
    name: "subscribePush",
    call: (client) => client.subscribePush(subscription, ["s-1"]),
    method: "POST",
    path: "/api/push/subscribe",
    body: { ...subscription, sessionFilter: ["s-1"] },
  },
  {
    name: "unsubscribePush",
    call: (client) => client.unsubscribePush("sub-1"),
    method: "DELETE",
    path: "/api/push/subscribe/sub-1",
  },
];

for (const { name, call, method, path, body } of routes) {
  Deno.test(`${name} sends ${method} ${path} with the token`, async () => {
    const { client, calls } = createClient({ token: "t-1" });

    await call(client);

    assert.assertEquals(calls.length, 1);
    assert.assertEquals(calls[0]?.method, method);
    assert.assertEquals(calls[0]?.url, `${BASE_URL}${path}`);
    assert.assertEquals(calls[0]?.headers["authorization"], "Bearer t-1");
    assert.assertEquals(calls[0]?.body, body);
    // The request carries the signal that bounds it.
    assert.assertInstanceOf(calls[0]?.signal, AbortSignal);
  });
}

Deno.test("every request declares JSON and the protocol version", async () => {
  const { client, calls } = createClient();

  await client.listProjects();

  assert.assertEquals(calls[0]?.headers, {
    "content-type": "application/json",
    "protocol-version": "1",
  });
});

Deno.test("a trailing slash on baseUrl is dropped", async () => {
  const { client, calls } = createClient({ baseUrl: `${BASE_URL}/` });

  await client.health();

  assert.assertEquals(calls[0]?.url, `${BASE_URL}/api/health`);
});

Deno.test("an empty token sends no authorization header", async () => {
  const { client, calls } = createClient({ token: "" });

  await client.listProjects();

  assert.assertEquals(calls[0]?.headers["authorization"], undefined);
});

Deno.test("path parameters are percent-encoded", async () => {
  const { client, calls } = createClient();

  await client.getSessionLineage("my app/../x", "s?1#2");

  assert.assertEquals(
    calls[0]?.url,
    `${BASE_URL}/api/projects/my%20app%2F..%2Fx/sessions/s%3F1%232/lineage`,
  );
});

Deno.test("responses are parsed as JSON", async () => {
  const projects = [{ slug: "app", root: "/src/app" }];
  const { client } = createClient({}, () => Response.json(projects));

  assert.assertEquals(await client.listProjects(), projects);
});

Deno.test("login sends the PIN without a token and keeps the token it gets", async () => {
  const login = { token: "t-new", expiresAt: "2026-12-31T00:00:00Z" };
  const { client, calls } = createClient({}, (call) =>
    call.url.endsWith("/auth/login") ? Response.json(login) : Response.json([]),
  );

  assert.assertEquals(await client.login("428591"), login);
  assert.assertEquals(client.token, "t-new");
  await client.listProjects();

  assert.assertEquals(calls[0]?.method, "POST");
  assert.assertEquals(calls[0]?.body, { pin: "428591" });
  assert.assertEquals(calls[0]?.headers["authorization"], undefined);
  assert.assertEquals(calls[1]?.headers["authorization"], "Bearer t-new");
});

Deno.test("setup sends the PIN without a token", async () => {
  const { client, calls } = createClient({ token: "t-1" }, () =>
    Response.json({ ok: true }),
  );

  await client.setup("428591");

  assert.assertEquals(calls[0]?.url, `${BASE_URL}/auth/setup`);
  assert.assertEquals(calls[0]?.body, { pin: "428591" });
  assert.assertEquals(calls[0]?.headers["authorization"], undefined);
});

Deno.test("logout sends the token, then forgets it", async () => {
  const { client, calls } = createClient({ token: "t-1" }, () =>
    Response.json({ ok: true }),
  );

  await client.logout();
  await client.health();

  assert.assertEquals(calls[0]?.url, `${BASE_URL}/auth/logout`);
  assert.assertEquals(calls[0]?.headers["authorization"], "Bearer t-1");
  assert.assertEquals(client.token, undefined);
  assert.assertEquals(calls[1]?.headers["authorization"], undefined);
});

Deno.test("logout keeps the token when the daemon refuses it", async () => {
  const { client } = createClient(
    { token: "t-1" },
    () => new Response("token is required", { status: 400 }),
  );

  await assert.assertRejects(() => client.logout());

  assert.assertEquals(client.token, "t-1");
});

Deno.test("setToken replaces the token later requests send", async () => {
  const { client, calls } = createClient({ token: "t-old" });

  client.setToken("t-stored");
  await client.listProjects();

  assert.assertEquals(client.token, "t-stored");
  assert.assertEquals(calls[0]?.headers["authorization"], "Bearer t-stored");
});

Deno.test("getVapidPublicKey returns the key from the public endpoint", async () => {
  const { client, calls } = createClient({ token: "t-1" }, () =>
    Response.json({ publicKey: "BPk" }),
  );

  assert.assertEquals(await client.getVapidPublicKey(), "BPk");
  assert.assertEquals(calls[0]?.url, `${BASE_URL}/api/push/vapid-public-key`);
  assert.assertEquals(calls[0]?.headers["authorization"], undefined);
});

const errorCases: ReadonlyArray<{
  readonly name: string;
  readonly call: (client: noskillsClient.NoskillsClient) => Promise<unknown>;
  readonly message: string;
}> = [
  {
    name: "GET",
    call: (client) => client.listProjects(),
    message: "GET /api/projects → 401: token expired",
  },
  {
    name: "POST",
    call: (client) => client.createSession("app"),
    message: "POST /api/projects/app/sessions → 401: token expired",
  },
  {
    name: "DELETE",
    call: (client) => client.deleteProject("app"),
    message: "DELETE /api/projects/app → 401: token expired",
  },
];

for (const { name, call, message } of errorCases) {
  Deno.test(`a ${name} with an error status throws the method, path, status and body`, async () => {
    const { client } = createClient(
      {},
      () => new Response("token expired", { status: 401 }),
    );

    const error = await assert.assertRejects(
      () => call(client),
      noskillsClient.NoskillsResponseError,
    );

    assert.assertEquals(error.message, message);
    assert.assertEquals(error.method, name);
    assert.assertEquals(error.status, 401);
    assert.assertEquals(error.detail, "token expired");
  });
}

Deno.test("an error body that cannot be read falls back to the status text", async () => {
  const body = new ReadableStream<Uint8Array>({
    pull: (controller) => controller.error(new Error("connection reset")),
  });
  const { client } = createClient(
    {},
    () => new Response(body, { status: 502, statusText: "Bad Gateway" }),
  );

  await assert.assertRejects(
    () => client.health(),
    Error,
    "GET /api/health → 502: Bad Gateway",
  );
});

Deno.test("a DELETE ignores the response body", async () => {
  const { client } = createClient(
    {},
    () => new Response(null, { status: 204 }),
  );

  assert.assertEquals(await client.deleteProject("app"), undefined);
});

Deno.test("a body that is not JSON rejects", async () => {
  const { client } = createClient({}, () => new Response("<html>"));

  await assert.assertRejects(() => client.listProjects(), SyntaxError);
});

Deno.test("a network error rejects with the fetch error", async () => {
  const client = noskillsClient.createNoskillsClient(
    { baseUrl: BASE_URL },
    () => Promise.reject(new TypeError("network unreachable")),
  );

  await assert.assertRejects(
    () => client.health(),
    TypeError,
    "network unreachable",
  );
});

// =============================================================================
// Time limits and cancellation
// =============================================================================

Deno.test("a call times out when the daemon never answers", async () => {
  const { client } = createClient({ timeoutMs: 20 }, neverAnswers);

  const error = await assert.assertRejects(
    () => client.health(),
    noskillsClient.NoskillsTimeoutError,
    "GET /api/health: the daemon did not answer within 20 ms",
  );

  assert.assertEquals(error.operation, "GET /api/health");
  assert.assertEquals(error.timeoutMs, 20);
  assert.assertEquals((error.cause as Error).name, "TimeoutError");
});

Deno.test("a call times out even when fetchFn ignores the signal", async () => {
  const { client } = createClient(
    { timeoutMs: 20 },
    () => new Promise<Response>(() => {}),
  );

  await assert.assertRejects(
    () => client.listProjects(),
    noskillsClient.NoskillsTimeoutError,
  );
});

Deno.test("timeoutMs on one call replaces the client's limit", async () => {
  const { client } = createClient({ timeoutMs: 60_000 }, neverAnswers);

  await assert.assertRejects(
    () => client.listSessions("app", { timeoutMs: 20 }),
    noskillsClient.NoskillsTimeoutError,
    "GET /api/projects/app/sessions",
  );
});

Deno.test("a call rejects with the caller's reason when its signal aborts", async () => {
  const { client, calls } = createClient({}, neverAnswers);
  const controller = new AbortController();
  const reason = new Error("user closed the page");

  const pending = client.createSession(
    "app",
    {},
    {
      signal: controller.signal,
    },
  );
  controller.abort(reason);

  assert.assertStrictEquals(
    await pending.catch((error: unknown) => error),
    reason,
  );
  assert.assertEquals(calls[0]?.signal?.aborted, true);
});

Deno.test("a call with an aborted signal does not wait for the daemon", async () => {
  const { client } = createClient({}, neverAnswers);
  const reason = new Error("cancelled before it started");

  assert.assertStrictEquals(
    await client
      .health({ signal: AbortSignal.abort(reason) })
      .catch((error: unknown) => error),
    reason,
  );
});

Deno.test("registerProject with a git URL waits longer than other calls", async () => {
  const { client } = createClient({ timeoutMs: 20 }, neverAnswers);
  const controller = new AbortController();
  const reason = new Error("stopped by the test");
  const timer = setTimeout(() => controller.abort(reason), 100);

  try {
    // The 20 ms client limit does not apply: only the caller's abort ends it.
    assert.assertStrictEquals(
      await client
        .registerProject(
          { git: "https://github.com/eser/stack.git" },
          { signal: controller.signal },
        )
        .catch((error: unknown) => error),
      reason,
    );
  } finally {
    clearTimeout(timer);
  }
});

const pathRegistrations: ReadonlyArray<{
  readonly name: string;
  readonly request: noskillsClient.RegisterProjectRequest;
}> = [
  { name: "a local path", request: { path: "/src/app" } },
  {
    name: "a path and a git URL, where the daemon uses the path",
    request: { path: "/src/app", git: "https://github.com/eser/stack.git" },
  },
];

for (const { name, request } of pathRegistrations) {
  Deno.test(`registerProject with ${name} keeps the client's limit`, async () => {
    const { client } = createClient({ timeoutMs: 20 }, neverAnswers);

    await assert.assertRejects(
      () => client.registerProject(request),
      noskillsClient.NoskillsTimeoutError,
      "POST /api/projects",
    );
  });
}

Deno.test("a timeoutMs that is not positive is refused before any request", async () => {
  const { client, calls } = createClient({ timeoutMs: 0 });

  await assert.assertRejects(
    () => client.health(),
    RangeError,
    "GET /api/health: timeoutMs 0 is not a positive number of milliseconds",
  );
  assert.assertEquals(calls.length, 0);
});
