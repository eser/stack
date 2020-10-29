import { results, router, route } from "../../../src/functions/mod.ts";

const functions = {
  hello: (input) => {
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
