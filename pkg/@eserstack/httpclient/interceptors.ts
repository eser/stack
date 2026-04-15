// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Named interceptor chain for @eserstack/httpclient.
 *
 * Interceptors allow middleware-style transformation of requests and responses.
 * Named interceptors can be removed by name at runtime (useful for auth header
 * injection, logging, metrics, and testing).
 *
 * @module
 */

import type * as types from "./types.ts";

// =============================================================================
// InterceptorChain
// =============================================================================

/** Mutable, ordered list of named interceptors. */
export class InterceptorChain<T extends { name?: string }> {
  private readonly _interceptors: T[] = [];

  /** Append an interceptor to the end of the chain. */
  add(interceptor: T): this {
    this._interceptors.push(interceptor);
    return this;
  }

  /** Remove the first interceptor with the given name. Returns true if found. */
  remove(name: string): boolean {
    const index = this._interceptors.findIndex((i) => i.name === name);
    if (index === -1) return false;
    this._interceptors.splice(index, 1);
    return true;
  }

  /** Remove all interceptors. */
  clear(): this {
    this._interceptors.length = 0;
    return this;
  }

  get length(): number {
    return this._interceptors.length;
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this._interceptors[Symbol.iterator]();
  }
}

// =============================================================================
// Applicators
// =============================================================================

/** Apply request interceptors in order, each receiving the previous result. */
export const applyRequestInterceptors = async (
  request: Request,
  chain: ReadonlyArray<types.RequestInterceptor>,
): Promise<Request> => {
  let current = request;
  for (const interceptor of chain) {
    // deno-lint-ignore no-await-in-loop
    current = await interceptor.intercept(current);
  }
  return current;
};

/** Apply response interceptors in order, each receiving the previous result. */
export const applyResponseInterceptors = async <T>(
  response: types.HttpResponse<T>,
  chain: ReadonlyArray<types.ResponseInterceptor>,
): Promise<types.HttpResponse<T>> => {
  let current: types.HttpResponse<T> = response;
  for (const interceptor of chain) {
    // deno-lint-ignore no-await-in-loop
    current = (await interceptor.intercept(current)) as types.HttpResponse<T>;
  }
  return current;
};
