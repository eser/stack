/**
 * noskills-server TS worker — one process per Claude Code session.
 *
 * Usage:  node worker.js <unix-socket-path>
 *
 * Wire protocol (line-delimited JSON over Unix socket):
 *
 * Daemon → Worker:
 *   {type:"query_start", cwd, sessionId, prompt?, resume?}
 *   {type:"push_message", content}
 *   {type:"permission_response", requestId, behavior, message?}
 *   {type:"stop_task"}
 *   {type:"abort"}
 *   {type:"shutdown"}
 *
 * Worker → Daemon:
 *   {type:"ready"}
 *   {type:"spawn_progress", stage:"starting"|"loading_sdk"|"ready"}
 *   {type:"sdk_event", event}
 *   {type:"permission_request", requestId, toolName, input, toolUseId}
 *   {type:"query_done"}
 *   {type:"query_error", error, exitCode?, stderr?}
 */

// Force IPv4-only — prevents 10s stalls on servers without IPv6 outbound.
process.env["NODE_OPTIONS"] = (process.env["NODE_OPTIONS"] ?? "") +
  " --dns-result-order=ipv4first --no-network-family-autoselection";

import process from "node:process";
import * as net from "node:net";
import * as crypto from "node:crypto";

const socketPath = process.argv[2];

if (!socketPath) {
  process.stderr.write("[worker] missing socket path argument\n");
  process.exit(1);
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface MessageQueue {
  push(msg: string): void;
  end(): void;
  [Symbol.asyncIterator](): AsyncIterator<string>;
}

// Daemon → Worker message discriminated union.
interface QueryStartMsg { type: "query_start"; cwd: string; sessionId: string; prompt?: string; resume?: string }
interface PushMessageMsg { type: "push_message"; content: string }
interface PermissionResponseMsg { type: "permission_response"; requestId: string; behavior: string; message?: string }
interface SimpleMsg { type: "stop_task" | "abort" | "shutdown" }
type DaemonMsg = QueryStartMsg | PushMessageMsg | PermissionResponseMsg | SimpleMsg;

// Pending permission requests: requestId → resolver.
const pendingPermissions = new Map<string, (result: { behavior: string; message?: string }) => void>();

// ── Message queue ──────────────────────────────────────────────────────────────

function createMessageQueue(): MessageQueue {
  const queue: string[] = [];
  let waiting: ((result: { value: string; done: boolean }) => void) | null = null;
  let ended = false;

  return {
    push(msg: string) {
      if (waiting) {
        const resolve = waiting;
        waiting = null;
        resolve({ value: msg, done: false });
      } else {
        queue.push(msg);
      }
    },
    end() {
      ended = true;
      if (waiting) {
        const resolve = waiting;
        waiting = null;
        resolve({ value: "", done: true });
      }
    },
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift()!, done: false });
          }

          if (ended) {
            return Promise.resolve({ value: "", done: true });
          }

          return new Promise<{ value: string; done: boolean }>((resolve) => {
            waiting = resolve;
          });
        },
      };
    },
  };
}

// ── Connection ─────────────────────────────────────────────────────────────────

let conn: net.Socket | null = null;
let readBuffer = "";

function sendToDaemon(msg: Record<string, unknown>): void {
  if (!conn || conn.destroyed) return;
  conn.write(JSON.stringify(msg) + "\n");
}

async function handleDaemonMessage(raw: DaemonMsg): Promise<void> {
  switch (raw.type) {
    case "query_start":
      await handleQueryStart(raw);
      break;
    case "push_message":
      handlePushMessage(raw.content);
      break;
    case "permission_response":
      handlePermissionResponse(raw.requestId, raw.behavior, raw.message);
      break;
    case "stop_task":
    case "abort":
      currentAbortController?.abort();
      break;
    case "shutdown":
      conn?.destroy();
      process.exit(0);
      break;
  }
}

// ── Per-query state ────────────────────────────────────────────────────────────

let currentMessageQueue: MessageQueue | null = null;
let currentAbortController: AbortController | null = null;

// ── SDK lazy loader ────────────────────────────────────────────────────────────

// Minimal interface for what we call on the Claude Agent SDK.
interface ClaudeSDK {
  // deno-lint-ignore no-explicit-any
  query(opts: { prompt: AsyncIterable<string>; options: Record<string, unknown> }): AsyncIterable<any>;
}

let cachedSDK: ClaudeSDK | null = null;

async function getSDK(): Promise<ClaudeSDK> {
  if (cachedSDK) return cachedSDK;

  sendToDaemon({ type: "spawn_progress", stage: "loading_sdk" });

  // Dynamic import so the worker can be compiled with tsc without bundling the SDK.
  cachedSDK = await import("@anthropic-ai/claude-agent-sdk") as ClaudeSDK;

  sendToDaemon({ type: "spawn_progress", stage: "ready" });

  return cachedSDK;
}

// ── Query handling ─────────────────────────────────────────────────────────────

async function handleQueryStart(msg: QueryStartMsg): Promise<void> {
  const sdk = await getSDK().catch((err: Error) => {
    sendToDaemon({ type: "query_error", error: `Failed to load SDK: ${err.message}`, exitCode: null, stderr: null });

    return null;
  });

  if (!sdk) return;

  currentMessageQueue = createMessageQueue();
  currentAbortController = new AbortController();

  // Push the initial user message (if any).
  if (msg.prompt) {
    currentMessageQueue.push(msg.prompt);
  }

  const options: Record<string, unknown> = {
    cwd: msg.cwd,
    abortController: currentAbortController,
    canUseTool: canUseTool,
  };

  if (msg.resume) {
    options["resume"] = msg.resume;
  }

  let queryInstance;

  try {
    queryInstance = sdk.query({ prompt: currentMessageQueue, options });
  } catch (err) {
    const e = err as Error;
    sendToDaemon({ type: "query_error", error: `Failed to create query: ${e.message}`, exitCode: null, stderr: null });
    currentMessageQueue = null;
    currentAbortController = null;

    return;
  }

  try {
    for await (const event of queryInstance) {
      sendToDaemon({ type: "sdk_event", event });
    }

    sendToDaemon({ type: "query_done" });
  } catch (err) {
    const e = err as Error & { exitCode?: number; stderr?: string };
    sendToDaemon({
      type: "query_error",
      error: e.message || String(err),
      exitCode: e.exitCode ?? null,
      stderr: e.stderr ?? null,
    });
  } finally {
    currentMessageQueue = null;
    currentAbortController = null;
    pendingPermissions.clear();
  }
}

function handlePushMessage(content: string): void {
  currentMessageQueue?.push(content);
}

function handlePermissionResponse(requestId: string, behavior: string, message?: string): void {
  const resolve = pendingPermissions.get(requestId);

  if (!resolve) return;

  pendingPermissions.delete(requestId);
  resolve({ behavior, message });
}

// ── canUseTool ─────────────────────────────────────────────────────────────────

function canUseTool(
  toolName: string,
  input: Record<string, unknown>,
  opts: { toolUseID?: string; signal?: AbortSignal; [key: string]: unknown },
): Promise<{ behavior: string; message?: string }> {
  const requestId = crypto.randomUUID();

  sendToDaemon({
    type: "permission_request",
    requestId,
    toolName,
    input,
    toolUseId: opts.toolUseID ?? "",
  });

  return new Promise((resolve) => {
    pendingPermissions.set(requestId, resolve);

    opts.signal?.addEventListener("abort", () => {
      pendingPermissions.delete(requestId);
      resolve({ behavior: "deny", message: "Cancelled" });
    });
  });
}

// ── Main ───────────────────────────────────────────────────────────────────────

const client = net.createConnection({ path: socketPath }, () => {
  conn = client;
  sendToDaemon({ type: "spawn_progress", stage: "starting" });
  sendToDaemon({ type: "ready" });
});

client.on("data", (chunk) => {
  readBuffer += chunk.toString();

  const lines = readBuffer.split("\n");
  readBuffer = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const msg = JSON.parse(trimmed);
      handleDaemonMessage(msg).catch((err: Error) => {
        process.stderr.write(`[worker] handleDaemonMessage error: ${err.message}\n`);
      });
    } catch {
      process.stderr.write(`[worker] failed to parse message: ${trimmed}\n`);
    }
  }
});

client.on("error", (err) => {
  process.stderr.write(`[worker] socket error: ${err.message}\n`);
  process.exit(1);
});

client.on("close", () => {
  process.exit(0);
});
