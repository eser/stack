// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertFalse } from "@std/assert";
import * as interceptorsModule from "./interceptors.ts";
import type * as types from "./types.ts";

describe("InterceptorChain", () => {
  it("should start empty", () => {
    const chain = new interceptorsModule.InterceptorChain<
      types.RequestInterceptor
    >();
    assertEquals(chain.length, 0);
  });

  it("should add interceptors and update length", () => {
    const chain = new interceptorsModule.InterceptorChain<
      types.RequestInterceptor
    >();
    chain.add({ name: "auth", intercept: (r) => r });
    chain.add({ name: "logger", intercept: (r) => r });
    assertEquals(chain.length, 2);
  });

  it("should remove interceptor by name and return true", () => {
    const chain = new interceptorsModule.InterceptorChain<
      types.RequestInterceptor
    >();
    chain.add({ name: "auth", intercept: (r) => r });
    chain.add({ name: "logger", intercept: (r) => r });
    const removed = chain.remove("auth");
    assertEquals(removed, true);
    assertEquals(chain.length, 1);
  });

  it("should return false when removing non-existent interceptor", () => {
    const chain = new interceptorsModule.InterceptorChain<
      types.RequestInterceptor
    >();
    assertFalse(chain.remove("nonexistent"));
  });

  it("should clear all interceptors", () => {
    const chain = new interceptorsModule.InterceptorChain<
      types.RequestInterceptor
    >();
    chain.add({ name: "a", intercept: (r) => r });
    chain.add({ name: "b", intercept: (r) => r });
    chain.clear();
    assertEquals(chain.length, 0);
  });

  it("should be iterable", () => {
    const chain = new interceptorsModule.InterceptorChain<
      types.RequestInterceptor
    >();
    const i1 = { name: "a", intercept: (r: Request) => r };
    const i2 = { name: "b", intercept: (r: Request) => r };
    chain.add(i1).add(i2);
    const items = [...chain];
    assertEquals(items.length, 2);
    assertEquals(items[0], i1);
    assertEquals(items[1], i2);
  });

  it("should return this from add() and clear() for chaining", () => {
    const chain = new interceptorsModule.InterceptorChain<
      types.RequestInterceptor
    >();
    const result = chain.add({ name: "x", intercept: (r) => r });
    assertEquals(result, chain);
    const result2 = chain.clear();
    assertEquals(result2, chain);
  });
});

describe("applyRequestInterceptors", () => {
  it("should return original request when chain is empty", async () => {
    const req = new Request("https://example.com/");
    const result = await interceptorsModule.applyRequestInterceptors(req, []);
    assertEquals(result, req);
  });

  it("should apply interceptors in order", async () => {
    const log: string[] = [];
    const chain: types.RequestInterceptor[] = [
      {
        name: "first",
        intercept: (r) => {
          log.push("first");
          return r;
        },
      },
      {
        name: "second",
        intercept: (r) => {
          log.push("second");
          return r;
        },
      },
    ];
    const req = new Request("https://example.com/");
    await interceptorsModule.applyRequestInterceptors(req, chain);
    assertEquals(log, ["first", "second"]);
  });

  it("should pass modified request to next interceptor", async () => {
    const chain: types.RequestInterceptor[] = [
      {
        name: "add-header",
        intercept: (r) =>
          new Request(r, {
            headers: { ...Object.fromEntries(r.headers), "X-Test": "yes" },
          }),
      },
      {
        name: "check-header",
        intercept: (r) => {
          assertEquals(r.headers.get("X-Test"), "yes");
          return r;
        },
      },
    ];
    const req = new Request("https://example.com/");
    await interceptorsModule.applyRequestInterceptors(req, chain);
  });
});

describe("applyResponseInterceptors", () => {
  it("should return original response when chain is empty", async () => {
    const resp: types.HttpResponse<string> = {
      data: "hello",
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      request: new Request("https://example.com/"),
      raw: new Response("hello"),
      retries: 0,
    };
    const result = await interceptorsModule.applyResponseInterceptors(resp, []);
    assertEquals(result, resp);
  });

  it("should apply response interceptors in order", async () => {
    const log: number[] = [];
    const chain: types.ResponseInterceptor[] = [
      {
        name: "first",
        intercept: (r) => {
          log.push(1);
          return r;
        },
      },
      {
        name: "second",
        intercept: (r) => {
          log.push(2);
          return r;
        },
      },
    ];
    const resp: types.HttpResponse<null> = {
      data: null,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      request: new Request("https://example.com/"),
      raw: new Response(),
      retries: 0,
    };
    await interceptorsModule.applyResponseInterceptors(resp, chain);
    assertEquals(log, [1, 2]);
  });
});
