// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Safety policy for autonomous driving: autonomy levels, rate limiting, a hard
 * cap, a git-write veto (reusing the shared guard), and a sanitized audit log.
 *
 * Default autonomy is "manual" — the loop never auto-answers prompts, so wiring
 * a driving loop with defaults is behaviourally identical to plain passthrough.
 *
 * @module
 */

import { hasGitWrite } from "../guards/git.ts";

export type Autonomy = "manual" | "assisted" | "full";

export type SafetyPolicy = {
  readonly autonomy: Autonomy;
  readonly maxInjectionsPerMinute: number;
  readonly maxTotalInjections: number;
  readonly allowGitWrites: boolean;
};

export const defaultSafetyPolicy = (): SafetyPolicy => ({
  autonomy: "manual",
  maxInjectionsPerMinute: 10,
  maxTotalInjections: 100,
  allowGitWrites: false,
});

export type AuditEntry = {
  readonly at: number;
  readonly kind: "send" | "blocked" | "injected";
  readonly detail: string;
};

export type GateResult = {
  readonly allowed: boolean;
  readonly reason?: string;
  /** True when the denial is temporary (e.g. rate limit) and worth retrying. */
  readonly retryable?: boolean;
};

/** Truncate a message for events/audit so we don't echo long/secret content. */
export const previewMessage = (m: string): string =>
  m.length > 40 ? m.slice(0, 40) + "…" : m;

export type Safety = {
  /** Gate an explicit, user-queued message. */
  gateSend(message: string): GateResult;
  /** Gate an auto-reply to an awaiting-input prompt (blocked unless autonomy permits). */
  gateAutoRespond(message: string): GateResult;
  /** Record that an injection actually happened (advances rate/total counters). */
  recordInjection(message: string): void;
};

export type SafetyOptions = {
  readonly now?: () => number;
  readonly audit?: (entry: AuditEntry) => void;
};

export const createSafety = (
  policy: SafetyPolicy,
  opts: SafetyOptions = {},
): Safety => {
  const now = opts.now ?? (() => Date.now());
  const audit = opts.audit ?? (() => {});
  const timestamps: number[] = [];
  let total = 0;

  const block = (reason: string, retryable = false): GateResult => {
    audit({ at: now(), kind: "blocked", detail: reason });

    return { allowed: false, reason, retryable };
  };

  const checkLimits = (): GateResult => {
    if (total >= policy.maxTotalInjections) {
      return block("max total injections reached"); // permanent
    }

    // Prune entries outside the window so the array stays bounded and counting
    // is O(window), not O(history).
    const cutoff = now() - 60_000;
    while (timestamps.length > 0 && timestamps[0]! < cutoff) timestamps.shift();

    if (timestamps.length >= policy.maxInjectionsPerMinute) {
      return block("injection rate limit exceeded", true); // retry once window clears
    }

    return { allowed: true };
  };

  const gateSend = (message: string): GateResult => {
    if (!policy.allowGitWrites && hasGitWrite(message)) {
      return block("git write blocked by safety policy");
    }

    const limits = checkLimits();
    if (!limits.allowed) return limits;

    audit({ at: now(), kind: "send", detail: previewMessage(message) });

    return { allowed: true };
  };

  return {
    gateSend,
    gateAutoRespond(message: string): GateResult {
      if (policy.autonomy === "manual") {
        return block("autonomy is manual; auto-response disabled");
      }

      return gateSend(message);
    },
    recordInjection(message: string): void {
      const t = now();
      timestamps.push(t);
      total += 1;
      audit({ at: t, kind: "injected", detail: previewMessage(message) });
    },
  };
};
