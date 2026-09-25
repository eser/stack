// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import {
  createRateLimiter,
  getClientIp,
  UNKNOWN_CLIENT,
} from "./rate-limiter.ts";

const req = (headers: Record<string, string> = {}): Request =>
  new Request("http://localhost/", { headers });

const peer = (hostname: string) => ({ hostname });

Deno.test("getClientIp uses the socket peer and ignores client headers by default", () => {
  assertEquals(
    getClientIp(
      req({ "x-forwarded-for": "127.0.0.1" }),
      false,
      peer("203.0.113.9"),
    ),
    "203.0.113.9",
  );
  assertEquals(
    getClientIp(req(), false, peer("::ffff:198.51.100.7")),
    "198.51.100.7",
  );
  assertEquals(
    getClientIp(req({ "x-forwarded-for": "1.2.3.4" })),
    UNKNOWN_CLIENT,
  );
});

Deno.test("getClientIp believes forwarded headers only from a trusted proxy", () => {
  const spoof = req({ "x-forwarded-for": "127.0.0.1" });
  assertEquals(getClientIp(spoof, true, peer("203.0.113.9")), "203.0.113.9");

  const viaProxy = req({ "x-forwarded-for": "127.0.0.1, 198.51.100.7" });
  assertEquals(getClientIp(viaProxy, true, peer("127.0.0.1")), "198.51.100.7");

  const chain = req({ "x-forwarded-for": "198.51.100.7, 10.0.0.2" });
  assertEquals(
    getClientIp(chain, true, peer("10.0.0.1"), ["10.0.0.1", "10.0.0.2"]),
    "198.51.100.7",
  );
});

Deno.test("direct clients never share one bucket", () => {
  const limiter = createRateLimiter({ maxRequests: 2, windowMs: 60_000 });
  try {
    for (let i = 0; i < 5; i++) limiter.check(req(), "/", peer("203.0.113.1"));
    assertEquals(limiter.check(req(), "/", peer("203.0.113.1"))?.status, 429);
    assertEquals(limiter.check(req(), "/", peer("203.0.113.2")), null);

    // Requests with no identity are not pooled into a shared "unknown" key.
    for (let i = 0; i < 5; i++) assertEquals(limiter.check(req(), "/"), null);
  } finally {
    limiter.stop();
  }
});

Deno.test("a forged loopback X-Forwarded-For does not exempt a remote client", () => {
  const limiter = createRateLimiter({
    maxRequests: 2,
    windowMs: 60_000,
    trustProxy: true,
  });
  try {
    const forged = req({ "x-forwarded-for": "127.0.0.1" });
    const statuses = Array.from(
      { length: 5 },
      () => limiter.check(forged, "/", peer("203.0.113.9"))?.status ?? 200,
    );
    assertEquals(statuses, [200, 200, 429, 429, 429]);

    // Rotating forged values from the same peer still hits the same bucket.
    const rotated = limiter.check(
      req({ "x-forwarded-for": "198.51.100.200" }),
      "/",
      peer("203.0.113.9"),
    );
    assertEquals(rotated?.status, 429);
  } finally {
    limiter.stop();
  }
});
