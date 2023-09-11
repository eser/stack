import { wthout } from "./wthout.ts";
import lodashReject from "npm:lodash.reject";

const group = "wthout";

Deno.bench("cool/fp/wthout", { group, baseline: true }, () => {
  const student = {
    id: 1,
    name: "John Doe",
    age: 20,
    address: "New York",
  };

  wthout(student, "name", "age");
});

Deno.bench("npm:lodash.reject", { group }, () => {
  const student = {
    id: 1,
    name: "John Doe",
    age: 20,
    address: "New York",
  };

  lodashReject(student, "name", "age");
});
