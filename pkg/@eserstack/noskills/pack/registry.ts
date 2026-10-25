// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The remote pack registry that `noskills pack search` reads, from
 * `noskills.packRegistry` in `.eser/manifest.yml`.
 *
 * That URL comes from the repository, so whoever wrote the checkout chooses
 * where the request goes. Before any request:
 *
 * - the URL must use https, or http only for a loopback host (a registry served
 *   locally while packs are written), as `requireServiceUrl` in
 *   `@eserstack/posts` requires;
 * - it must not carry a user name or password;
 * - a host written as an IP address must not be private, shared (100.64/10),
 *   link-local, unspecified, multicast or reserved, for IPv4 and IPv6,
 *   including IPv4 addresses embedded in IPv6.
 *
 * The request refuses redirects, so it reaches only the checked URL, stops
 * reading after {@link MAX_REGISTRY_BYTES} and accepts only a registry
 * document.
 *
 * A host name is not resolved and checked, which leaves one case open: a name
 * that resolves to an internal address. `fetch` gives no hook at connect time
 * in Node, and a lookup made before the request can answer
 * differently from the one the connection makes (DNS rebinding), so such a
 * check would not hold. The request is allowed because what it can do is
 * small: it goes over https, so the internal host must present a certificate
 * valid for that name; it is a GET with no credentials; and its body reaches
 * only the local terminal, and only when it is a valid registry.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import type * as packSchema from "./schema.ts";

/** Largest registry document read, in bytes. */
export const MAX_REGISTRY_BYTES: number = 1024 * 1024;

/** Most entries a registry may list. */
export const MAX_REGISTRY_ENTRIES = 10_000;

/** How long the whole request may take, in milliseconds. */
export const REGISTRY_TIMEOUT_MS = 30_000;

/** A registry URL that was refused, or a registry that could not be read. */
export class PackRegistryError extends Error {
  /** The registry URL that was refused or could not be read. */
  readonly url: string;

  // Fields are assigned explicitly: Node's type stripping rejects parameter
  // properties, and this package also runs on Node.
  /** Creates the error for `url` with a message that says what was wrong. */
  constructor(url: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PackRegistryError";
    this.url = url;
  }
}

// =============================================================================
// Addresses
// =============================================================================

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["localhost"]);

const parseIpv4 = (text: string): readonly number[] | null => {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (match === null) return null;

  const octets = match.slice(1).map(Number);

  return octets.every((octet) => octet <= 255) ? octets : null;
};

/** What kind of internal IPv4 address this is, or null for a public one. */
const ipv4Kind = (octets: readonly number[]): string | null => {
  const [a = 0, b = 0, c = 0] = octets;

  if (a === 127) return "loopback";
  if (a === 0) return "unspecified";
  if (a === 10) return "private";
  if (a === 172 && b >= 16 && b <= 31) return "private";
  if (a === 192 && b === 168) return "private";
  if (a === 100 && b >= 64 && b <= 127) return "shared";
  if (a === 169 && b === 254) return "link-local";
  if (a === 192 && b === 0 && c === 0) return "reserved";
  if (a === 198 && (b === 18 || b === 19)) return "reserved";
  if (a >= 224 && a <= 239) return "multicast";
  if (a >= 240) return "reserved";

  return null;
};

/** The eight 16-bit groups of an IPv6 address, or null when it is not one. */
const parseIpv6 = (text: string): readonly number[] | null => {
  let body = text;
  let tail: readonly number[] | null = null;

  // A dotted IPv4 tail (`::ffff:169.254.169.254`) fills the last two groups:
  // parse it as two placeholder groups, then put its value in.
  const lastColon = body.lastIndexOf(":");
  const ipv4 = parseIpv4(body.slice(lastColon + 1));
  if (ipv4 !== null) {
    const [a = 0, b = 0, c = 0, d = 0] = ipv4;
    tail = [(a << 8) | b, (c << 8) | d];
    body = `${body.slice(0, lastColon + 1)}0:0`;
  }

  const halves = body.split("::");
  if (halves.length > 2) return null;

  const toGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const groups = part
      .split(":")
      .map((group) =>
        /^[0-9a-f]{1,4}$/i.test(group) ? parseInt(group, 16) : Number.NaN,
      );

    return groups.some(Number.isNaN) ? null : groups;
  };

  const head = toGroups(halves[0] ?? "");
  const rest = halves.length === 2 ? toGroups(halves[1] ?? "") : [];
  if (head === null || rest === null) return null;

  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;

  const groups = [...head, ...new Array<number>(missing).fill(0), ...rest];

  return tail === null ? groups : [...groups.slice(0, 6), ...tail];
};

/** What kind of internal IPv6 address this is, or null for a public one. */
const ipv6Kind = (groups: readonly number[]): string | null => {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] =
    groups;
  const embeddedIpv4 = [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff];
  const firstFiveZero =
    g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;

  if (firstFiveZero && g5 === 0 && g6 === 0) {
    if (g7 === 0) return "unspecified";
    if (g7 === 1) return "loopback";
  }
  // IPv4-mapped (::ffff:0:0/96) and IPv4-compatible (::/96) addresses.
  if (firstFiveZero && (g5 === 0xffff || g5 === 0)) {
    return ipv4Kind(embeddedIpv4);
  }
  // NAT64 (64:ff9b::/96) reaches the embedded IPv4 address.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0) {
    return ipv4Kind(embeddedIpv4);
  }
  if ((g0 & 0xfe00) === 0xfc00) return "private"; // unique local, fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return "link-local"; // fe80::/10
  if ((g0 & 0xffc0) === 0xfec0) return "private"; // site-local, fec0::/10
  if ((g0 & 0xff00) === 0xff00) return "multicast"; // ff00::/8

  return null;
};

/**
 * What kind of internal address a URL host names: "loopback", "private",
 * "shared", "link-local", "unspecified", "multicast" or "reserved". Null for a
 * public address and for every host name, which is not resolved here.
 */
export const internalAddressKind = (hostname: string): string | null => {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (LOOPBACK_HOSTNAMES.has(host)) return "loopback";

  if (host.startsWith("[") && host.endsWith("]")) {
    const groups = parseIpv6(host.slice(1, -1));
    return groups === null ? null : ipv6Kind(groups);
  }

  const octets = parseIpv4(host);

  return octets === null ? null : ipv4Kind(octets);
};

// =============================================================================
// URL
// =============================================================================

/**
 * Checks `noskills.packRegistry` from the manifest. The URL parser has
 * already turned every IPv4 spelling (`2852039166`, `0xa9fea9fe`) into dotted
 * form and IPv6 into its short form by the time the host is checked.
 */
export const parseRegistryUrl = (
  value: unknown,
): results.Result<URL, PackRegistryError> => {
  if (typeof value !== "string") {
    return results.fail(
      new PackRegistryError(
        String(value),
        `packRegistry in .eser/manifest.yml must be a URL string, got ${typeof value}`,
      ),
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return results.fail(
      new PackRegistryError(
        value,
        `packRegistry "${value}" is not an absolute URL; expected one like https://packs.example.com/registry.json`,
      ),
    );
  }

  if (url.username !== "" || url.password !== "") {
    // Neither the message nor the error names the credentials.
    const withoutCredentials = `${url.origin}${url.pathname}`;
    return results.fail(
      new PackRegistryError(
        withoutCredentials,
        `packRegistry ${withoutCredentials} must not contain a user name or password`,
      ),
    );
  }

  const kind = internalAddressKind(url.hostname);
  const isLoopback = kind === "loopback";

  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    return results.fail(
      new PackRegistryError(
        value,
        `packRegistry ${value} must use https:// (http:// is allowed only for localhost, 127.0.0.1 or [::1])`,
      ),
    );
  }

  if (kind !== null && !isLoopback) {
    return results.fail(
      new PackRegistryError(
        value,
        `packRegistry ${value} points at a ${kind} address; noskills does not send requests to internal addresses`,
      ),
    );
  }

  return results.ok(url);
};

// =============================================================================
// Document
// =============================================================================

const SOURCES: ReadonlySet<string> = new Set(["builtin", "local", "remote"]);

/** True for C0 and C1 control characters, which could drive the terminal. */
const hasControlCharacter = (text: string): boolean => {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }

  return false;
};

const isText = (value: unknown): value is string =>
  typeof value === "string" && !hasControlCharacter(value);

/** A parsed JSON object (not an array). */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value instanceof Object && !Array.isArray(value);

/** Why one registry entry is invalid, or null when it is valid. */
const entryProblem = (entry: unknown): string | null => {
  if (!isRecord(entry)) return "must be an object";

  const fields = entry;
  if (!isText(fields["name"]) || fields["name"] === "") {
    return "name must be a non-empty string without control characters";
  }
  for (const key of ["description", "version"]) {
    if (!isText(fields[key])) {
      return `${key} must be a string without control characters`;
    }
  }
  if (typeof fields["source"] !== "string" || !SOURCES.has(fields["source"])) {
    return `source must be one of ${[...SOURCES].join(", ")}`;
  }

  const tags = fields["tags"];
  if (tags !== undefined && !(Array.isArray(tags) && tags.every(isText))) {
    return "tags must be a list of strings without control characters";
  }

  const specifier = fields["specifier"];
  if (specifier !== undefined && !isText(specifier)) {
    return "specifier must be a string without control characters";
  }

  return null;
};

/**
 * Validates a parsed registry document. Its strings are printed to the
 * terminal, so control characters are refused along with wrong types.
 */
export const parseRegistry = (
  data: unknown,
): results.Result<packSchema.PackRegistry, string> => {
  const packs = isRecord(data) ? data["packs"] : undefined;

  if (!Array.isArray(packs)) {
    return results.fail(`the document has no "packs" list`);
  }
  if (packs.length > MAX_REGISTRY_ENTRIES) {
    return results.fail(
      `it lists ${packs.length} packs; the limit is ${MAX_REGISTRY_ENTRIES}`,
    );
  }

  for (const [index, entry] of packs.entries()) {
    const problem = entryProblem(entry);
    if (problem !== null) return results.fail(`packs[${index}].${problem}`);
  }

  return results.ok({ packs: packs as packSchema.PackRegistryEntry[] });
};

// =============================================================================
// Request
// =============================================================================

/** Reads a body up to `limit` bytes; null when it is longer. */
const readBounded = async (
  body: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array | null> => {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (size <= limit) {
      // A stream is read one chunk at a time; each read waits for the last.
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;

      size += value.byteLength;
      chunks.push(value);
    }

    if (size > limit) {
      // Stop the transfer instead of draining the rest of the body.
      await reader.cancel();
      return null;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
};

/**
 * Fetches and validates the registry at a URL that {@link parseRegistryUrl}
 * accepted. Every failure (network, status, redirect, size, format) comes back
 * as a {@link PackRegistryError} whose message names the URL and the cause.
 */
export const fetchRegistry = async (
  url: URL,
  signal?: AbortSignal,
): Promise<results.Result<packSchema.PackRegistry, PackRegistryError>> => {
  const href = url.href;
  const timeout = AbortSignal.timeout(REGISTRY_TIMEOUT_MS);
  const fail = (message: string, cause?: unknown) =>
    results.fail(
      new PackRegistryError(
        href,
        `pack registry ${href}: ${message}`,
        cause === undefined ? undefined : { cause },
      ),
    );

  let response: Response;
  try {
    response = await globalThis.fetch(href, {
      redirect: "manual",
      credentials: "omit",
      headers: { accept: "application/json" },
      signal:
        signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return fail(`the request failed: ${detail}`, error);
  }

  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    const location = response.headers.get("location") ?? "an unnamed location";
    return fail(
      `redirects to ${location}; set packRegistry to the final URL if you trust it`,
    );
  }

  if (!response.ok) {
    await response.body?.cancel();
    return fail(`answered HTTP ${response.status}`);
  }

  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_REGISTRY_BYTES) {
    await response.body?.cancel();
    return fail(`the document is larger than ${MAX_REGISTRY_BYTES} bytes`);
  }

  const bytes =
    response.body === null
      ? new Uint8Array()
      : await readBounded(response.body, MAX_REGISTRY_BYTES);
  if (bytes === null) {
    return fail(`the document is larger than ${MAX_REGISTRY_BYTES} bytes`);
  }

  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    return fail("the document is not JSON", error);
  }

  const registry = parseRegistry(data);
  if (results.isFail(registry)) {
    return fail(`the document is not a pack registry: ${registry.error}`);
  }

  return results.ok(registry.value);
};
