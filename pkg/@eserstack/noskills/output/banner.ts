// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Post-init onboarding banner — shown after `noskills init` when no active spec exists.
 *
 * @module
 */

import * as tui from "@eserstack/shell/tui";

export const renderOnboardingBanner = (
  ctx: tui.TuiContext,
  config: { concernCount: number; toolCount: number },
): void => {
  const count = String(config.concernCount).padStart(2);

  tui.gapDetached(ctx);
  tui.messageDetached(ctx, "✔ noskills is ready");
  tui.gapDetached(ctx);
  tui.messageDetached(ctx, "  Your project has:");
  tui.messageDetached(ctx, `    • ${count} active concerns shaping every spec`);
  tui.messageDetached(ctx, "    • Hooks enforcing quality gates");
  if (config.toolCount > 0) {
    tui.messageDetached(ctx, "    • Rules synced to your coding tools");
  }
  tui.gapDetached(ctx);
  tui.messageDetached(ctx, "  To start your first spec:");
  tui.messageDetached(ctx, "    1. Switch to PLAN MODE in your coding tool");
  tui.messageDetached(ctx, "       (Claude Code: Shift+Tab twice)");
  tui.messageDetached(ctx, "    2. Describe what you want to build");
  tui.messageDetached(ctx, "    3. noskills will guide you through discovery");
  tui.gapDetached(ctx);
  tui.messageDetached(
    ctx,
    '  Or just type: noskills spec new "your feature description"',
  );
};
