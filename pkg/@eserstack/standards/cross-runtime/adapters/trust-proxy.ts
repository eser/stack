// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Decides what the forwarded headers of a request mean for `runtime.http`.
 *
 * A client can send these headers itself, so they count only when the socket
 * peer is a proxy the caller listed in `trustProxy`.
 *
 * @module
 */

import * as deps from "./deps.ts";

/**
 * The `trustProxy` entry for a peer on a unix socket, which has no IP address
 * to match. nginx writes `set_real_ip_from unix:` the same way.
 */
export const UNIX_PEER = "unix:";

/** A host with an optional port, or a bracketed IPv6 address with one. */
const FORWARDED_HOST = /^(?:\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i;

/** The proxies a server believes, parsed from its `trustProxy` option. */
export type TrustPolicy = {
  readonly addresses: deps.net.BlockList;
  readonly unixPeers: boolean;
};

/** What the forwarded headers say about a request from a trusted peer. */
export type Forwarded = {
  /** The client's address, or null when no header names a valid one. */
  readonly clientAddress: string | null;
  /** "http" or "https", or null when no header names either. */
  readonly protocol: "http" | "https" | null;
  /** The host and optional port, or null when no header names a valid one. */
  readonly host: string | null;
};

const familyOf = (address: string): "ipv4" | "ipv6" | null => {
  switch (deps.net.isIP(address)) {
    case 4:
      return "ipv4";
    case 6:
      return "ipv6";
    default:
      return null;
  }
};

const invalidEntry = (entry: string): TypeError =>
  new TypeError(
    `runtime.http.serve: trustProxy entry "${entry}" is not valid; use an IP address, a CIDR such as "10.0.0.0/8", or "${UNIX_PEER}" for a unix socket peer`,
  );

/**
 * Parses the `trustProxy` option.
 *
 * @param entries - IP addresses, CIDRs and {@link UNIX_PEER}
 * @returns The policy for {@link resolveForwarded}
 * @throws {TypeError} If an entry is none of those
 */
export const parseTrustProxy = (entries: readonly string[]): TrustPolicy => {
  const addresses = new deps.net.BlockList();
  let unixPeers = false;

  for (const entry of entries) {
    if (entry === UNIX_PEER) {
      unixPeers = true;
      continue;
    }

    const [address, prefix, ...rest] = entry.split("/");
    const family = familyOf(address ?? "");
    if (family === null || rest.length > 0) {
      throw invalidEntry(entry);
    }

    if (prefix === undefined) {
      addresses.addAddress(address!, family);
      continue;
    }

    const bits = /^\d{1,3}$/.test(prefix) ? Number(prefix) : -1;
    if (bits < 0 || bits > (family === "ipv4" ? 32 : 128)) {
      throw invalidEntry(entry);
    }
    addresses.addSubnet(address!, bits, family);
  }

  return { addresses, unixPeers };
};

const isTrustedAddress = (policy: TrustPolicy, address: string): boolean => {
  const family = familyOf(address);

  return family !== null && policy.addresses.check(address, family);
};

/**
 * Walks X-Forwarded-For from the right, the end the trusted proxies wrote. The
 * client is the first address that is not a trusted proxy, or the left-most one
 * when all of them are. Anything further left comes from whoever sent the
 * request, so a client that forges entries only adds them to the part that is
 * never read.
 */
const clientFromHops = (policy: TrustPolicy, header: string): string | null => {
  const hops = header.split(",").map((hop) => hop.trim());
  let client: string | null = null;

  for (let index = hops.length - 1; index >= 0; index -= 1) {
    const hop = hops[index]!;
    if (familyOf(hop) === null) {
      return client;
    }

    client = hop;
    if (!isTrustedAddress(policy, hop)) {
      return client;
    }
  }

  return client;
};

/**
 * The last value of a comma-separated header: the one the nearest proxy set.
 * The values before it can come from the client.
 */
const nearestValue = (header: string): string =>
  header.slice(header.lastIndexOf(",") + 1).trim();

const parseProtocol = (header: string): "http" | "https" | null => {
  const value = nearestValue(header).toLowerCase();

  return value === "http" || value === "https" ? value : null;
};

const parseHost = (header: string): string | null => {
  const value = nearestValue(header);

  return FORWARDED_HOST.test(value) && URL.canParse(`http://${value}`)
    ? value
    : null;
};

const headerValue = (
  value: string | readonly string[] | undefined,
): string | null => {
  if (value === undefined) {
    return null;
  }

  return typeof value === "string" ? value : value.join(",");
};

/**
 * Reads the forwarded headers of a request, if its peer is a trusted proxy.
 *
 * @param policy - The parsed `trustProxy` option
 * @param peer - The socket's remote address, {@link UNIX_PEER} on a unix
 *   socket, or null when the socket has closed
 * @param headers - The request headers, with lower-case names
 * @returns What the headers say, or null when the peer is not trusted, in which
 *   case the headers mean nothing
 */
export const resolveForwarded = (
  policy: TrustPolicy,
  peer: string | null,
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
): Forwarded | null => {
  const trusted =
    peer === UNIX_PEER
      ? policy.unixPeers
      : peer !== null && isTrustedAddress(policy, peer);
  if (!trusted) {
    return null;
  }

  const forwardedFor = headerValue(headers["x-forwarded-for"]);
  const forwardedProto = headerValue(headers["x-forwarded-proto"]);
  const forwardedHost = headerValue(headers["x-forwarded-host"]);

  return {
    clientAddress:
      forwardedFor !== null ? clientFromHops(policy, forwardedFor) : null,
    protocol: forwardedProto !== null ? parseProtocol(forwardedProto) : null,
    host: forwardedHost !== null ? parseHost(forwardedHost) : null,
  };
};
