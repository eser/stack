// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * REST client for the noskills-server daemon.
 *
 * Uses the browser's native fetch (HTTP/3 ALPN is negotiated automatically by
 * the UA when the daemon advertises h3). In Node environments supply a custom
 * fetchFn that speaks HTTP/3 (e.g. h3-fetch shim or the Go bridge HTTP client).
 *
 * @module
 */

import type {
  CreateSessionRequest,
  CreateSessionResponse,
  LoginRequest,
  LoginResponse,
  NoskillsClientConfig,
  Project,
  RegisterProjectRequest,
  Session,
} from "./types.ts";

// =============================================================================
// Internal
// =============================================================================

type FetchFn = typeof globalThis.fetch;

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "protocol-version": "1",
  };
  if (token) {
    headers["authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function apiGet<T>(
  fetchFn: FetchFn,
  baseUrl: string,
  path: string,
  token?: string,
): Promise<T> {
  const resp = await fetchFn(`${baseUrl}${path}`, {
    headers: buildHeaders(token),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`GET ${path} → ${resp.status}: ${text}`);
  }
  return resp.json() as Promise<T>;
}

async function apiPost<T>(
  fetchFn: FetchFn,
  baseUrl: string,
  path: string,
  body: unknown,
  token?: string,
): Promise<T> {
  const resp = await fetchFn(`${baseUrl}${path}`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`POST ${path} → ${resp.status}: ${text}`);
  }
  return resp.json() as Promise<T>;
}

async function apiDelete(
  fetchFn: FetchFn,
  baseUrl: string,
  path: string,
  token?: string,
): Promise<void> {
  const resp = await fetchFn(`${baseUrl}${path}`, {
    method: "DELETE",
    headers: buildHeaders(token),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`DELETE ${path} → ${resp.status}: ${text}`);
  }
}

// =============================================================================
// NoskillsClient
// =============================================================================

export class NoskillsClient {
  readonly #base: string;
  readonly #fetch: FetchFn;
  #token: string | undefined;

  constructor(config: NoskillsClientConfig, fetchFn?: FetchFn) {
    this.#base = config.baseUrl.replace(/\/$/, "");
    this.#token = config.token;
    this.#fetch = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  async setup(pin: string): Promise<void> {
    await apiPost<void>(this.#fetch, this.#base, "/auth/setup", { pin });
  }

  async login(pin: string): Promise<LoginResponse> {
    const req: LoginRequest = { pin };
    const resp = await apiPost<LoginResponse>(
      this.#fetch,
      this.#base,
      "/auth/login",
      req,
    );
    this.#token = resp.token;
    return resp;
  }

  async logout(): Promise<void> {
    await apiPost<void>(this.#fetch, this.#base, "/auth/logout", {}, this.#token);
    this.#token = undefined;
  }

  /** Inject a token obtained externally (e.g. from localStorage). */
  setToken(token: string): void {
    this.#token = token;
  }

  get token(): string | undefined {
    return this.#token;
  }

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  health(): Promise<{ version: string; uptime: number }> {
    return apiGet(this.#fetch, this.#base, "/api/health", this.#token);
  }

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  listProjects(): Promise<Project[]> {
    return apiGet(this.#fetch, this.#base, "/api/projects", this.#token);
  }

  registerProject(req: RegisterProjectRequest): Promise<Project> {
    return apiPost(this.#fetch, this.#base, "/api/projects", req, this.#token);
  }

  deleteProject(slug: string): Promise<void> {
    return apiDelete(this.#fetch, this.#base, `/api/projects/${slug}`, this.#token);
  }

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  listSessions(slug: string): Promise<Session[]> {
    return apiGet(
      this.#fetch,
      this.#base,
      `/api/projects/${slug}/sessions`,
      this.#token,
    );
  }

  createSession(
    slug: string,
    req: CreateSessionRequest = {},
  ): Promise<CreateSessionResponse> {
    return apiPost(
      this.#fetch,
      this.#base,
      `/api/projects/${slug}/sessions`,
      req,
      this.#token,
    );
  }

  // ---------------------------------------------------------------------------
  // Session forking
  // ---------------------------------------------------------------------------

  forkSession(
    slug: string,
    sessionId: string,
    atMessageId?: string,
    label?: string,
  ): Promise<CreateSessionResponse> {
    return apiPost(
      this.#fetch,
      this.#base,
      `/api/projects/${slug}/sessions/${sessionId}/fork`,
      { at_message_id: atMessageId, label },
      this.#token,
    );
  }

  getSessionLineage(
    slug: string,
    sessionId: string,
  ): Promise<{ sessionId: string; parent?: string; children: string[] }> {
    return apiGet(
      this.#fetch,
      this.#base,
      `/api/projects/${slug}/sessions/${sessionId}/lineage`,
      this.#token,
    );
  }

  // ---------------------------------------------------------------------------
  // Web Push subscriptions
  // ---------------------------------------------------------------------------

  async getVapidPublicKey(): Promise<string> {
    const resp = await apiGet<{ publicKey: string }>(
      this.#fetch,
      this.#base,
      "/api/push/vapid-public-key",
    );
    return resp.publicKey;
  }

  subscribePush(
    subscription: PushSubscriptionJSON,
    sessionFilter?: string[],
  ): Promise<{ subscriptionId: string }> {
    return apiPost(
      this.#fetch,
      this.#base,
      "/api/push/subscribe",
      { ...subscription, sessionFilter },
      this.#token,
    );
  }

  unsubscribePush(subscriptionId: string): Promise<void> {
    return apiDelete(
      this.#fetch,
      this.#base,
      `/api/push/subscribe/${subscriptionId}`,
      this.#token,
    );
  }
}

/**
 * Factory. Parallel to createHttpClient / createWebTransportClient pattern.
 *
 * @example
 * ```ts
 * const client = createNoskillsClient({ baseUrl: "https://localhost:4433" });
 * await client.login("428591");
 * const { sessionId } = await client.createSession("my-project");
 * ```
 */
export function createNoskillsClient(
  config: NoskillsClientConfig,
  fetchFn?: typeof globalThis.fetch,
): NoskillsClient {
  return new NoskillsClient(config, fetchFn);
}
