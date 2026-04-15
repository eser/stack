// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Spec detail view — readable spec with inline CTAs.
 *
 * @module
 */

import type * as dashboard from "@eserstack/noskills/dashboard";
import { layout } from "./layout.ts";
import * as c from "./components.ts";

const escHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const renderSpecDetail = (
  spec: dashboard.SpecSummary,
  specContent: string,
  _currentUser: dashboard.User | null,
): string => {
  // Phase-specific CTAs
  const ctas: string[] = [];

  if (spec.phase === "SPEC_PROPOSAL") {
    ctas.push(c.ctaButton("Approve Spec", spec.slug, "approve"));
  }
  if (spec.phase === "SPEC_APPROVED") {
    ctas.push(c.ctaButton("Start Execution", spec.slug, "start"));
  }
  if (spec.phase === "EXECUTING") {
    ctas.push(c.ctaButton("Mark Complete", spec.slug, "complete"));
  }

  // Always show note/question buttons for active specs
  if (
    spec.phase !== "COMPLETED" && spec.phase !== "IDLE" &&
    spec.phase !== "UNINITIALIZED"
  ) {
    ctas.push(c.ctaButton("Add Note", spec.slug, "note"));
    ctas.push(c.ctaButton("Ask Question", spec.slug, "question"));
  }

  // Pending questions
  const questionsHtml = spec.pendingQuestions.length > 0
    ? `<div class="questions-section">
        <h3>Open Questions</h3>
        ${
      spec.pendingQuestions.map((q) =>
        `<div class="question-item">
            <strong>${escHtml(q.user)}</strong>: ${escHtml(q.text)}
            ${
          c.ctaButton("Reply", spec.slug, "reply", {
            "question-id": q.id,
          })
        }
          </div>`
      ).join("")
    }
      </div>`
    : "";

  // Task list
  const tasksHtml = spec.tasks.length > 0
    ? `<div class="tasks-section">
        <h3>Tasks (${
      spec.tasks.filter((t) => t.done).length
    }/${spec.tasks.length})</h3>
        <ul class="task-list">
          ${
      spec.tasks.map((t) =>
        `<li class="${t.done ? "done" : ""}">
              <input type="checkbox" ${t.done ? "checked" : ""} disabled />
              <span>${escHtml(t.id)}: ${escHtml(t.description)}</span>
              ${
          t.files
            ? `<span class="file-hints">${
              t.files.map((f) => `<code>${escHtml(f)}</code>`).join(", ")
            }</span>`
            : ""
        }
            </li>`
      ).join("")
    }
        </ul>
      </div>`
    : "";

  // Spec markdown content
  const specHtml = specContent.length > 0
    ? `<div class="spec-content"><pre>${escHtml(specContent)}</pre></div>`
    : "";

  const ctaBar = ctas.length > 0
    ? `<div class="cta-bar">${ctas.join("")}</div>`
    : "";

  const body = `
  <div class="spec-detail">
    <div class="spec-header">
      <a href="/" class="back-link">&larr; All Specs</a>
      <h1>${escHtml(spec.name)} ${c.phaseBadge(spec.phase)}</h1>
      <p class="spec-description">${escHtml(spec.description)}</p>
      <div class="roadmap">${escHtml(spec.roadmap)}</div>
      ${ctaBar}
    </div>

    ${tasksHtml}
    ${questionsHtml}
    ${specHtml}

    ${
    spec.contributors.length > 0
      ? `<div class="contributors">Contributors: ${
        spec.contributors.map((n) => escHtml(n)).join(", ")
      }</div>`
      : ""
  }
  </div>`;

  return layout(`${spec.name} — noskills`, body);
};
