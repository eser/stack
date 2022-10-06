import { djwt } from "../deps.ts";

const jwtMiddleware = (key?: CryptoKey) => {
  // deno-lint-ignore no-explicit-any
  const jwtMiddlewareFn = async (ctx: any, next: any) => {
    const authHeader = ctx.request.headers.get("Authorization");

    if (authHeader === undefined || !authHeader.startsWith("Bearer ")) {
      // ctx.response.status = 401;
      // ctx.response.body = { error: "Unauthorized" };

      return;
    }

    const authToken = authHeader.slice(7);

    const payload = await djwt.verify(authToken, key ?? null);
    ctx.state.jwt = payload;

    await next();
  };

  return jwtMiddlewareFn;
};

export { jwtMiddleware, jwtMiddleware as default };
