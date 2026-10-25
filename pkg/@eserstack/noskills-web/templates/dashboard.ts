// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Dashboard view — main page mirroring TUI layout.
 *
 * @module
 */

import type * as dashboard from "@eserstack/noskills/dashboard";
import * as layout from "./layout.ts";
import * as components from "./components.ts";

export const renderDashboard = (
  state: dashboard.DashboardState,
  tabs: readonly components.TabInfo[],
  activeTabId: string | null,
  token?: string,
): string => {
  // Spec list
  const specItems =
    state.specs.length > 0
      ? state.specs
          .map((s) =>
            components.specListItem(s, state.activeSpec?.slug === s.slug),
          )
          .join("")
      : '<div class="empty-state">No specs yet. Create one from the terminal.</div>';

  // Pending items
  const pending = components.pendingMentions(state.pendingMentions);

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
      ${components.tabBar(tabs, activeTabId)}
      ${components.terminalContainer()}
    </main>
  </div>`;

  return layout.layout("noskills", body, { includeTerminal: true, token });
};
