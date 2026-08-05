// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Public type definitions for @eserstack/noskills-client.
 *
 * Event shape mirrors the server wire protocol defined in
 * pkg/ajan/noskillsserverfx/fanout.go and wt_attach.go.
 *
 * @module
 */

import type {
  FrontendToServer as MuxFrontendFrame,
  ServerToFrontend as MuxServerFrame,
} from "@eserstack/mux";

// =============================================================================
// Config
// =============================================================================

export interface NoskillsClientConfig {
  /** Base URL of the noskills-server daemon (e.g. "https://localhost:4433"). */
  baseUrl: string;
  /** Bearer token returned by POST /auth/login. */
  token?: string;
  /**
   * SHA-256 DER fingerprint(s) for self-signed cert pinning.
   * Passed as serverCertificateHashes to the WebTransport API.
   * Not needed when the daemon uses mkcert (OS CA trust).
   */
  certHashes?: ArrayBuffer[];
}

// =============================================================================
// Auth
// =============================================================================

export interface LoginRequest {
  pin: string;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
}

// =============================================================================
// Projects
// =============================================================================

export interface Project {
  slug: string;
  root: string;
  name?: string;
}

export interface RegisterProjectRequest {
  /** Absolute local path to an existing project. */
  path?: string;
  /** Git URL for clone-on-demand. */
  git?: string;
  /** Explicit slug; auto-derived from path/git if omitted. */
  slug?: string;
}

// =============================================================================
// Sessions
// =============================================================================

export interface Session {
  sessionId: string;
  slug: string;
  startedAt: string;
}

export interface CreateSessionRequest {
  /** Resume from an existing session ID. */
  resumeFrom?: string;
  /**
   * Worker flavour to attach with: "agent" (default, Claude Agent SDK) or "mux"
   * (terminal multiplexer). The daemon stores no per-session state, so the same
   * value must be passed as `?kind=` on attach.
   */
  kind?: "agent" | "mux";
}

export interface CreateSessionResponse {
  sessionId: string;
  kind?: "agent" | "mux";
}

// =============================================================================
// Daemon events (server → client over WebTransport bidi stream)
// =============================================================================

export interface SessionMetaEvent {
  type: "session_meta";
  v: number;
  phase: string;
  title?: string;
  model?: string;
  lastIteration?: number;
}

export interface TranscriptReplayStartEvent {
  type: "transcript_replay_start";
  v: number;
}

export interface TranscriptReplayEndEvent {
  type: "transcript_replay_end";
  v: number;
}

/**
 * One streamed change within an agent turn.
 *
 * This is the event that actually carries model output, and until now it had no
 * variant in {@link DaemonEvent} at all — clients had to cast out of the union
 * to read assistant text.
 *
 * `event` is an ACP `SessionUpdate`: a schema-defined object discriminated by
 * its `sessionUpdate` field (`agent_message_chunk`, `agent_thought_chunk`,
 * `tool_call`, `tool_call_update`, `plan`, …). Sessions still backed by the
 * Claude Agent SDK worker put the SDK's own untyped message here instead, so
 * narrow on `sessionUpdate` being present before relying on the ACP shape.
 */
export interface SdkEvent {
  type: "sdk_event";
  v: number;
  event: { sessionUpdate?: string } & Record<string, unknown>;
}

/**
 * A turn finished. `stopReason` is present for ACP-backed sessions only — the
 * SDK worker had no way to report one.
 */
export interface QueryDoneEvent {
  type: "query_done";
  v: number;
  stopReason?:
    | "end_turn"
    | "max_tokens"
    | "max_turn_requests"
    | "refusal"
    | "cancelled";
}

/**
 * The agent is asking to run a tool.
 *
 * Field names here are the ones actually on the wire. The previous declaration
 * claimed `id` and `tool`; the daemon has always sent `requestId` and
 * `toolName`, so any client written against the old type read `undefined`.
 */
export interface PermissionRequestEvent {
  type: "permission_request";
  v: number;
  requestId: string;
  toolName: string;
  input: unknown;
  toolUseId: string;
  /** ACP only: the exact choices the agent offered. */
  options?: Array<{
    optionId: string;
    name: string;
    kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
  }>;
  /** ACP only: the tool's category, e.g. `read`, `edit`, `execute`. */
  kind?: string;
}

/**
 * A decision the daemon refused to act on.
 *
 * `reason` distinguishes the two causes: a decision it could not interpret, and
 * one it could not journal durably. An unrecognised decision is rejected rather
 * than interpreted — it used to be rewritten to `allow`, which granted a
 * permission the user was never asked about.
 */
export interface PermissionResponseRejectedEvent {
  type: "permission_response_rejected";
  v: number;
  id: string;
  decision: string;
  reason?: string;
  winnerClientId?: string;
}

/**
 * A permission decision, journalled before the agent was told about it.
 *
 * `class` is `write` for tools that change state and `read` otherwise. A
 * `write` decision reaches disk with fdatasync before the agent may act on it,
 * so a crash in between leaves this record absent rather than showing an
 * approval for a tool that never ran.
 */
export interface PermissionDecisionEvent {
  type: "permission_decision";
  v: number;
  id: string;
  tool: string;
  decision: string;
  class: "read" | "write";
}

export interface ClientCountEvent {
  type: "client_count";
  v: number;
  n: number;
}

export interface FanoutEvent {
  type: "fanout";
  v: number;
  from: string;
  payload: unknown;
}

export interface WorkerDiedEvent {
  type: "worker_died";
  v: number;
  reason?: string;
}

export interface WorkerReadyEvent {
  type: "worker_ready";
  v: number;
}

export interface SpawnProgressEvent {
  type: "spawn_progress";
  v: number;
  stage: "starting" | "loading_sdk" | "ready";
}

export interface ForkCreatedEvent {
  type: "fork_created";
  v: number;
  parentSessionId: string;
  newSessionId: string;
  atMessageId?: string;
}

export interface ErrorEvent {
  type: "error";
  v: number;
  code: string;
  message: string;
}

export interface CertRotatingEvent {
  type: "cert_rotating";
  v: number;
  /** SHA-256 hex fingerprint of the incoming leaf cert. */
  newFingerprint: string;
}

/**
 * A mux multiplexer frame, for sessions whose worker hosts a {@link
 * https://jsr.io/@eserstack/mux | mux} server (terminal panes) instead of the
 * one-shot AI agent worker. The whole neutral mux protocol rides inside `frame`,
 * so the daemon's ledger seq / `?after=` replay / fanout keep working unchanged —
 * each mux frame is just one more sequenced ledger entry. `frame` is one of the
 * mux server→frontend messages: `scene` (full or delta), `output` (per-pane VT
 * bytes), or `exit`.
 */
export interface MuxFrameEvent {
  type: "mux";
  v: number;
  frame: MuxServerFrame;
}

// seq is injected by the server's wtSend helper on every outbound message.
// Clients save the last received seq and pass it as ?after=<seq> on reconnect
// so the server can skip already-delivered events (mobile network partition recovery).
export type DaemonEvent =
  & (
    | SessionMetaEvent
    | TranscriptReplayStartEvent
    | TranscriptReplayEndEvent
    | SdkEvent
    | QueryDoneEvent
    | PermissionRequestEvent
    | PermissionResponseRejectedEvent
    | PermissionDecisionEvent
    | ClientCountEvent
    | FanoutEvent
    | WorkerDiedEvent
    | WorkerReadyEvent
    | SpawnProgressEvent
    | ForkCreatedEvent
    | ErrorEvent
    | CertRotatingEvent
    | MuxFrameEvent
  )
  & { seq?: number };

// =============================================================================
// Client → server messages (sent over the bidi stream)
// =============================================================================

export interface UserMessageCommand {
  type: "user_message";
  content: string;
}

export interface PermissionResponseCommand {
  type: "permission_response";
  id: string;
  decision: "allow" | "deny" | "deny_remember";
}

export interface StopCommand {
  type: "stop";
}

export interface AbortCommand {
  type: "abort";
}

export interface SetModelCommand {
  type: "set_model";
  model: string;
}

export interface SetPermissionModeCommand {
  type: "set_permission_mode";
  mode: string;
}

/**
 * A mux frontend command for a mux-hosting session: the whole neutral mux
 * frontend→server protocol rides inside `frame` (one of `attach`, `action`, or
 * `resize`). The daemon relays it straight to that session's mux server.
 */
export interface MuxCommand {
  type: "mux";
  frame: MuxFrontendFrame;
}

export type ClientCommand =
  | UserMessageCommand
  | PermissionResponseCommand
  | StopCommand
  | AbortCommand
  | SetModelCommand
  | SetPermissionModeCommand
  | MuxCommand;

// =============================================================================
// Attach session handle
// =============================================================================

export interface AttachSession {
  /** Async iterator of parsed DaemonEvent objects from the server. */
  events(): AsyncIterable<DaemonEvent>;
  /** Send a typed command to the server. */
  send(cmd: ClientCommand): Promise<void>;
  /** Close the bidi stream and the underlying WT session. */
  close(): void;
  /**
   * The seq of the last event received from this session.
   * Pass as afterSeq in AttachOptions when reconnecting to skip
   * already-delivered events (mobile network partition recovery).
   */
  readonly lastSeq: number;
}
