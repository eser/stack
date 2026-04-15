// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Group multiple prompts into a sequential flow.
 *
 * If any prompt returns `CANCEL`, the `onCancel` callback is invoked
 * and the entire group returns `CANCEL`.
 *
 * @module
 */

import * as types from "./types.ts";

type PromptFn<T> = (
  opts: { results: Record<string, unknown> },
) => Promise<T | types.Cancel>;

/**
 * Run a sequence of prompts, collecting results into an object.
 *
 * @example
 * ```typescript
 * const result = await group(ctx, {
 *   name: () => text(ctx, { message: "Name?" }),
 *   framework: ({ results }) =>
 *     select(ctx, { message: `Framework for ${results.name}?`, options: [...] }),
 * });
 * ```
 */
export const group = async <T extends Record<string, unknown>>(
  _ctx: types.TuiContext,
  prompts: { [K in keyof T]: PromptFn<T[K]> },
  options?: types.GroupOptions,
): Promise<T | types.Cancel> => {
  const results: Record<string, unknown> = {};

  for (const key of Object.keys(prompts)) {
    const promptFn = prompts[key as keyof T] as PromptFn<unknown>;
    const value = await promptFn({ results });

    if (value === types.CANCEL) {
      options?.onCancel?.();
      return types.CANCEL;
    }

    results[key] = value;
  }

  return results as T;
};
