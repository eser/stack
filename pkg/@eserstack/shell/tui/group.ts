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
 * import * as shell from "@eserstack/shell";
 *
 * const ctx = shell.tui.createTuiContext();
 * const result = await shell.tui.group(ctx, {
 *   name: () => shell.tui.text(ctx, { message: "Name?" }),
 *   framework: ({ results }) =>
 *     shell.tui.select(ctx, {
 *       message: `Framework for ${results["name"]}?`,
 *       options: [{ value: "next", label: "Next.js" }],
 *     }),
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
    // Prompts run in order: each one sees the answers before it and a cancel
    // stops the rest.
    // deno-lint-ignore no-await-in-loop
    const value = await promptFn({ results });

    if (value === types.CANCEL) {
      options?.onCancel?.();
      return types.CANCEL;
    }

    results[key] = value;
  }

  return results as T;
};
