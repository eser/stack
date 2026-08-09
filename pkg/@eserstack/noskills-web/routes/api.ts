// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * JSON API routes — dashboard actions.
 *
 * @module
 */

import * as dashboard from "@eserstack/noskills/dashboard";
import { runtime } from "@eserstack/standards/cross-runtime";
import type { MuxHost } from "../terminal/mux-host.ts";

/**
 * Opt-in switch that appends the underlying error text to failure responses.
 *
 * Off unless explicitly set, so a plain `noskills web` never ships internal
 * detail to a caller; a developer chasing a bug has to ask for it by name.
 */
const debugErrorsEnabled = (): boolean => {
  const value = runtime.env.get("NOSKILLS_WEB_DEBUG_ERRORS");

  return value === "1" || value === "true";
};

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * Serialize a failure as `{ ok: false, error }` — the shape the dashboard
 * client and the REST callers already read.
 *
 * `reason` is written here at the call site; it is never derived from a thrown
 * error, and `cause` never reaches the wire. Everything below this layer
 * reports faults as a bare `Error` carrying whatever the runtime threw —
 * `NotFound: ... open '/Users/<name>/<repo>/.eser/specs/<spec>/state.json'`
 * and friends — so forwarding its message or stack maps out the host's
 * directory layout and our internal module structure for the caller. The token
 * guard narrows who can ask, but it is a single per-process secret embedded in
 * the dashboard HTML, not a reason to answer with a stack trace. The detail
 * goes to the server log instead, where it stays just as debuggable.
 */
const jsonError = (
  reason: string,
  status: number,
  cause?: unknown,
): Response => {
  if (cause !== undefined) {
    console.error(`[noskills-web] ${reason}:`, cause);
  }

  const body: Record<string, unknown> = { ok: false, error: reason };

  if (cause !== undefined && debugErrorsEnabled()) {
    body["detail"] = cause instanceof Error
      ? (cause.stack ?? cause.message)
      : String(cause);
  }

  return json(body, status);
};

/** GET /api/state — Full dashboard state. */
export const handleGetState = async (root: string): Promise<Response> => {
  const state = await dashboard.getState(root);
  return json(state);
};

/**
 * GET /api/spec/:name/ledger | summary — read-only decision-ledger data.
 * `ledger` returns the full records + summary; `summary` returns only the
 * maturity summary. Missing files yield empty records / null summary, never 404.
 */
export const handleSpecRead = async (
  root: string,
  specName: string,
  kind: "ledger" | "summary",
): Promise<Response> => {
  const summary = await dashboard.readSummary(root, specName);
  if (kind === "summary") {
    return json({ ok: true, spec: specName, summary });
  }
  const records = await dashboard.readLedger(root, specName);
  return json({ ok: true, spec: specName, records, summary });
};

/** POST /api/spec/:name/:action — Execute an action. */
export const handleAction = async (
  root: string,
  specName: string,
  action: string,
  body: Record<string, unknown>,
  host: MuxHost,
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
      return jsonError(`Unknown action: ${action}`, 400);
  }

  if (!result.ok) {
    // The dashboard layer collapses domain rejections ("wrong phase") and raw
    // filesystem faults into the same untyped `Error`, so this layer cannot
    // tell them apart and has to treat every one as internal.
    return jsonError("Action could not be completed", 400, result.error);
  }

  // Notify the pane bound to this spec, without stealing focus from the user.
  const userName = user?.name ?? "someone";
  host.notifySpec(
    specName,
    `\n[noskills: spec ${specName} ${action} by ${userName}]\n`,
  );

  return json({ ok: true });
};

/** POST /api/tab — Create a new tab. */
export const handleCreateTab = async (
  host: MuxHost,
  body: Record<string, unknown>,
): Promise<Response> => {
  const specName = body["spec"] as string | undefined;
  const tab = await host.createTab(specName);
  return json({ ok: true, tabId: tab.id, specName: tab.specName });
};

/** DELETE /api/tab/:id — Close a tab. */
export const handleCloseTab = (
  host: MuxHost,
  tabId: string,
): Response => {
  host.closeTab(tabId);
  return json({ ok: true });
};

/** GET /api/tabs — List tabs. */
export const handleListTabs = (host: MuxHost): Response => {
  const tabs = host.listTabs().map((t) => ({
    id: t.id,
    specName: t.specName,
  }));
  return json(tabs);
};
