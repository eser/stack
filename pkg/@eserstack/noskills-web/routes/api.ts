// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * JSON API routes — dashboard actions.
 *
 * @module
 */

import * as dashboard from "@eserstack/noskills/dashboard";
import type { PtyManager } from "../terminal/pty-manager.ts";

const json = (data: unknown, status = 200): Response => {
  // For error responses, return only { ok, error } — never serialize raw data
  // which may contain stack traces or internal details.
  if (status >= 400 && typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    const safeError = obj["error"] instanceof Error
      ? obj["error"].message
      : typeof obj["error"] === "string"
      ? obj["error"].split("\n")[0]!
      : "Unknown error";
    return new Response(
      JSON.stringify({ ok: false, error: safeError }),
      { status, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
};

/** GET /api/state — Full dashboard state. */
export const handleGetState = async (root: string): Promise<Response> => {
  const state = await dashboard.getState(root);
  return json(state);
};

/** POST /api/spec/:name/:action — Execute an action. */
export const handleAction = async (
  root: string,
  specName: string,
  action: string,
  body: Record<string, unknown>,
  ptyManager: PtyManager,
): Promise<Response> => {
  const user = body["user"] as dashboard.User | undefined;
  let result: dashboard.ActionResult;

  switch (action) {
    case "approve":
      result = await dashboard.approve(root, specName, user);
      break;
    case "note":
      result = await dashboard.addNote(
        root,
        specName,
        (body["text"] as string) ?? "",
        user,
      );
      break;
    case "question":
      result = await dashboard.addQuestion(
        root,
        specName,
        (body["text"] as string) ?? "",
        user,
      );
      break;
    case "signoff":
      result = await dashboard.signoff(root, specName, user);
      break;
    case "reply":
      result = await dashboard.replyMention(
        root,
        specName,
        (body["mentionId"] as string) ?? "",
        (body["text"] as string) ?? "",
        user,
      );
      break;
    case "complete":
      result = await dashboard.complete(root, specName, user);
      break;
    default:
      return json({ ok: false, error: `Unknown action: ${action}` }, 400);
  }

  // Send stdin notification to the tab assigned to this spec
  if (result.ok) {
    const tab = ptyManager.findTabBySpec(specName);
    if (tab?.pty !== null && tab?.pty !== undefined) {
      const userName = user?.name ?? "someone";
      tab.pty.write(
        `\n[noskills: spec ${specName} ${action} by ${userName}]\n`,
      );
    }
  }

  return json(result, result.ok ? 200 : 400);
};

/** POST /api/tab — Create a new tab. */
export const handleCreateTab = async (
  ptyManager: PtyManager,
  body: Record<string, unknown>,
): Promise<Response> => {
  const specName = body["spec"] as string | undefined;
  const tab = await ptyManager.createTab(specName);
  return json({ ok: true, tabId: tab.id, specName: tab.specName });
};

/** DELETE /api/tab/:id — Close a tab. */
export const handleCloseTab = async (
  ptyManager: PtyManager,
  tabId: string,
): Promise<Response> => {
  await ptyManager.closeTab(tabId);
  return json({ ok: true });
};

/** GET /api/tabs — List tabs. */
export const handleListTabs = (ptyManager: PtyManager): Response => {
  const tabs = ptyManager.listTabs().map((t) => ({
    id: t.id,
    specName: t.specName,
    createdAt: t.createdAt,
  }));
  return json(tabs);
};
