// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Defaults that every wiring of the application layer shares, so a context
 * with auth providers, one without them, a bare PostService and the agent
 * tool descriptions all apply the same values.
 *
 * @module
 */

/**
 * How many posts a cross-platform read (a search on every platform, the
 * unified timeline) asks each platform for when the caller sets no limit.
 */
export const DEFAULT_MAX_RESULTS_PER_PLATFORM = 10;
