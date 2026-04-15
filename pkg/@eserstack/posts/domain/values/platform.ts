// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Platform — discriminated union identifying which social platform a post,
 * user, or API client belongs to. Lives in the domain so all layers can
 * reference it without depending on any adapter.
 */

/** Identifies which social platform a post, user, or connection belongs to. */
export type Platform = "twitter" | "bluesky";
