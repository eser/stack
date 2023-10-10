import { deno } from "../deps.ts";
import { wth } from "./wth.ts";

const group = "wth";

deno.bench("cool/fp/wth", { group, baseline: true }, () => {
  wth({ a: 1 }, { b: 2 });
});

deno.bench("spread operator", { group }, () => {
  const instance = { a: 1 };
  const mapping = { b: 2 };

  const _withResult = { ...instance, ...mapping };
});
