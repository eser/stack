// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * HTML page routes.
 *
 * @module
 */

import * as dashboard from "@eserstack/noskills/dashboard";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as dashboardTemplate from "../templates/dashboard.ts";
import * as specDetail from "../templates/spec-detail.ts";
import * as layout from "../templates/layout.ts";
import type { MuxHost } from "../terminal/mux-host.ts";

/** GET / — Dashboard page. */
export const handleDashboard = async (
  root: string,
  host: MuxHost,
  token?: string,
): Promise<Response> => {
  const state = await dashboard.getState(root);

  const tabs = host.listTabs().map((t) => ({
    id: t.id,
    specName: t.specName,
    phase: null as string | null,
  }));

  const activeTabId = tabs.length > 0 ? tabs[0]!.id : null;
  const html = dashboardTemplate.renderDashboard(
    state,
    tabs,
    activeTabId,
    token,
  );

  return new Response(html, {
    headers: layout.htmlHeaders(),
  });
};

/** The 404 of a spec that has no directory, or a name that cannot be one. */
export const specNotFound = (): Response =>
  new Response("Spec not found", { status: 404 });

/**
 * Whether `name` can name one directory under `.eser/specs/` without leaving
 * it: not empty, not `.` or `..`, and without a separator or a NUL.
 */
export const isSpecDirName = (name: string): boolean =>
  name !== "" && name !== "." && name !== ".." && !/[/\\]/.test(name) &&
  !name.includes("\0");

/**
 * The spec a `/spec/:name` path segment names: the segment percent-decoded,
 * or `null` when it does not decode or does not name one spec directory.
 */
export const specNameFromPath = (segment: string): string | null => {
  let name: string;
  try {
    name = decodeURIComponent(segment);
  } catch {
    return null;
  }

  return isSpecDirName(name) ? name : null;
};

/**
 * GET /spec/:name — Spec detail page. The page carries the token, as the
 * dashboard does, so its buttons can send the actions.
 */
export const handleSpecDetail = async (
  root: string,
  specName: string,
  token?: string,
): Promise<Response> => {
  if (!isSpecDirName(specName)) {
    return specNotFound();
  }

  try {
    // Check spec directory exists
    await runtime.fs.stat(`${root}/.eser/specs/${specName}`);
  } catch {
    return specNotFound();
  }

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

  const html = specDetail.renderSpecDetail(
    spec,
    specContent,
    state.currentUser,
    token,
  );
  return new Response(html, {
    headers: layout.htmlHeaders(),
  });
};
