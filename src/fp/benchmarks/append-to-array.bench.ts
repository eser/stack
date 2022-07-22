import appendToArray from "../append-to-array.ts";

const group = "append-to-array";

Deno.bench("hex/fp/append-to-array:basic", { group }, () => {
  const arr1 = ["a", "b"];

  appendToArray(arr1, "c");
});

Deno.bench("spread operator", { group }, () => {
  const arr1 = ["a", "b"];

  [...arr1, "c"];
});
