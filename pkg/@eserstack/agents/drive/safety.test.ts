// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import { createSafety, defaultSafetyPolicy } from "./safety.ts";

Deno.test("default policy is manual and blocks auto-responses", () => {
  const s = createSafety(defaultSafetyPolicy());
  assertEquals(s.gateAutoRespond("hi").allowed, false);
  // explicit sends are still allowed
  assertEquals(s.gateSend("hi").allowed, true);
});

Deno.test("git writes are vetoed unless allowed", () => {
  const blocked = createSafety({ ...defaultSafetyPolicy(), autonomy: "full" });
  assertEquals(blocked.gateSend("git push origin main").allowed, false);

  const allowed = createSafety({
    ...defaultSafetyPolicy(),
    allowGitWrites: true,
  });
  assertEquals(allowed.gateSend("git push origin main").allowed, true);
});

Deno.test("rate limit blocks after N injections in a minute", () => {
  let t = 1_000_000;
  const s = createSafety(
    {
      autonomy: "full",
      maxInjectionsPerMinute: 2,
      maxTotalInjections: 100,
      allowGitWrites: true,
    },
    { now: () => t },
  );

  assertEquals(s.gateSend("a").allowed, true);
  s.recordInjection("a");
  assertEquals(s.gateSend("b").allowed, true);
  s.recordInjection("b");
  assertEquals(s.gateSend("c").allowed, false); // 2/min reached

  // the rate-limit denial is marked retryable; the total cap is not
  assertEquals(s.gateSend("c").retryable, true);

  t += 61_000; // a minute later, window cleared
  assertEquals(s.gateSend("d").allowed, true);
});

Deno.test("total cap blocks regardless of rate", () => {
  let t = 0;
  const s = createSafety(
    {
      autonomy: "full",
      maxInjectionsPerMinute: 100,
      maxTotalInjections: 1,
      allowGitWrites: true,
    },
    { now: () => (t += 1000) },
  );

  s.recordInjection("a");
  assertEquals(s.gateSend("b").allowed, false);
});

Deno.test("audit sink receives sanitized entries", () => {
  const entries: string[] = [];
  const s = createSafety(
    {
      autonomy: "full",
      maxInjectionsPerMinute: 10,
      maxTotalInjections: 10,
      allowGitWrites: false,
    },
    { now: () => 1, audit: (e) => entries.push(`${e.kind}:${e.detail}`) },
  );

  s.gateSend("git push");
  s.gateSend("hello");
  assertEquals(entries.some((e) => e.startsWith("blocked:")), true);
  assertEquals(entries.some((e) => e === "send:hello"), true);
});
