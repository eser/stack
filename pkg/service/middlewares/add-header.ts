export const addHeaderMiddleware = (headers: Record<string, string>) => {
  // deno-lint-ignore no-explicit-any
  const addHeaderMiddlewarFn = async (ctx: any, next: any) => {
    for (const [key, value] of Object.entries(headers)) {
      ctx.response.headers.set(key, value);
    }

    await next();
  };

  return addHeaderMiddlewarFn;
};

export { addHeaderMiddleware as default };
