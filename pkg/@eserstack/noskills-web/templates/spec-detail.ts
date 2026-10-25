// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Spec detail view — readable spec with inline CTAs.
 *
 * @module
 */

import type * as dashboard from "@eserstack/noskills/dashboard";
import * as layout from "./layout.ts";
import * as components from "./components.ts";
import * as escape from "./escape.ts";

export const renderSpecDetail = (
  spec: dashboard.SpecSummary,
  specContent: string,
  _currentUser: dashboard.User | null,
  token?: string,
): string => {
  // Phase-specific CTAs. Each action must be one routes/api.ts handles.
  // SPEC_APPROVED has none: the dashboard layer has no action that starts
  // execution, so it starts from the agent (`noskills spec <name> next`).
  const ctas: string[] = [];

  if (spec.phase === "SPEC_PROPOSAL") {
    ctas.push(components.ctaButton("Approve Spec", spec.slug, "approve"));
  }
  if (spec.phase === "EXECUTING") {
    ctas.push(components.ctaButton("Mark Complete", spec.slug, "complete"));
  }

  // Always show note/question buttons for active specs
  if (
    spec.phase !== "COMPLETED" &&
    spec.phase !== "IDLE" &&
    spec.phase !== "UNINITIALIZED"
  ) {
    ctas.push(components.ctaButton("Add Note", spec.slug, "note"));
    ctas.push(components.ctaButton("Ask Question", spec.slug, "question"));
  }

  // Pending questions
  const questionsHtml =
    spec.pendingQuestions.length > 0
      ? `<div class="questions-section">
        <h3>Open Questions</h3>
        ${spec.pendingQuestions
          .map(
            (q) =>
              `<div class="question-item">
            <strong>${escape.escHtml(q.user)}</strong>: ${escape.escHtml(
              q.text,
            )}
            ${components.ctaButton("Reply", spec.slug, "reply", {
              "question-id": q.id,
            })}
          </div>`,
          )
          .join("")}
      </div>`
      : "";

  // Task list
  const tasksHtml =
    spec.tasks.length > 0
      ? `<div class="tasks-section">
        <h3>Tasks (${
          spec.tasks.filter((t) => t.done).length
        }/${spec.tasks.length})</h3>
        <ul class="task-list">
          ${spec.tasks
            .map(
              (t) =>
                `<li class="${t.done ? "done" : ""}">
              <input type="checkbox" ${t.done ? "checked" : ""} disabled />
              <span>${escape.escHtml(t.id)}: ${escape.escHtml(
                t.description,
              )}</span>
              ${
                t.files !== undefined && t.files.length > 0
                  ? `<span class="file-hints">${t.files
                      .map((f) => `<code>${escape.escHtml(f)}</code>`)
                      .join(", ")}</span>`
                  : ""
              }
            </li>`,
            )
            .join("")}
        </ul>
      </div>`
      : "";

  // Spec markdown content
  const specHtml =
    specContent.length > 0
      ? `<div class="spec-content"><pre>${escape.escHtml(
          specContent,
        )}</pre></div>`
      : "";

  const ctaBar =
    ctas.length > 0 ? `<div class="cta-bar">${ctas.join("")}</div>` : "";

  const body = `
  <div class="spec-detail">
    <div class="spec-header">
      <a href="/" class="back-link">&larr; All Specs</a>
      <h1>${escape.escHtml(spec.name)} ${components.phaseBadge(spec.phase)}</h1>
      <p class="spec-description">${escape.escHtml(spec.description)}</p>
      <div class="roadmap">${escape.escHtml(spec.roadmap)}</div>
      ${ctaBar}
    </div>

    ${tasksHtml}
    ${questionsHtml}
    ${specHtml}

    ${
      spec.contributors.length > 0
        ? `<div class="contributors">Contributors: ${spec.contributors
            .map((n) => escape.escHtml(n))
            .join(", ")}</div>`
        : ""
    }
  </div>`;

  // The token lets the action buttons pass the guard on mutating requests.
  return layout.layout(`${spec.name} — noskills`, body, { token });
};
