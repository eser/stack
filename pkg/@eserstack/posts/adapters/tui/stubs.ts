// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Noop stub implementations for optional outbound ports.
 * Use at the composition root when the real adapter is not configured.
 * All write operations reject with an actionable message; reads return empty.
 */

import * as results from "@eserstack/primitives/results";
import type { ScheduledPost, Scheduler } from "../../application/scheduler.ts";
import type { Translator } from "../../application/translator.ts";

/** Translator stub — returns Fail with a helpful message when ANTHROPIC_API_KEY is absent. */
export const noopTranslator: Translator = {
  translate(
    _params: { text: string; from: string; to: string },
  ) {
    return Promise.resolve(
      results.fail(
        new Error(
          "Translator not configured. Set ANTHROPIC_API_KEY to enable translation.",
        ),
      ),
    );
  },
};

/** Scheduler stub — listPending returns empty; all writes reject. */
export const noopScheduler: Scheduler = {
  schedule(
    _params: { text: string; scheduledAt: Date },
  ): Promise<{ id: string }> {
    return Promise.reject(new Error("Scheduler not configured."));
  },
  cancel(_id: string): Promise<void> {
    return Promise.reject(new Error("Scheduler not configured."));
  },
  listPending(): Promise<ScheduledPost[]> {
    return Promise.resolve([]);
  },
};
