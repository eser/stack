// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Checks for POST /_rsc, the server action endpoint: which exports a request
 * may call, how large its body may be, and which origins may send it.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";

/**
 * The largest server action request body, in bytes: 1 MiB. The body is held
 * in memory to decode the arguments, so the limit bounds the memory one
 * request can take. A larger body is refused with 413 before it is parsed.
 */
export const ACTION_MAX_BODY_BYTES = 1_048_576;

/** The marker React and the laroux build put on every server action. */
const SERVER_REFERENCE = Symbol.for("react.server.reference");

/** The server action modules one build lists, as paths under dist/server. */
export type ActionManifest = {
  readonly actions: ReadonlySet<string>;
};

/**
 * Reads `<serverDir>/actions-manifest.json`, the list of "use server" modules
 * the build wrote. A build without the file has no actions.
 */
export const readActionManifest = async (
  serverDir: string,
): Promise<ActionManifest> => {
  const manifestPath = runtime.path.join(serverDir, "actions-manifest.json");
  if (!(await runtime.fs.exists(manifestPath))) {
    return { actions: new Set() };
  }

  const parsed: unknown = JSON.parse(
    await runtime.fs.readTextFile(manifestPath),
  );
  const actions =
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as { actions?: unknown }).actions)
      ? (parsed as { actions: unknown[] }).actions.filter(
          (entry) => typeof entry === "string",
        )
      : [];

  return { actions: new Set(actions as string[]) };
};

/**
 * Whether the module of an action id (`path/to/file#export`) is one the build
 * lists. Checked before the module is imported, so a request can never load a
 * server module that is not an action module.
 */
export const isListedActionModule = (
  manifest: ActionManifest,
  modulePath: string,
): boolean => manifest.actions.has(`${modulePath}.js`);

/**
 * Whether `value` is the server action `actionId` names: a function that
 * carries React's server reference marker with the same id. Plain exports of
 * an action module, such as helpers, fail this check and cannot be called.
 */
export const isServerAction = (value: unknown, actionId: string): boolean => {
  if (typeof value !== "function") {
    return false;
  }

  const marked = value as { $$typeof?: unknown; $$id?: unknown };

  return marked.$$typeof === SERVER_REFERENCE && marked.$$id === actionId;
};

/**
 * Whether a browser sent the request from a page of the same origin.
 *
 * With Fetch Metadata, `Sec-Fetch-Site` must be `same-origin` or `none`.
 * Without it, an `Origin` header must equal the request URL's origin. A
 * request with neither header passes: browsers send at least one of them on
 * every POST, so only non-browser clients, which cross-site request forgery
 * cannot drive, omit both.
 */
export const isSameOriginRequest = (req: Request): boolean => {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite !== null) {
    return fetchSite === "same-origin" || fetchSite === "none";
  }

  const origin = req.headers.get("origin");
  if (origin === null) {
    return true;
  }

  return origin === new URL(req.url).origin;
};

/** The request body is over {@link ACTION_MAX_BODY_BYTES}. */
export class ActionBodyTooLargeError extends Error {
  readonly limitBytes: number;

  constructor(limitBytes: number) {
    super(`server action request body is over the ${limitBytes}-byte limit`);
    this.limitBytes = limitBytes;
    this.name = "ActionBodyTooLargeError";
  }
}

/**
 * Reads the request body into memory, failing with
 * {@link ActionBodyTooLargeError} as soon as it is known to pass
 * `limitBytes`: from Content-Length before any byte is read, otherwise from
 * the bytes counted while reading.
 */
export const readBoundedBody = async (
  req: Request,
  limitBytes: number = ACTION_MAX_BODY_BYTES,
): Promise<Uint8Array<ArrayBuffer>> => {
  const declared = req.headers.get("content-length");
  if (
    declared !== null &&
    /^\d+$/.test(declared.trim()) &&
    Number(declared.trim()) > limitBytes
  ) {
    await req.body?.cancel();
    throw new ActionBodyTooLargeError(limitBytes);
  }

  if (req.body === null) {
    return new Uint8Array(0);
  }

  const chunks: Uint8Array[] = [];
  let readBytes = 0;
  for await (const chunk of req.body) {
    readBytes += chunk.byteLength;
    if (readBytes > limitBytes) {
      // Leaving the loop early cancels the stream.
      throw new ActionBodyTooLargeError(limitBytes);
    }
    chunks.push(chunk);
  }

  const bytes = new Uint8Array(readBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
};
