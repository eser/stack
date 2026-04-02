// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * HTML page routes.
 *
 * @module
 */

import * as dashboard from "@eser/noskills/dashboard";
import { runtime } from "@eser/standards/cross-runtime";
import { renderDashboard } from "../templates/dashboard.ts";
import { renderSpecDetail } from "../templates/spec-detail.ts";
import type { PtyManager } from "../terminal/pty-manager.ts";

/** GET / — Dashboard page. */
export const handleDashboard = async (
  root: string,
  ptyManager: PtyManager,
): Promise<Response> => {
  const state = await dashboard.getState(root);

  const tabs = ptyManager.listTabs().map((t) => ({
    id: t.id,
    specName: t.specName,
    phase: null as string | null,
  }));

  const activeTabId = tabs.length > 0 ? tabs[0]!.id : null;
  const html = renderDashboard(state, tabs, activeTabId);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};

/** GET /spec/:name — Spec detail page. */
export const handleSpecDetail = async (
  root: string,
  specName: string,
): Promise<Response> => {
  try {
    // Check spec directory exists
    await runtime.fs.stat(`${root}/.eser/specs/${specName}`);

    const spec = await dashboard.getSpecSummary(root, specName);
    const state = await dashboard.getState(root);

    // Read spec markdown
    let specContent = "";
    try {
      specContent = await runtime.fs.readTextFile(
        `${root}/.eser/specs/${specName}/spec.md`,
      );
    } catch {
      // No spec.md yet
    }

    const html = renderSpecDetail(spec, specContent, state.currentUser);
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch {
    return new Response("Spec not found", { status: 404 });
  }
};
