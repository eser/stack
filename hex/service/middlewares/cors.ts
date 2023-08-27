export const corsMiddleware = () => {
  // deno-lint-ignore no-explicit-any
  const corsMiddlewarFn = async (ctx: any, next: any) => {
    ctx.response.headers.set("Access-Control-Allow-Origin", "*");

    await next();
  };

  return corsMiddlewarFn;
};

export { corsMiddleware as default };
