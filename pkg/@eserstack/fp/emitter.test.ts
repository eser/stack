// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as emitter from "./emitter.ts";
import type { LogType } from "./emitter.ts";

nodeTest.test("basic", async () => {
  let sideEffectCounter = 0;

  const subscriberOne = () => {
    sideEffectCounter += 1;
  };
  const subscriberTwo = () => {
    sideEffectCounter += 2;
  };

  const events = {
    calculate: [subscriberOne, subscriberTwo],
  };

  await emitter.emitter(events, "calculate");

  assert.assertEquals(sideEffectCounter, 3);
});

nodeTest.test("many events", async () => {
  let sideEffectCounter = 0;

  const subscriberAddOne = () => {
    sideEffectCounter += 1;
  };
  const subscriberAddTwo = () => {
    sideEffectCounter += 2;
  };
  const subscriberSubOne = () => {
    sideEffectCounter -= 1;
  };

  const events = {
    add: [subscriberAddOne, subscriberAddTwo],
    sub: [subscriberSubOne],
  };

  await emitter.emitter(events, "add");
  await emitter.emitter(events, "sub");

  assert.assertEquals(sideEffectCounter, 2);
});

nodeTest.test("wildcard events", async () => {
  let sideEffectCounter = 0;

  const subscriberOne = () => {
    sideEffectCounter += 1;
  };
  const subscriberTwo = () => {
    sideEffectCounter -= 2;
  };

  const events = {
    inc: [subscriberOne],
    dec: [subscriberTwo],
  };

  await emitter.emitter(events, "*");

  assert.assertEquals(sideEffectCounter, -1);
});

nodeTest.test("parameters", async () => {
  let sideEffectCounter = 0;

  const subscriberOne = (value: number) => {
    sideEffectCounter += value;
  };
  const subscriberTwo = (value: number) => {
    sideEffectCounter += value * 2;
  };

  const events = {
    calculate: [subscriberOne, subscriberTwo],
  };

  await emitter.emitter(events, "calculate", [5]);

  assert.assertEquals(sideEffectCounter, 15);
});

nodeTest.test("subscribers", async () => {
  let sideEffectCounter = 0;

  const subscriberOne = (value: number) => {
    sideEffectCounter += value;
  };
  const subscriberTwo = (value: number) => {
    sideEffectCounter += value * 2;
  };

  const events = {
    calculate: [subscriberOne, subscriberTwo],
  };

  const logs: Array<LogType> = [];
  const logger = (entry: LogType) => logs.push(entry);

  await emitter.emitter(events, "calculate", [5], [logger]);

  assert.assertEquals(sideEffectCounter, 15);
  assert.assertEquals(logs, [
    {
      event: "calculate",
      subscriber: "subscriberOne",
      args: [5],
    },
    {
      event: "calculate",
      subscriber: "subscriberTwo",
      args: [5],
    },
  ]);
});
