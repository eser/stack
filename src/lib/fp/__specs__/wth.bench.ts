import { wth } from "../wth.ts";

const group = "wth";

Deno.bench("hex/fp/wth", { group, baseline: true }, () => {
  wth({ a: 1 }, { b: 2 });
});

Deno.bench("spread operator", { group }, () => {
  const instance = { a: 1 };
  const mapping = { b: 2 };

  const _withResult = { ...instance, ...mapping };
});
