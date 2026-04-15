// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Server Request Context
 * Manages request-scoped state for SSR (cookies, headers, etc.)
 */

/**
 * Server request cookies storage.
 * Set by RSC render to make cookies available during SSR.
 */
let serverRequestCookies: string | null = null;

/**
 * Set the server request context (called by RSC renderer)
 */
export function setServerRequestContext(cookieHeader: string | null): void {
  serverRequestCookies = cookieHeader;
}

/**
 * Get the current server request cookies
 */
export function getServerRequestCookies(): string | null {
  return serverRequestCookies;
}

/**
 * Clear the server request context (called after render)
 */
export function clearServerRequestContext(): void {
  serverRequestCookies = null;
}
