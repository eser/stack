import deepCopy from "../deep-copy.ts";

class Dummy {
  prop: unknown;

  constructor(prop: unknown) {
    this.prop = prop;
  }
}

Deno.bench("hex/fp/deep-copy:basic", () => {
  const obj1 = new Dummy({ value: 5 });

  deepCopy(obj1);
});

Deno.bench("structuredClone", () => {
  const obj1 = new Dummy({ value: 5 });

  structuredClone(obj1);
});
