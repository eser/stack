import { djwt } from "../deps.ts";

const jwtMiddleware = (key?: CryptoKey, decodeOnly?: boolean) => {
  // deno-lint-ignore no-explicit-any
  const jwtMiddlewareFn = async (ctx: any, next: any) => {
    const authHeader = ctx.request.headers.get("Authorization");

    if (authHeader === null || !authHeader.startsWith("Bearer ")) {
      // ctx.response.status = 401;
      // ctx.response.body = { error: "Unauthorized" };

      await next();
      return;
    }

    const authToken = authHeader.slice(7);

    if (decodeOnly) {
      const payload = await djwt.decode(authToken);
      ctx.state.jwt = payload;
    } else {
      const payload = await djwt.verify(authToken, key ?? null);
      ctx.state.jwt = payload;
    }

    await next();
  };

  return jwtMiddlewareFn;
};

export { jwtMiddleware, jwtMiddleware as default };
