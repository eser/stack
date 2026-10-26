// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * noskills-client — browser + Node SDK for the noskills-server daemon.
 *
 * REST calls:        createNoskillsClient()
 * WebTransport:      attachSession()
 * Cert fingerprint:  fetchAndPinCertFingerprint() / getCertFingerprint()
 * Errors:            NoskillsTimeoutError, NoskillsResponseError,
 *                    CertFingerprintError
 *
 * @module
 */

export type {
  AbortCommand,
  AttachSession,
  CallOptions,
  CertRotatingEvent,
  ClientCommand,
  ClientCountEvent,
  CreateSessionRequest,
  CreateSessionResponse,
  DaemonEvent,
  ErrorEvent,
  FanoutEvent,
  ForkCreatedEvent,
  LoginRequest,
  LoginResponse,
  MuxCommand,
  MuxFrameEvent,
  NoskillsClientConfig,
  PermissionDecision,
  PermissionDecisionEvent,
  PermissionRequestEvent,
  PermissionResponseCommand,
  PermissionResponseRejectedEvent,
  Project,
  QueryDoneEvent,
  RegisterProjectRequest,
  SdkEvent,
  Session,
  SessionMetaEvent,
  SetModelCommand,
  SetPermissionModeCommand,
  SpawnProgressEvent,
  StopCommand,
  TranscriptReplayEndEvent,
  TranscriptReplayStartEvent,
  UserMessageCommand,
  WorkerDiedEvent,
  WorkerReadyEvent,
} from "./types.ts";
export {
  fetchAndPinCertFingerprint,
  getCertFingerprint,
  loadCertFingerprint,
  storeCertFingerprint,
} from "./cert.ts";
export { createNoskillsClient, NoskillsClient } from "./client.ts";
export {
  CertFingerprintError,
  NoskillsResponseError,
  NoskillsTimeoutError,
} from "./errors.ts";
export { type AttachOptions, attachSession } from "./attach.ts";
