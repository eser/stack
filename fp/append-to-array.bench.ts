import { deno } from "../deps.ts";
import { appendToArray } from "./append-to-array.ts";

const group = "append-to-array";

deno.bench("cool/fp/append-to-array", { group, baseline: true }, () => {
  const arr1 = ["a", "b"];

  appendToArray(arr1, "c");
});

deno.bench("spread operator", { group }, () => {
  const arr1 = ["a", "b"];

  [...arr1, "c"];
});
