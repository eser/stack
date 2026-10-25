// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as fakeServer from "./fake-server.ts";

nodeTest.test("FakeServer should handle GET requests", async () => {
  const server = new fakeServer.FakeServer((req) => {
    return new Response(`Hello from ${req.url}`);
  });

  const response = await server.get("/api/test");
  const text = await response.text();

  assert.assertEquals(response.status, 200);
  assert.assertStringIncludes(text, "/api/test");
});

nodeTest.test("FakeServer should handle POST requests with body", async () => {
  const server = new fakeServer.FakeServer(async (req) => {
    const body = await req.text();
    return Response.json({ received: body });
  });

  const response = await server.post("/api/create", "test data");
  const json = await response.json();

  assert.assertEquals(response.status, 200);
  assert.assertEquals(json.received, "test data");
});

nodeTest.test("FakeServer should handle different HTTP methods", async () => {
  const methods: string[] = [];

  const server = new fakeServer.FakeServer((req) => {
    methods.push(req.method);
    return new Response("OK");
  });

  await server.get("/test");
  await server.post("/test");
  await server.put("/test");
  await server.patch("/test");
  await server.delete("/test");
  await server.head("/test");
  await server.options("/test");

  assert.assertEquals(methods, [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ]);
});

nodeTest.test("FakeServer should use custom base URL", async () => {
  const server = new fakeServer.FakeServer((req) => new Response(req.url), {
    baseUrl: "https://api.example.com",
  });

  const response = await server.get("/users");
  const url = await response.text();

  assert.assertEquals(url, "https://api.example.com/users");
});

nodeTest.test("FakeServer should handle headers", async () => {
  const server = new fakeServer.FakeServer((req) => {
    const auth = req.headers.get("Authorization");
    if (auth === "Bearer valid-token") {
      return Response.json({ authenticated: true });
    }
    return new Response("Unauthorized", { status: 401 });
  });

  const authResponse = await server.get("/protected", {
    Authorization: "Bearer valid-token",
  });
  assert.assertEquals(authResponse.status, 200);

  const unauthResponse = await server.get("/protected");
  assert.assertEquals(unauthResponse.status, 401);
});

nodeTest.test("FakeServer should handle async handlers", async () => {
  const server = new fakeServer.FakeServer(async (_req) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json({ delayed: true });
  });

  const response = await server.get("/async");
  const json = await response.json();

  assert.assertEquals(json.delayed, true);
});

nodeTest.test("FakeServer should handle JSON responses", async () => {
  const server = new fakeServer.FakeServer(() => {
    return Response.json({
      users: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
    });
  });

  const response = await server.get("/api/users");
  const data = await response.json();

  assert.assertEquals(data.users.length, 2);
  assert.assertEquals(data.users[0].name, "Alice");
});

nodeTest.test("FakeServer should handle 404 responses", async () => {
  const server = new fakeServer.FakeServer((req) => {
    if (req.url.endsWith("/exists")) {
      return new Response("Found");
    }
    return new Response("Not Found", { status: 404 });
  });

  const existsResponse = await server.get("/exists");
  assert.assertEquals(existsResponse.status, 200);

  const notFoundResponse = await server.get("/missing");
  assert.assertEquals(notFoundResponse.status, 404);
});

nodeTest.test("serveMiddleware should create FakeServer", async () => {
  const middleware = (req: Request) => {
    return new Response(`Handled ${req.method}`);
  };

  const server = fakeServer.serveMiddleware(middleware);
  const response = await server.get("/test");
  const text = await response.text();

  assert.assertEquals(text, "Handled GET");
});
