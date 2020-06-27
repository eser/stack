import { results, router, route } from "https://deno.land/x/hex/mod.ts";

const functions = {
  hello: (input, context) => {
    const message = `hello ${input.parameters.name}`;

    return results.text(message);
  },
};

const routes = router(
  route("GET", "/hello/:name", functions.hello),
);

export {
  routes as default,
};
