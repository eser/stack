# 🔌 [@eserstack/noskills-client](./)

> **eserstack Tool** · [eser/stack on GitHub](https://github.com/eser/stack) ·
> **Install:** `pnpm add jsr:@eserstack/noskills-client`

`@eserstack/noskills-client` connects a browser app or a script to a running
[`noskills-server`](../../../cmd/noskills-server/README.md) daemon.
`NoskillsClient` calls the daemon's REST API: PIN login, projects, sessions and
Web Push subscriptions. `attachSession` opens a WebTransport stream to one
session; the daemon replays the session's ledger over it, then streams live
events, and you send commands back on the same stream.

## Quick Start

Log in with the daemon's PIN, start a session in a registered project and print
the events it sends:

```typescript
import * as noskillsClient from "@eserstack/noskills-client";

const config = { baseUrl: "https://localhost:4433" };
const client = noskillsClient.createNoskillsClient(config);

const { token } = await client.login("your_pin");
const { sessionId } = await client.createSession("your_project_slug");

const session = await noskillsClient.attachSession(
  { ...config, token },
  "your_project_slug",
  sessionId,
);

for await (const event of session.events()) {
  console.log(event.type);
}
```

`attachSession` needs a runtime with a global `WebTransport`, such as a current
browser. The REST calls use the global `fetch`; outside a browser, pass a
`fetch` that speaks HTTP/3 as the second argument of `createNoskillsClient`.

## REST Client

`createNoskillsClient(config, fetchFn?)` returns a `NoskillsClient`. `config`
takes `baseUrl`, and optionally the `token` from an earlier login, `certHashes`
for `attachSession` and `timeoutMs` for the REST calls. `login` stores the token
it receives, and every later call sends it as a Bearer token.

| Method                                               | Request                                            |
| ---------------------------------------------------- | -------------------------------------------------- |
| `setup(pin)`                                         | `POST /auth/setup`: sets the daemon's PIN          |
| `login(pin)`                                         | `POST /auth/login`: returns `{ token, expiresAt }` |
| `logout()`                                           | `POST /auth/logout`, then forgets the token        |
| `setToken(token)`, `token`                           | Sets or reads the token, for one you stored        |
| `health()`                                           | `GET /api/health`: `{ version, uptime }`           |
| `listProjects()`                                     | `GET /api/projects`                                |
| `registerProject({ path?, git?, slug? })`            | `POST /api/projects`                               |
| `deleteProject(slug)`                                | `DELETE /api/projects/{slug}`                      |
| `listSessions(slug)`                                 | `GET /api/projects/{slug}/sessions`                |
| `createSession(slug, { resumeFrom?, kind? })`        | `POST /api/projects/{slug}/sessions`               |
| `forkSession(slug, sessionId, atMessageId?, label?)` | `POST /api/projects/{slug}/sessions/{id}/fork`     |
| `getSessionLineage(slug, sessionId)`                 | `GET /api/projects/{slug}/sessions/{id}/lineage`   |
| `getVapidPublicKey()`                                | `GET /api/push/vapid-public-key`                   |
| `subscribePush(subscription, sessionFilter?)`        | `POST /api/push/subscribe`                         |
| `unsubscribePush(subscriptionId)`                    | `DELETE /api/push/subscribe/{id}`                  |

Slugs and ids in the path are percent-encoded. A response with an error status
throws a `NoskillsResponseError` with `method`, `path`, `status` and `detail`
(the response body), and a message of the form
`<method> <path> → <status>: <response body>`.

### Time Limits and Cancellation

Every call waits 10 seconds for the daemon, or `config.timeoutMs` milliseconds
when you set it, and then throws a `NoskillsTimeoutError` that names the call.
`registerProject` with a `git` URL and no `path` waits 5 minutes (300 000 ms)
instead, because the daemon answers only after it has cloned the repository.

Each method that calls the daemon takes an optional last argument with a
`signal` that cancels the call and a `timeoutMs` for this call alone. A
cancelled call rejects with the signal's reason. Give a large repository more
time to clone:

```typescript
import * as noskillsClient from "@eserstack/noskills-client";

const client = noskillsClient.createNoskillsClient({
  baseUrl: "https://localhost:4433",
  token: "your_token",
});

const project = await client.registerProject(
  { git: "https://github.com/your_org/your_repo.git" },
  { timeoutMs: 600_000 },
);
```

## Attaching to a Session

`attachSession(config, slug, sessionId, options?)` resolves to an
`AttachSession`:

| Member          | Description                                                      |
| --------------- | ---------------------------------------------------------------- |
| `events()`      | Async iterable of `DaemonEvent` objects, replay first, then live |
| `send(command)` | Sends a `ClientCommand`; throws once the session is closed       |
| `close()`       | Closes the stream and the WebTransport session                   |
| `lastSeq`       | Sequence number of the last event received                       |

The options are `kind` (`"mux"` for a terminal-multiplexer session, otherwise an
agent session), `afterSeq`, `certHash`, `headers`, `signal` and `timeoutMs`. The
token travels in the query string, because the browser `WebTransport` API cannot
set headers.

The attach, from the fingerprint fetch to the open stream, takes at most 10
seconds, or `timeoutMs`, and then throws a `NoskillsTimeoutError`. `signal`
cancels it while it connects; once the session is attached, end it with
`close()`.

Answer the agent's permission requests as they arrive:

```typescript
import * as noskillsClient from "@eserstack/noskills-client";

const session = await noskillsClient.attachSession(
  { baseUrl: "https://localhost:4433", token: "your_token" },
  "your_project_slug",
  "your_session_id",
);

await session.send({ type: "user_message", content: "Run the tests" });

for await (const event of session.events()) {
  if (event.type === "permission_request") {
    await session.send({
      type: "permission_response",
      id: event.requestId,
      decision: "allow",
    });
  }
}
```

### Events and Commands

Every event has a `type` and may carry the `seq` the daemon stamped on it:

- `transcript_replay_start` and `transcript_replay_end` bracket the ledger
  replay; events in between are history.
- `sdk_event` carries model output: an Agent Client Protocol (ACP) session
  update in `event`. Check `event.sessionUpdate` before you use it, since
  ledgers written by older daemons hold other payloads.
- `permission_request` asks to run a tool; `permission_decision` records the
  answer, and `permission_response_rejected` says the daemon refused one.
- `query_done` ends a turn, with `stopReason` when the agent reported one.
- `session_meta`, `client_count`, `fanout`, `fork_created`, `spawn_progress`,
  `worker_ready`, `worker_died` and `error` report session state.
- `mux` carries a terminal-multiplexer frame in `frame`.
- `cert_rotating` is declared for certificate rotation; the daemon does not send
  it yet.

The commands are `user_message`, `permission_response`, `stop`, `abort`,
`set_permission_mode`, `set_model` and `mux`. The daemon handles `stop` and
`abort` alike, and logs `set_model` as unsupported without acting on it.

A `permission_response` carries one of four decisions: `allow` for this call,
`allow_always` to keep allowing the tool, `deny` for this call, or
`deny_remember` to keep denying it. The daemon answers any other value with
`permission_response_rejected`.

### Resuming After a Dropped Connection

Pass the `lastSeq` of the previous session as `afterSeq`, and the daemon skips
the events you already received:

```typescript
import * as noskillsClient from "@eserstack/noskills-client";

const config = { baseUrl: "https://localhost:4433", token: "your_token" };
const first = await noskillsClient.attachSession(
  config,
  "your_project_slug",
  "your_session_id",
);
// ... the connection drops ...
const resumed = await noskillsClient.attachSession(
  config,
  "your_project_slug",
  "your_session_id",
  { afterSeq: first.lastSeq },
);
```

## Certificate Pinning

By default the daemon serves a self-signed certificate. `attachSession` pins it
through WebTransport's `serverCertificateHashes`, taking the hashes from the
first of these that is set:

1. the `certHash` option, one hash (`null` pins nothing and fetches nothing);
2. every entry of `config.certHashes`, so a daemon that is rotating its
   certificate can match either one;
3. `getCertFingerprint(config.baseUrl)`.

Each hash is the 32-byte SHA-256 fingerprint of the certificate; a hash of
another length throws a `RangeError`. When the daemon has no fingerprint
endpoint, the stream opens without a pin, and the certificate has to be trusted
by the operating system, for example one made with mkcert.

| Function                                        | Description                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `getCertFingerprint(baseUrl, options?)`         | Returns the fingerprint cached for the daemon, or calls `fetchAndPinCertFingerprint`        |
| `fetchAndPinCertFingerprint(baseUrl, options?)` | Fetches `GET /api/cert-fingerprint` (10 s limit), caches it, returns it as an `ArrayBuffer` |
| `storeCertFingerprint(baseUrl, hex)`            | Writes a hex fingerprint to the IndexedDB cache for the daemon                              |
| `loadCertFingerprint(baseUrl)`                  | Reads the hex fingerprint cached for the daemon, or `null`                                  |

The cache in IndexedDB holds one fingerprint per daemon, keyed by the origin of
its `baseUrl`. A fingerprint is 64 hex digits, optionally separated by colons or
spaces; `storeCertFingerprint` refuses anything else with a `RangeError`.

`fetchAndPinCertFingerprint` returns `null` only when the daemon answers 404,
meaning it has no fingerprint endpoint. It throws a `CertFingerprintError` (with
`url` and `status`) when the request fails, the endpoint answers another error
status, or the answer is not a SHA-256 fingerprint, and a `NoskillsTimeoutError`
when the daemon does not answer in time. `options` takes the same `signal` and
`timeoutMs` as the REST calls.

When the handshake fails with a cached fingerprint, `attachSession` fetches the
daemon's current one and, if the certificate changed, dials once more with it.
The daemon does not send `cert_rotating` yet; the event is declared to carry the
next fingerprint, which you would pass to
`storeCertFingerprint(baseUrl, event.newFingerprint)` before you attach again.

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `storeCertFingerprint` and `loadCertFingerprint` take the daemon's base URL.
  Entries cached under the old `active` key are not read; the next attach
  fetches the fingerprint again:

  ```typescript
  import * as noskillsClient from "@eserstack/noskills-client";

  // Before: await noskillsClient.storeCertFingerprint(fingerprint);
  await noskillsClient.storeCertFingerprint(
    "https://localhost:4433",
    fingerprint,
  );
  ```

- `fetchAndPinCertFingerprint` and `getCertFingerprint` return `null` only when
  the daemon answers 404. A network error, another error status, a body that is
  not JSON or an invalid fingerprint throws `CertFingerprintError`, and a
  timeout throws `NoskillsTimeoutError`. Catch these where `null` used to mean
  "no pin".
- `storeCertFingerprint` throws `RangeError` for a value that is not 64 hex
  digits (colons and spaces are allowed), and `attachSession` for a `certHash`
  or `config.certHashes` entry that is not 32 bytes. Pass real SHA-256
  fingerprints.
- `attachSession` pins every `config.certHashes` entry, not only the first. Drop
  old hashes from the list if they must not be accepted any more.
- REST calls time out after 10 s (`registerProject` with a git URL: 300 s), and
  `attachSession` after 10 s, with `NoskillsTimeoutError`; they had no limit.
  Set `config.timeoutMs`, or pass `{ timeoutMs }` per call or in
  `AttachOptions`.

## 🔗 Links

- [eser/stack on GitHub](https://github.com/eser/stack)
- [`noskills-server`](../../../cmd/noskills-server/README.md): the daemon this
  client talks to
- [`@eserstack/webtransport`](../webtransport/README.md): the WebTransport
  client `attachSession` uses
- [`@eserstack/mux`](../mux/): the multiplexer protocol inside `mux` events and
  commands
