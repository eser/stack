import { mutate } from "../mutate.ts";

const group = "mutate";

Deno.bench("cool/hex/fp/mutate", { group, baseline: true }, () => {
  const obj1 = {
    firstName: "Eser",
    lastName: "Ozvataf",
    aliases: [],
  };

  mutate(obj1, (x) => x.firstName = "Helo");
});

Deno.bench("Object.assign", { group }, () => {
  const obj1 = {
    firstName: "Eser",
    lastName: "Ozvataf",
    aliases: [],
  };

  Object.assign({}, obj1, { firstName: "Helo" });
});

Deno.bench("spread operator", { group }, () => {
  const obj1 = {
    firstName: "Eser",
    lastName: "Ozvataf",
    aliases: [],
  };

  ({ ...obj1, firstName: "Helo" });
});
