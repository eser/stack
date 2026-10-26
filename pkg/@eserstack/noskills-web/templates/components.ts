// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Reusable HTML fragments.
 *
 * @module
 */

import type * as dashboard from "@eserstack/noskills/dashboard";
import * as escape from "./escape.ts";

// =============================================================================
// Phase badge
// =============================================================================

const PHASE_COLORS: Record<string, string> = {
  IDLE: "#6b7280",
  DISCOVERY: "#06b6d4",
  DISCOVERY_REFINEMENT: "#06b6d4",
  SPEC_PROPOSAL: "#eab308",
  SPEC_APPROVED: "#eab308",
  EXECUTING: "#22c55e",
  BLOCKED: "#ef4444",
  COMPLETED: "#6b7280",
};

export const phaseBadge = (phase: string): string => {
  const color = PHASE_COLORS[phase] ?? "#6b7280";
  const label = phase
    .replace("DISCOVERY_REFINEMENT", "REFINEMENT")
    .replace("SPEC_PROPOSAL", "PROPOSAL")
    .replace("SPEC_APPROVED", "APPROVED");
  return `<span class="phase-badge" style="background:${color}">${escape.escHtml(
    label,
  )}</span>`;
};

// =============================================================================
// Spec list item
// =============================================================================

export const specListItem = (
  spec: dashboard.SpecSummary,
  isActive: boolean,
): string => {
  const active = isActive ? " active" : "";
  const done = spec.tasks.filter((t) => t.done).length;
  const total = spec.tasks.length;
  const progress =
    total > 0 ? `<span class="task-progress">${done}/${total}</span>` : "";

  return `<a href="/spec/${escape.escHtml(
    spec.slug,
  )}" class="spec-item${active}">
    <span class="spec-name">${escape.escHtml(spec.name)}</span>
    ${phaseBadge(spec.phase)}
    ${progress}
  </a>`;
};

// =============================================================================
// Tab bar
// =============================================================================

export type TabInfo = {
  readonly id: string;
  readonly specName: string | null;
  readonly phase: string | null;
};

export const tabBar = (
  tabs: readonly TabInfo[],
  activeTabId: string | null,
): string => {
  const items = tabs
    .map((t, i) => {
      const active = t.id === activeTabId ? " active" : "";
      const phase =
        t.phase !== null && t.phase !== ""
          ? ` (${escape.escHtml(t.phase)})`
          : "";
      const label =
        t.specName !== null ? `${escape.escHtml(t.specName)}${phase}` : "IDLE";
      // Two sibling buttons per tab, so each is reachable by keyboard: a
      // button inside a button is invalid HTML and cannot take focus.
      // data-index drives the client's gotoTab so SSR tabs are switchable before
      // the /mux socket re-renders the bar (mux-render.js renders the same
      // markup).
      return `<div class="tab${active}" data-tab="${escape.escHtml(
        t.id,
      )}"><button type="button" class="tab-select" data-index="${i}">${label}</button><button type="button" class="tab-close" data-close="${escape.escHtml(
        t.id,
      )}" aria-label="Close ${label}">&times;</button></div>`;
    })
    .join("");

  return `<div class="tab-bar">${items}<button type="button" class="tab-add" id="add-tab" aria-label="New tab">+</button></div>`;
};

// =============================================================================
// CTA buttons
// =============================================================================

export const ctaButton = (
  label: string,
  specName: string,
  action: string,
  extraData?: Record<string, string>,
): string => {
  const dataAttrs =
    extraData === undefined
      ? ""
      : Object.entries(extraData)
          .map(([k, v]) => `data-${k}="${escape.escHtml(v)}"`)
          .join(" ");
  return `<button class="cta-btn" data-spec="${escape.escHtml(
    specName,
  )}" data-action="${escape.escHtml(action)}" ${dataAttrs}>${escape.escHtml(
    label,
  )}</button>`;
};

// =============================================================================
// Pending items
// =============================================================================

export const pendingMentions = (
  mentions: readonly dashboard.Mention[],
): string => {
  if (mentions.length === 0) return "";
  const items = mentions
    .map(
      (m) =>
        `<div class="mention-item">
      <span class="mention-from">${escape.escHtml(
        m.from,
      )}</span> asks about <strong>${escape.escHtml(m.spec)}</strong>:
      <p>${escape.escHtml(m.question)}</p>
      <button class="cta-btn small" data-spec="${escape.escHtml(
        m.spec,
      )}" data-action="reply" data-mention-id="${escape.escHtml(
        m.id,
      )}">Reply</button>
    </div>`,
    )
    .join("");
  return `<div class="pending-section"><h3>Pending Mentions (${mentions.length})</h3>${items}</div>`;
};

// =============================================================================
// Terminal container
// =============================================================================

// The mux frontend (client.js) fills this container with one xterm.js per pane,
// positioned from the scene geometry it receives over the /mux WebSocket. It is
// always rendered (even with no tabs) so the browser has a mount point; an empty
// multiplexer just shows a black canvas plus the "+" in the tab bar.
export const terminalContainer = (): string =>
  `<div class="terminal-container" id="terminal-container"></div>`;
