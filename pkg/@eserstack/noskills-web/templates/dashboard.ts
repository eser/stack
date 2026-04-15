// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Dashboard view — main page mirroring TUI layout.
 *
 * @module
 */

import type * as dashboard from "@eserstack/noskills/dashboard";
import { layout } from "./layout.ts";
import * as c from "./components.ts";
import type { TabInfo } from "./components.ts";

export const renderDashboard = (
  state: dashboard.DashboardState,
  tabs: readonly TabInfo[],
  activeTabId: string | null,
): string => {
  // Spec list
  const specItems = state.specs.length > 0
    ? state.specs.map((s) =>
      c.specListItem(s, state.activeSpec?.slug === s.slug)
    ).join("")
    : '<div class="empty-state">No specs yet. Create one from the terminal.</div>';

  // Pending items
  const pending = c.pendingMentions(state.pendingMentions);

  const body = `
  <div class="dashboard">
    <aside class="sidebar">
      <div class="spec-list">
        <h2>Specs</h2>
        ${specItems}
      </div>
      ${pending}
    </aside>
    <main class="main-area">
      ${c.tabBar(tabs, activeTabId)}
      ${c.terminalContainer(activeTabId)}
    </main>
  </div>`;

  return layout("noskills", body, { includeTerminal: true });
};
