// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Middleware function type for HTTP request handling.
 *
 * @example
 * ```typescript
 * const myMiddleware: MiddlewareFn = async (req, next) => {
 *   console.log("Before request");
 *   const response = await next();
 *   console.log("After request");
 *   return response;
 * };
 * ```
 */
export type MiddlewareFn = (
  req: Request,
  next: () => Response | Promise<Response>,
) => Response | Promise<Response>;
