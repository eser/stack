// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * JSON API routes — dashboard actions.
 *
 * @module
 */

import * as dashboard from "@eserstack/noskills/dashboard";
import { runtime } from "@eserstack/standards/cross-runtime";
import type * as requestContext from "../request-context.ts";
import type { MuxHost } from "../terminal/mux-host.ts";

/**
 * Opt-in switch that appends the underlying error text to fault responses.
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
 * Serialize a rejection as `{ ok: false, error }`, the shape the dashboard
 * client and the REST callers read. `reason` is the whole story here (a wrong
 * phase, an unknown action), so nothing is logged.
 */
const jsonError = (reason: string, status: number): Response =>
  json({ ok: false, error: reason }, status);

/**
 * Log a caught fault under the request id and answer
 * `{ ok: false, error, requestId }`.
 *
 * `reason` is written at the call site; it is never derived from `cause`, and
 * `cause` never reaches the wire. Everything below this layer reports faults
 * as a bare `Error` carrying whatever the runtime threw, such as
 * `NotFound: ... open '/Users/<name>/<repo>/.eser/specs/<spec>/state.json'`, so
 * forwarding its message or stack would map out the host's directory layout
 * and the internal module structure for the caller. The token guard narrows
 * who can ask, but it is a single per-process secret embedded in the dashboard
 * HTML, not a reason to answer with a stack trace. The detail goes to the log
 * instead, and the request id in the response leads to it.
 *
 * @param context - The request the fault happened in
 * @param reason - What failed, in words the user can act on
 * @param status - The HTTP status of the response
 * @param cause - The caught error; logged, never sent
 * @returns The JSON failure response
 */
export const faultResponse = async (
  context: requestContext.RequestContext,
  reason: string,
  status: number,
  cause: unknown,
): Promise<Response> => {
  await context.log.with({ error: cause }).error(reason);

  const body: Record<string, unknown> = {
    ok: false,
    error: reason,
    requestId: context.requestId,
  };

  if (debugErrorsEnabled()) {
    body["detail"] = cause instanceof Error
      ? (cause.stack ?? cause.message)
      : String(cause);
  }

  return json(body, status);
};

/** A string field of a JSON request body; "" when it is missing or not a string. */
const stringField = (
  body: Readonly<Record<string, unknown>>,
  key: string,
): string => {
  const value = body[key];

  return typeof value === "string" ? value : "";
};

/** The acting user of a JSON request body, when it carries a name and an email. */
const userField = (
  body: Readonly<Record<string, unknown>>,
): dashboard.User | undefined => {
  const value = body["user"];
  if (!(value instanceof Object)) {
    return undefined;
  }

  const { name, email } = value as Record<string, unknown>;
  if (typeof name !== "string" || typeof email !== "string") {
    return undefined;
  }

  return { name, email };
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

/**
 * POST /api/spec/:name/:action: run one dashboard action on a spec.
 *
 * The actions are the ones `@eserstack/noskills/dashboard` implements. The spec
 * page offers only these; a button for any other action would answer 400 on
 * every click (server.test.ts checks the buttons of every phase).
 */
export const handleAction = async (
  root: string,
  specName: string,
  action: string,
  body: Readonly<Record<string, unknown>>,
  host: MuxHost,
  context: requestContext.RequestContext,
): Promise<Response> => {
  const user = userField(body);
  let result: dashboard.ActionResult;

  switch (action) {
    case "approve":
      result = await dashboard.approve(root, specName, user);
      break;
    case "note":
      result = await dashboard.addNote(
        root,
        specName,
        stringField(body, "text"),
        user,
      );
      break;
    case "question":
      result = await dashboard.addQuestion(
        root,
        specName,
        stringField(body, "text"),
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
        stringField(body, "mentionId"),
        stringField(body, "text"),
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
    // A rejection the dashboard layer decided on is safe to repeat back and is
    // the only useful thing to say — "Cannot approve in phase: SPEC_PROPOSAL"
    // tells the user what to do, whereas the generic string leaves them
    // guessing. Anything else is a caught fault whose message may carry host
    // paths, so it stays generic and goes to the log instead.
    if (result.error instanceof dashboard.ActionRejectedError) {
      return jsonError(result.error.message, 400);
    }

    return await faultResponse(
      { ...context, log: context.log.with({ spec: specName, action }) },
      "Action could not be completed",
      400,
      result.error,
    );
  }

  // Notify the pane bound to this spec, without stealing focus from the user.
  // The notice is typed into the agent's PTY, so the name from the request body
  // loses its control characters: a "\r" would submit, an ESC start a sequence.
  const userName = (user?.name ?? "someone").replace(/\p{Cc}/gu, "");
  host.notifySpec(
    specName,
    `\n[noskills: spec ${specName} ${action} by ${userName}]\n`,
  );

  return json({ ok: true });
};

/** POST /api/tab — Create a new tab. */
export const handleCreateTab = async (
  host: MuxHost,
  body: Readonly<Record<string, unknown>>,
): Promise<Response> => {
  const spec = body["spec"];
  const tab = await host.createTab(typeof spec === "string" ? spec : undefined);
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
