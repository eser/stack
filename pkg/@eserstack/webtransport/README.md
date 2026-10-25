# 🚇 [@eserstack/webtransport](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/webtransport` is
> published on npm under the same name (`pnpm add @eserstack/webtransport`); the
> JSR versions stay available but get no updates.

> **eserstack Tool** · [eser/stack on GitHub](https://github.com/eser/stack) ·
> **Install:** `pnpm add jsr:@eserstack/webtransport`

`@eserstack/webtransport` wraps the `WebTransport` API in a client for
bidirectional streams, unidirectional streams and datagrams over HTTP/3. It
follows the factory pattern of `@eserstack/httpclient`: you create a client with
a `baseUrl`, then connect to paths under it. It adds certificate pinning for
self-signed servers and a dial timeout. Use `@eserstack/httpclient` for REST
requests and this package for long-lived streams.

The client needs a runtime that provides a global `WebTransport`, such as a
current browser.

## Quick Start

Connect to a server, open a bidirectional stream and write one line to it:

```typescript
import * as webtransport from "@eserstack/webtransport";

const client = webtransport.createWebTransportClient({
  baseUrl: "https://localhost:4433",
});

const session = await client.connect("/your_endpoint_path");
const stream = await session.openBidirectionalStream();

const writer = stream.writable.getWriter();
await writer.write(new TextEncoder().encode("hello\n"));
writer.releaseLock();

session.close();
```

## Client

### `createWebTransportClient(config?)`

Returns a `WebTransportClient`. Every option is optional:

| Option          | Type            | Description                                                                                   |
| --------------- | --------------- | --------------------------------------------------------------------------------------------- |
| `baseUrl`       | `string`        | Prefix for paths passed to `connect`; a full `https://` or `http://` URL is used as given     |
| `certHashes`    | `ArrayBuffer[]` | SHA-256 hashes of the server certificate, passed to WebTransport as `serverCertificateHashes` |
| `dialTimeout`   | `number`        | Milliseconds to wait for the session to be ready; `0` or unset waits with no limit            |
| `_newTransport` | `function`      | Replaces `new WebTransport(url, options)`, for tests that run without a server                |

`certHashes` lets a browser accept a self-signed certificate without trusting it
in the operating system. Pass the hash the server publishes:

```typescript
import * as webtransport from "@eserstack/webtransport";

const hex = "your_sha256_fingerprint_hex";
const hash = new Uint8Array(
  hex.match(/../g)!.map((pair) => Number.parseInt(pair, 16)),
).buffer;

const client = webtransport.createWebTransportClient({
  baseUrl: "https://localhost:4433",
  certHashes: [hash],
  dialTimeout: 5000,
});
```

### `client.connect(urlOrPath, headers?)`

Opens a session and resolves once it is ready. It rejects when the handshake
fails, or when `dialTimeout` passes first; in that case it closes the pending
session and the error says how long it waited. The `headers` argument is
accepted for API symmetry and not sent: the browser `WebTransport` API has no
way to set request headers, so pass values such as tokens in the query string.

## Session

`connect` resolves to a `WebTransportSession`:

| Member                        | Description                                                            |
| ----------------------------- | ---------------------------------------------------------------------- |
| `openBidirectionalStream()`   | Opens a stream you can read from and write to                          |
| `acceptBidirectionalStream()` | Waits for the next stream the server opens; rejects once closed        |
| `openUnidirectionalStream()`  | Opens a send-only stream                                               |
| `datagrams`                   | `{ readable, writable }` for unreliable, unordered messages            |
| `ready` / `closed`            | Promises from the underlying `WebTransport` object                     |
| `close(closeInfo?)`           | Closes the session, optionally with a close code and reason            |
| `inner`                       | The native `WebTransport` object, for APIs this wrapper does not cover |

Read the server's replies from a stream with its `readable` side:

```typescript
import * as webtransport from "@eserstack/webtransport";

const client = webtransport.createWebTransportClient({
  baseUrl: "https://localhost:4433",
});
const session = await client.connect("/your_endpoint_path");
const stream = await session.openBidirectionalStream();

const reader = stream.readable.pipeThrough(new TextDecoderStream()).getReader();
const { value } = await reader.read();
console.log(value);

session.close();
```

## 🔗 Links

- [eser/stack on GitHub](https://github.com/eser/stack)
- [`@eserstack/httpclient`](../httpclient/): the HTTP client this package
  mirrors, for REST requests
- [`@eserstack/noskills-client`](../noskills-client/README.md): attaches to
  `noskills-server` sessions over this client
- [WebTransport on MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport):
  the browser API underneath
