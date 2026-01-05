// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Middleware exports for Laroux.js
 * Rate limiter is now provided by @eser/http/middlewares/rate-limiter
 */

export {
  createRateLimiter,
  getClientIp,
  type RateLimitConfig,
  type RateLimiterInstance,
} from "@eser/http/middlewares/rate-limiter";
