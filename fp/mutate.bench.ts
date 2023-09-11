import { deno } from "$cool/deps.ts";
import { mutate } from "./mutate.ts";

const group = "mutate";

deno.bench("cool/fp/mutate", { group, baseline: true }, () => {
  const obj1 = {
    firstName: "Eser",
    lastName: "Ozvataf",
    aliases: [],
  };

  mutate(obj1, (x) => x.firstName = "Helo");
});

deno.bench("Object.assign", { group }, () => {
  const obj1 = {
    firstName: "Eser",
    lastName: "Ozvataf",
    aliases: [],
  };

  Object.assign({}, obj1, { firstName: "Helo" });
});

deno.bench("spread operator", { group }, () => {
  const obj1 = {
    firstName: "Eser",
    lastName: "Ozvataf",
    aliases: [],
  };

  ({ ...obj1, firstName: "Helo" });
});
