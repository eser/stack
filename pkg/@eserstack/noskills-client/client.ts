// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * REST client for the noskills-server daemon.
 *
 * Uses the browser's native fetch (HTTP/3 ALPN is negotiated automatically by
 * the UA when the daemon advertises h3). The daemon listens on HTTP/3 only, so
 * outside a browser supply a fetchFn that speaks HTTP/3.
 *
 * Every call has a time limit (10 000 ms unless `timeoutMs` says otherwise;
 * 300 000 ms for registering a git URL) and takes an optional AbortSignal.
 *
 * @module
 */

import type {
  CallOptions,
  CreateSessionRequest,
  CreateSessionResponse,
  LoginRequest,
  LoginResponse,
  NoskillsClientConfig,
  Project,
  RegisterProjectRequest,
  Session,
} from "./types.ts";
import * as deadline from "./deadline.ts";
import * as errors from "./errors.ts";

// =============================================================================
// Internal
// =============================================================================

type FetchFn = typeof globalThis.fetch;

const REQUEST_TIMEOUT_MS = 10_000;

/** The daemon clones the repository before it answers a git registration. */
const GIT_CLONE_TIMEOUT_MS = 300_000;

/** One REST exchange with the daemon. */
type Call = {
  readonly method: "GET" | "POST" | "DELETE";
  readonly path: string;
  /** Sent as JSON when present. */
  readonly body?: unknown;
  /** Sent as a Bearer token when present and not empty. */
  readonly token?: string;
};

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "protocol-version": "1",
  };
  if (token !== undefined && token !== "") {
    headers["authorization"] = `Bearer ${token}`;
  }
  return headers;
}

const readJson = async <T>(response: Response): Promise<T> =>
  await response.json() as T;

const discardBody = async (response: Response): Promise<void> => {
  await response.body?.cancel();
};

// =============================================================================
// NoskillsClient
// =============================================================================

/**
 * REST client for one daemon. Every method takes an optional
 * {@link CallOptions} as its last argument, to cancel the call or change its
 * time limit.
 */
export class NoskillsClient {
  readonly #base: string;
  readonly #fetch: FetchFn;
  readonly #timeoutMs: number;
  #token: string | undefined;

  /** Uses `fetchFn` in place of the global fetch when given. */
  constructor(config: NoskillsClientConfig, fetchFn?: FetchFn) {
    this.#base = config.baseUrl.replace(/\/$/, "");
    this.#token = config.token;
    this.#timeoutMs = config.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.#fetch = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Sends one call and reads its response, within the call's time limit and
   * the caller's signal. An error status throws `NoskillsResponseError`.
   */
  #send<T>(
    call: Call,
    options: CallOptions | undefined,
    read: (response: Response) => Promise<T>,
    defaultTimeoutMs: number,
  ): Promise<T> {
    return deadline.withDeadline(
      `${call.method} ${call.path}`,
      options?.timeoutMs ?? defaultTimeoutMs,
      options?.signal,
      async (signal) => {
        const response = await this.#fetch(`${this.#base}${call.path}`, {
          method: call.method,
          headers: buildHeaders(call.token),
          body: call.body === undefined ? undefined : JSON.stringify(call.body),
          signal,
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => response.statusText);
          throw new errors.NoskillsResponseError(
            call.method,
            call.path,
            response.status,
            detail,
          );
        }
        return await read(response);
      },
    );
  }

  #json<T>(call: Call, options: CallOptions | undefined): Promise<T> {
    return this.#send(call, options, readJson<T>, this.#timeoutMs);
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  /** Sets the daemon's PIN on first run (`POST /auth/setup`). */
  async setup(pin: string, options?: CallOptions): Promise<void> {
    await this.#json<unknown>(
      { method: "POST", path: "/auth/setup", body: { pin } },
      options,
    );
  }

  /** Logs in with the PIN and keeps the token for later calls. */
  async login(pin: string, options?: CallOptions): Promise<LoginResponse> {
    const req: LoginRequest = { pin };
    const resp = await this.#json<LoginResponse>(
      { method: "POST", path: "/auth/login", body: req },
      options,
    );
    this.#token = resp.token;
    return resp;
  }

  /** Ends the token's session on the daemon, then forgets the token. */
  async logout(options?: CallOptions): Promise<void> {
    await this.#json<unknown>(
      { method: "POST", path: "/auth/logout", body: {}, token: this.#token },
      options,
    );
    this.#token = undefined;
  }

  /** Inject a token obtained externally (e.g. from localStorage). */
  setToken(token: string): void {
    this.#token = token;
  }

  /** The token later calls send, if any. */
  get token(): string | undefined {
    return this.#token;
  }

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  /** Reads the daemon's version and uptime (`GET /api/health`). */
  health(options?: CallOptions): Promise<{ version: string; uptime: number }> {
    return this.#json(
      { method: "GET", path: "/api/health", token: this.#token },
      options,
    );
  }

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  /** Lists the registered projects (`GET /api/projects`). */
  listProjects(options?: CallOptions): Promise<Project[]> {
    return this.#json(
      { method: "GET", path: "/api/projects", token: this.#token },
      options,
    );
  }

  /**
   * Registers a local path, or clones a git URL into the daemon's data
   * directory. A git URL waits 300 000 ms by default, because the daemon
   * answers only after the clone; the daemon uses `path` when both are set.
   */
  registerProject(
    req: RegisterProjectRequest,
    options?: CallOptions,
  ): Promise<Project> {
    const clones = (req.path === undefined || req.path === "") &&
      req.git !== undefined && req.git !== "";
    return this.#send(
      { method: "POST", path: "/api/projects", body: req, token: this.#token },
      options,
      readJson<Project>,
      clones ? GIT_CLONE_TIMEOUT_MS : this.#timeoutMs,
    );
  }

  /** Removes a project from the daemon's registry. */
  deleteProject(slug: string, options?: CallOptions): Promise<void> {
    return this.#send(
      {
        method: "DELETE",
        path: `/api/projects/${encodeURIComponent(slug)}`,
        token: this.#token,
      },
      options,
      discardBody,
      this.#timeoutMs,
    );
  }

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  /** Lists a project's sessions. */
  listSessions(slug: string, options?: CallOptions): Promise<Session[]> {
    return this.#json(
      {
        method: "GET",
        path: `/api/projects/${encodeURIComponent(slug)}/sessions`,
        token: this.#token,
      },
      options,
    );
  }

  /** Starts a session in a project, or resumes one with `resumeFrom`. */
  createSession(
    slug: string,
    req?: CreateSessionRequest,
    options?: CallOptions,
  ): Promise<CreateSessionResponse> {
    return this.#json(
      {
        method: "POST",
        path: `/api/projects/${encodeURIComponent(slug)}/sessions`,
        body: req ?? {},
        token: this.#token,
      },
      options,
    );
  }

  // ---------------------------------------------------------------------------
  // Session forking
  // ---------------------------------------------------------------------------

  /** Forks a session, at a message when `atMessageId` is given. */
  forkSession(
    slug: string,
    sessionId: string,
    atMessageId?: string,
    label?: string,
    options?: CallOptions,
  ): Promise<CreateSessionResponse> {
    return this.#json(
      {
        method: "POST",
        path: `/api/projects/${encodeURIComponent(slug)}/sessions/${
          encodeURIComponent(sessionId)
        }/fork`,
        body: { at_message_id: atMessageId, label },
        token: this.#token,
      },
      options,
    );
  }

  /** Reads a session's parent and children. */
  getSessionLineage(
    slug: string,
    sessionId: string,
    options?: CallOptions,
  ): Promise<{ sessionId: string; parent?: string; children: string[] }> {
    return this.#json(
      {
        method: "GET",
        path: `/api/projects/${encodeURIComponent(slug)}/sessions/${
          encodeURIComponent(sessionId)
        }/lineage`,
        token: this.#token,
      },
      options,
    );
  }

  // ---------------------------------------------------------------------------
  // Web Push subscriptions
  // ---------------------------------------------------------------------------

  /** Reads the daemon's VAPID public key for Web Push; needs no token. */
  async getVapidPublicKey(options?: CallOptions): Promise<string> {
    const resp = await this.#json<{ publicKey: string }>(
      { method: "GET", path: "/api/push/vapid-public-key" },
      options,
    );
    return resp.publicKey;
  }

  /** Subscribes a browser to Web Push, for the sessions in `sessionFilter`. */
  subscribePush(
    subscription: PushSubscriptionJSON,
    sessionFilter?: string[],
    options?: CallOptions,
  ): Promise<{ subscriptionId: string }> {
    return this.#json(
      {
        method: "POST",
        path: "/api/push/subscribe",
        body: { ...subscription, sessionFilter },
        token: this.#token,
      },
      options,
    );
  }

  /** Removes a Web Push subscription. */
  unsubscribePush(
    subscriptionId: string,
    options?: CallOptions,
  ): Promise<void> {
    return this.#send(
      {
        method: "DELETE",
        path: `/api/push/subscribe/${encodeURIComponent(subscriptionId)}`,
        token: this.#token,
      },
      options,
      discardBody,
      this.#timeoutMs,
    );
  }
}

/**
 * Factory. Parallel to createHttpClient / createWebTransportClient pattern.
 *
 * @example
 * ```ts
 * import * as noskillsClient from "@eserstack/noskills-client";
 *
 * const client = noskillsClient.createNoskillsClient({
 *   baseUrl: "https://localhost:4433",
 * });
 * await client.login("your_pin");
 * const { sessionId } = await client.createSession("your_project_slug");
 * ```
 */
export function createNoskillsClient(
  config: NoskillsClientConfig,
  fetchFn?: typeof globalThis.fetch,
): NoskillsClient {
  return new NoskillsClient(config, fetchFn);
}
