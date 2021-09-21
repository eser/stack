import { asserts } from "./deps.ts";
import emitter, { LogType } from "../emitter.ts";

Deno.test("hex/fp/emitter:basic", async () => {
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

  await emitter(events, "calculate");

  asserts.assertEquals(sideEffectCounter, 3);
});

Deno.test("hex/fp/emitter:many events", async () => {
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

  await emitter(events, "add");
  await emitter(events, "sub");

  asserts.assertEquals(sideEffectCounter, 2);
});


Deno.test("hex/fp/emitter:with wildcard events", async () => {
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

  await emitter(events, "*");

  asserts.assertEquals(sideEffectCounter, -1);
});

Deno.test("hex/fp/emitter:with parameters", async () => {
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

  await emitter(events, "calculate", [5]);

  asserts.assertEquals(sideEffectCounter, 15);
});

Deno.test("hex/fp/emitter:with subscriber", async () => {
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

  await emitter(events, "calculate", [5], [logger]);

  asserts.assertEquals(sideEffectCounter, 15);
  asserts.assertEquals(logs, [
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
