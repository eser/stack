// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Reusable HTML fragments.
 *
 * @module
 */

import type * as dashboard from "@eser/noskills/dashboard";

const escHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// =============================================================================
// Phase badge
// =============================================================================

const PHASE_COLORS: Record<string, string> = {
  IDLE: "#6b7280",
  DISCOVERY: "#06b6d4",
  DISCOVERY_REVIEW: "#06b6d4",
  SPEC_DRAFT: "#eab308",
  SPEC_APPROVED: "#eab308",
  EXECUTING: "#22c55e",
  BLOCKED: "#ef4444",
  COMPLETED: "#6b7280",
};

export const phaseBadge = (phase: string): string => {
  const color = PHASE_COLORS[phase] ?? "#6b7280";
  const label = phase.replace("DISCOVERY_REVIEW", "REVIEW")
    .replace("SPEC_DRAFT", "DRAFT")
    .replace("SPEC_APPROVED", "APPROVED")
    .replace("COMPLETED", "DONE");
  return `<span class="phase-badge" style="background:${color}">${
    escHtml(label)
  }</span>`;
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
  const progress = total > 0
    ? `<span class="task-progress">${done}/${total}</span>`
    : "";

  return `<a href="/spec/${escHtml(spec.slug)}" class="spec-item${active}">
    <span class="spec-name">${escHtml(spec.name)}</span>
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
  const items = tabs.map((t) => {
    const active = t.id === activeTabId ? " active" : "";
    const label = t.specName !== null
      ? `${escHtml(t.specName)}${t.phase ? ` (${t.phase})` : ""}`
      : "IDLE";
    return `<button class="tab${active}" data-tab="${
      escHtml(t.id)
    }">${label}<span class="tab-close" data-close="${
      escHtml(t.id)
    }">&times;</span></button>`;
  }).join("");

  return `<div class="tab-bar">${items}<button class="tab-add" id="add-tab">+</button></div>`;
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
  const dataAttrs = Object.entries(extraData ?? {})
    .map(([k, v]) => `data-${k}="${escHtml(v)}"`)
    .join(" ");
  return `<button class="cta-btn" data-spec="${
    escHtml(specName)
  }" data-action="${escHtml(action)}" ${dataAttrs}>${escHtml(label)}</button>`;
};

// =============================================================================
// Pending items
// =============================================================================

export const pendingMentions = (
  mentions: readonly dashboard.Mention[],
): string => {
  if (mentions.length === 0) return "";
  const items = mentions.map((m) =>
    `<div class="mention-item">
      <span class="mention-from">${escHtml(m.from)}</span> asks about <strong>${
      escHtml(m.spec)
    }</strong>:
      <p>${escHtml(m.question)}</p>
      <button class="cta-btn small" data-spec="${
      escHtml(m.spec)
    }" data-action="reply" data-mention-id="${escHtml(m.id)}">Reply</button>
    </div>`
  ).join("");
  return `<div class="pending-section"><h3>Pending Mentions (${mentions.length})</h3>${items}</div>`;
};

// =============================================================================
// Terminal container
// =============================================================================

export const terminalContainer = (tabId: string | null): string => {
  if (tabId === null) {
    return `<div class="terminal-container"><div class="terminal-placeholder">No tab selected. Click + to create one.</div></div>`;
  }
  return `<div class="terminal-container" id="terminal-container" data-tab="${
    escHtml(tabId)
  }"></div>`;
};
