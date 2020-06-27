import { results, router, route } from "https://deno.land/x/hex-functions/mod.ts";

const functions = {
  hello: (input: any, context: any) => {
    const message = `hello ${input.parameters.name}`;

    return results.text(message);
  },
}

const routes = router(
    route('GET', '/hello/:name', functions.hello),
);

export {
    routes as default,
};
