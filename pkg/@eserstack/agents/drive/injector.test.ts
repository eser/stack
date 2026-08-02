// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import type { AgentAdapter } from "../adapter.ts";
import { inject } from "./injector.ts";

const fakeAdapter = (bracketed: boolean): AgentAdapter => ({
  id: "x",
  displayName: "x",
  capabilities: {
    supportsBracketedPaste: bracketed,
    canDetectAwaitingInput: false,
    canDetectFinished: false,
  },
  resolveCommand: () => Promise.resolve("x"),
  buildSpawnSpec: () => Promise.resolve(null),
  detectState: (_v, p) => p,
  submitSequence: () => "\r",
});

Deno.test("inject wraps text in bracketed paste then submits", () => {
  const out: string[] = [];
  inject((d) => out.push(d), fakeAdapter(true), "hello");

  assertEquals(out, ["\x1b[200~hello\x1b[201~", "\r"]);
});

Deno.test("inject sends raw text when bracketed paste unsupported", () => {
  const out: string[] = [];
  inject((d) => out.push(d), fakeAdapter(false), "hello");

  assertEquals(out, ["hello", "\r"]);
});
