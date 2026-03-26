// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Detect available AI providers — delegates to @eser/ai's built-in detection.
 *
 * @module
 */

import * as ai from "@eser/ai/mod";

export type { ProviderStatus } from "@eser/ai/mod";

export const detectProviders = ai.detectAllProviders;

export const getAvailableProviderNames = ai.getAvailableProviderNames;
