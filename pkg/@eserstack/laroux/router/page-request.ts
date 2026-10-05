// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Request data that laroux passes to pages and layouts

import type { RouteParams } from "./types.ts";

/**
 * Data of the request a page or layout renders for.
 *
 * laroux passes it with each render as the `request` prop of the page and of
 * its layout. It never sits in module scope, which concurrent requests share.
 * Pass a client component only the values it renders: its props reach the
 * browser, so `request` or a cookie there would expose HttpOnly cookies.
 */
export type PageRequest = {
  /** The request's cookies by name, with decoded values. */
  readonly cookies: ReadonlyMap<string, string>;
  /** The request's Host header, or null when it has none. */
  readonly host: string | null;
  /** The `locale` search parameter of the page's URL, or null. */
  readonly locale: string | null;
};

/**
 * Props laroux passes to the component that a `page.tsx` exports.
 */
export type PageProps = {
  /** Values of the route's dynamic segments, by segment name. */
  readonly params: RouteParams;
  /** Pathname of the page, such as "/stories/hello". */
  readonly pathname: string;
  /** The request the page renders for. */
  readonly request: PageRequest;
};

/**
 * Props laroux passes to the component that a `layout.tsx` exports.
 *
 * @typeParam TChildren - The framework's node type, such as React.ReactNode
 */
export type LayoutProps<TChildren = unknown> = {
  /** The page the layout wraps. */
  readonly children: TChildren;
  /** The request the page renders for. */
  readonly request: PageRequest;
};

/**
 * The raw request data a PageRequest is built from.
 */
export type PageRequestInput = {
  /** The Cookie header, or null when the request has none. */
  readonly cookieHeader?: string | null;
  /** The Host header, or null when the request has none. */
  readonly host?: string | null;
  /** The `locale` search parameter of the page's URL, or null. */
  readonly locale?: string | null;
};

/**
 * Remove the double quotes around a cookie value and decode its percent
 * escapes; a value with a malformed escape is kept as sent.
 */
function decodeCookieValue(raw: string): string {
  const unquoted = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')
    ? raw.slice(1, -1)
    : raw;

  if (!unquoted.includes("%")) {
    return unquoted;
  }

  try {
    return decodeURIComponent(unquoted);
  } catch {
    // Handled here: a value that is not percent-encoded text is the
    // cookie's literal value.
    return unquoted;
  }
}

/**
 * Parse a Cookie header into cookie values by name.
 *
 * Pairs without a name or an `=` are skipped. When a name repeats, the first
 * value wins: browsers send the cookie with the most specific path first.
 *
 * @example
 * ```typescript
 * import * as laroux from "@eserstack/laroux";
 *
 * const cookies = laroux.parseCookieHeader("theme=dark; user=ada%20l");
 * cookies.get("user"); // "ada l"
 * ```
 */
export function parseCookieHeader(
  header: string | null,
): ReadonlyMap<string, string> {
  const cookies = new Map<string, string>();
  if (header === null) {
    return cookies;
  }

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const name = pair.slice(0, separator).trim();
    if (name === "" || cookies.has(name)) {
      continue;
    }

    cookies.set(name, decodeCookieValue(pair.slice(separator + 1).trim()));
  }

  return cookies;
}

/**
 * Build the PageRequest that pages and layouts receive from the raw request
 * data; what the input leaves out is null or empty.
 */
export function createPageRequest(input: PageRequestInput): PageRequest {
  return {
    cookies: parseCookieHeader(input.cookieHeader ?? null),
    host: input.host ?? null,
    locale: input.locale ?? null,
  };
}
