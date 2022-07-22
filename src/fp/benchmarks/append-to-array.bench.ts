import appendToArray from "../append-to-array.ts";

Deno.bench("hex/fp/append-to-array:basic", () => {
  const arr1 = ["a", "b"];

  appendToArray(arr1, "c");
});

Deno.bench("spread operator", () => {
  const arr1 = ["a", "b"];

  [...arr1, "c"];
});
