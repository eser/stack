// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Public type definitions for @eserstack/noskills-client.
 *
 * Event shape mirrors the server wire protocol defined in
 * pkg/ajan/noskillsserverfx/fanout.go and wt_attach.go.
 *
 * @module
 */

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
}

export interface CreateSessionResponse {
  sessionId: string;
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

export interface DeltaEvent {
  type: "delta";
  v: number;
  text: string;
}

export interface ToolStartEvent {
  type: "tool_start";
  v: number;
  id: string;
  tool: string;
  input: unknown;
}

export interface ToolResultEvent {
  type: "tool_result";
  v: number;
  id: string;
  output: string;
}

export interface PermissionRequestEvent {
  type: "permission_request";
  v: number;
  id: string;
  tool: string;
  input: unknown;
}

export interface PermissionResponseRejectedEvent {
  type: "permission_response_rejected";
  v: number;
  id: string;
  winnerClientId: string;
  decision: string;
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

// seq is injected by the server's wtSend helper on every outbound message.
// Clients save the last received seq and pass it as ?after=<seq> on reconnect
// so the server can skip already-delivered events (mobile network partition recovery).
export type DaemonEvent = (
  | SessionMetaEvent
  | TranscriptReplayStartEvent
  | TranscriptReplayEndEvent
  | DeltaEvent
  | ToolStartEvent
  | ToolResultEvent
  | PermissionRequestEvent
  | PermissionResponseRejectedEvent
  | ClientCountEvent
  | FanoutEvent
  | WorkerDiedEvent
  | WorkerReadyEvent
  | SpawnProgressEvent
  | ForkCreatedEvent
  | ErrorEvent
  | CertRotatingEvent
) & { seq?: number };

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

export type ClientCommand =
  | UserMessageCommand
  | PermissionResponseCommand
  | StopCommand
  | AbortCommand
  | SetModelCommand
  | SetPermissionModeCommand;

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
