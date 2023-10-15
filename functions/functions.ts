import { type Result, type ResultAsyncGen } from "./results.ts";

// deno-lint-ignore no-explicit-any
export type Fn<T = any> = (
  ctx?: Context<T>,
  // deno-lint-ignore no-explicit-any
  ...args: any[]
) => Result<T>;

export type NextFn<T> = (
  newContext?: Context<T>,
) => ResultAsyncGen<T>;

export interface Context<T> {
  next?: NextFn<T>;
  [key: string | number | symbol]: unknown;
}
