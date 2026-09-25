// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @module @eserstack/http/middlewares/rate-limiter
 *
 * Rate limiting middleware to protect against DDoS and brute force attacks.
 * Uses an instance-based approach where each rate limiter maintains its own store.
 *
 * @example
 * ```typescript
 * import { rateLimiter } from "@eserstack/http/middlewares";
 *
 * const limiter = rateLimiter.createRateLimiter({
 *   maxRequests: 100,
 *   windowMs: 60000,
 *   skipPaths: ["/health", "/api/public"],
 * });
 *
 * // In your request handler:
 * const rateLimitResponse = limiter.check(req, pathname);
 * if (rateLimitResponse) {
 *   return rateLimitResponse; // 429 Too Many Requests
 * }
 * ```
 */

// Named constants for magic values
const MS_PER_SECOND = 1000;
const DEFAULT_WINDOW_MS = 60 * MS_PER_SECOND; // 1 minute
const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_SKIP_PATHS = ["/health"];
const DEFAULT_SKIP_IPS = ["127.0.0.1", "::1"];
const DEFAULT_TRUSTED_PROXIES = ["127.0.0.1", "::1"];

/**
 * Address of the peer that opened the connection, as reported by the server
 * (for example Deno.serve's `info.remoteAddr`). Only `hostname` is read.
 */
export type RemoteAddress = { readonly hostname: string } | null | undefined;

/**
 * Rate limit configuration
 */
export type RateLimitConfig = {
  /** Maximum requests allowed in the window (must be > 0) */
  maxRequests: number;
  /** Time window in milliseconds (must be > 0) */
  windowMs: number;
  /** Custom message for rate limit exceeded */
  message?: string;
  /** Skip rate limiting for specific paths */
  skipPaths?: string[];
  /**
   * Skip rate limiting for specific client addresses. Compared against the
   * resolved client identity, which comes from the socket peer or from a
   * forwarded header that a trusted proxy supplied, never from a header the
   * client sent directly.
   */
  skipIps?: string[];
  /** Custom key generator function (defaults to IP-based) */
  keyGenerator?: (req: Request) => string;
  /**
   * Read the client address from X-Forwarded-For / X-Real-IP.
   * When the caller passes the connection's remote address to `check`, the
   * headers are honoured only if that peer is listed in `trustedProxies`.
   * Without a remote address the headers are honoured as-is, so enable this
   * only behind a proxy that overwrites them.
   * @default false
   */
  trustProxy?: boolean;
  /**
   * Peer addresses whose forwarded headers are believed when `trustProxy` is
   * on. The client is the right-most X-Forwarded-For hop not in this list.
   * @default ["127.0.0.1", "::1"]
   */
  trustedProxies?: string[];
};

/**
 * Rate limit entry tracking (internal type)
 */
type RateLimitEntry = {
  count: number;
  resetTime: number;
};

/**
 * Rate limiter instance with its own state
 */
export type RateLimiterInstance = {
  /**
   * Check if request should be rate limited. Pass the connection's remote
   * address so the limiter can key on the peer instead of client headers.
   */
  check: (
    req: Request,
    pathname: string,
    remote?: RemoteAddress,
  ) => Response | null;
  /** Get rate limit headers for a response */
  getHeaders: (clientIp: string, pathname: string) => Record<string, string>;
  /** Stop the cleanup interval and clear the store */
  stop: () => void;
  /** Get current store size (for monitoring) */
  getStoreSize: () => number;
};

/**
 * Default rate limit configuration
 */
const DEFAULT_OPTIONS: Required<Omit<RateLimitConfig, "keyGenerator">> & {
  keyGenerator?: (req: Request) => string;
} = {
  maxRequests: DEFAULT_MAX_REQUESTS,
  windowMs: DEFAULT_WINDOW_MS,
  message: "Too many requests, please try again later.",
  skipPaths: DEFAULT_SKIP_PATHS,
  skipIps: DEFAULT_SKIP_IPS,
  trustProxy: false,
  trustedProxies: DEFAULT_TRUSTED_PROXIES,
};

/**
 * Validate IPv4 address format
 */
const isValidIPv4 = (ip: string): boolean => {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    const num = Number(part);
    return Number.isInteger(num) && num >= 0 && num <= 255;
  });
};

/**
 * Validate IPv6 address format (basic validation)
 */
const isValidIPv6 = (ip: string): boolean => {
  // Basic IPv6 validation - accepts standard and compressed formats
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv6Regex.test(ip) || ip === "::1" || ip === "::";
};

/**
 * Validate IP address format
 */
const isValidIP = (ip: string): boolean => {
  return isValidIPv4(ip) || isValidIPv6(ip);
};

/** Strips the IPv4-mapped IPv6 prefix so "::ffff:10.0.0.1" matches "10.0.0.1". */
const normalizeIp = (ip: string): string => {
  const trimmed = ip.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("::ffff:") && isValidIPv4(trimmed.slice(7))) {
    return trimmed.slice(7);
  }
  return trimmed;
};

/** Identity used when no client address can be established. */
export const UNKNOWN_CLIENT = "unknown";

/**
 * Get the client address for a request.
 *
 * The socket peer (`remote`) is the authority. Forwarded headers are read only
 * when `trustProxy` is on and, if the peer is known, the peer is one of
 * `trustedProxies`; the client is then the right-most X-Forwarded-For hop that
 * is not itself a trusted proxy, falling back to X-Real-IP. Returns
 * `UNKNOWN_CLIENT` when nothing valid is available.
 *
 * SECURITY NOTE: without `remote`, enabling `trustProxy` believes whatever the
 * client sent. Pass the remote address whenever the server exposes it.
 */
export const getClientIp = (
  req: Request,
  trustProxy = false,
  remote?: RemoteAddress,
  trustedProxies: readonly string[] = DEFAULT_TRUSTED_PROXIES,
): string => {
  const peer = remote?.hostname !== undefined
    ? normalizeIp(remote.hostname)
    : undefined;
  const peerIsValid = peer !== undefined && isValidIP(peer);
  const trusted = trustedProxies.map(normalizeIp);

  if (trustProxy && (peer === undefined || trusted.includes(peer))) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded !== null) {
      const hops = forwarded.split(",").map(normalizeIp);
      for (let i = hops.length - 1; i >= 0; i--) {
        const hop = hops[i]!;
        if (!isValidIP(hop)) break;
        if (!trusted.includes(hop)) return hop;
      }
    }

    const realIp = req.headers.get("x-real-ip");
    if (realIp !== null) {
      const candidate = normalizeIp(realIp);
      if (isValidIP(candidate)) {
        return candidate;
      }
    }
  }

  return peerIsValid ? peer : UNKNOWN_CLIENT;
};

/**
 * Validate rate limit configuration
 * @throws Error if configuration is invalid
 */
const validateConfig = (config: RateLimitConfig): void => {
  if (config.maxRequests <= 0) {
    throw new Error("maxRequests must be a positive number");
  }
  if (!Number.isInteger(config.maxRequests)) {
    throw new Error("maxRequests must be an integer");
  }
  if (config.windowMs <= 0) {
    throw new Error("windowMs must be a positive number");
  }
  if (!Number.isFinite(config.windowMs)) {
    throw new Error("windowMs must be a finite number");
  }
};

/**
 * Create rate limiting middleware instance.
 * Each instance maintains its own store and cleanup interval.
 *
 * @param config - Rate limit configuration
 * @returns Rate limiter instance with check, getHeaders, and stop methods
 * @throws Error if configuration is invalid
 *
 * @example
 * ```typescript
 * import { rateLimiter } from "@eserstack/http/middlewares";
 *
 * const limiter = rateLimiter.createRateLimiter({
 *   maxRequests: 100,
 *   windowMs: 60000,
 *   skipPaths: ["/health", "/api/public"],
 * });
 *
 * // In your request handler:
 * const rateLimitResponse = limiter.check(req, pathname);
 * if (rateLimitResponse) {
 *   return rateLimitResponse; // 429 Too Many Requests
 * }
 *
 * // Add rate limit headers to successful response
 * const headers = limiter.getHeaders(clientIp, pathname);
 *
 * // On shutdown:
 * limiter.stop();
 * ```
 */
export const createRateLimiter = (
  config: Partial<RateLimitConfig> = {},
): RateLimiterInstance => {
  const mergedConfig = { ...DEFAULT_OPTIONS, ...config };

  // Validate configuration
  validateConfig(mergedConfig);

  const {
    maxRequests,
    windowMs,
    message,
    skipPaths,
    skipIps,
    keyGenerator,
    trustProxy,
    trustedProxies,
  } = mergedConfig;

  // Instance-specific store (not shared between instances)
  const store = new Map<string, RateLimitEntry>();

  // Instance-specific cleanup interval
  let cleanupInterval: ReturnType<typeof setInterval> | null = null;

  const startCleanup = (): void => {
    if (cleanupInterval !== null) return;

    cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of store.entries()) {
        if (now > entry.resetTime) {
          store.delete(key);
        }
      }
    }, windowMs);
  };

  // Start cleanup immediately
  startCleanup();

  const check = (
    req: Request,
    pathname: string,
    remote?: RemoteAddress,
  ): Response | null => {
    // Skip rate limiting for specific paths
    if (skipPaths?.some((path) => pathname.startsWith(path))) {
      return null;
    }

    // Get client identifier
    const clientIp = keyGenerator?.(req) ??
      getClientIp(req, trustProxy, remote, trustedProxies);

    // No identity: counting these requests in one shared bucket would let a
    // single client exhaust the budget of every other unidentified client, so
    // they are not limited here. Pass `remote` (or a keyGenerator) to limit.
    if (clientIp === UNKNOWN_CLIENT) {
      return null;
    }

    // Skip rate limiting for specific IPs
    if (skipIps?.includes(clientIp)) {
      return null;
    }

    const key = `${clientIp}:${pathname}`;
    const now = Date.now();

    // Get or create rate limit entry
    let entry = store.get(key);

    if (entry === undefined || now > entry.resetTime) {
      // Create new entry or reset expired one
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      store.set(key, entry);
      return null;
    }

    // Increment count
    entry.count++;

    // Check if rate limited
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / MS_PER_SECOND);

      let body: string;
      try {
        body = JSON.stringify({
          error: "Too Many Requests",
          message,
          retryAfter,
        });
      } catch {
        // Fallback if JSON serialization fails
        body = `{"error":"Too Many Requests","retryAfter":${retryAfter}}`;
      }

      return new Response(body, {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(maxRequests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(
            Math.ceil(entry.resetTime / MS_PER_SECOND),
          ),
        },
      });
    }

    return null;
  };

  const getHeaders = (
    clientIp: string,
    pathname: string,
  ): Record<string, string> => {
    const key = `${clientIp}:${pathname}`;
    const entry = store.get(key);

    if (entry === undefined) {
      return {
        "X-RateLimit-Limit": String(maxRequests),
        "X-RateLimit-Remaining": String(maxRequests),
      };
    }

    return {
      "X-RateLimit-Limit": String(maxRequests),
      "X-RateLimit-Remaining": String(Math.max(0, maxRequests - entry.count)),
      "X-RateLimit-Reset": String(Math.ceil(entry.resetTime / MS_PER_SECOND)),
    };
  };

  const stop = (): void => {
    if (cleanupInterval !== null) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
    store.clear();
  };

  const getStoreSize = (): number => {
    return store.size;
  };

  return {
    check,
    getHeaders,
    stop,
    getStoreSize,
  };
};
