// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Built-in concern definitions — embedded as imports so they survive bundling.
 *
 * @module
 */

import type * as schema from "../../state/schema.ts";

import openSource from "./001-open-source.json" with { type: "json" };
import beautifulProduct from "./002-beautiful-product.json" with {
  type: "json",
};
import longLived from "./003-long-lived.json" with { type: "json" };
import moveFast from "./004-move-fast.json" with { type: "json" };
import compliance from "./005-compliance.json" with { type: "json" };
import learningProject from "./006-learning-project.json" with { type: "json" };
import wellEngineered from "./007-well-engineered.json" with { type: "json" };

/** All built-in concerns, ordered by numeric prefix. */
export const DEFAULT_CONCERNS: readonly schema.ConcernDefinition[] = [
  openSource as unknown as schema.ConcernDefinition,
  beautifulProduct as unknown as schema.ConcernDefinition,
  longLived as unknown as schema.ConcernDefinition,
  moveFast as unknown as schema.ConcernDefinition,
  compliance as unknown as schema.ConcernDefinition,
  learningProject as unknown as schema.ConcernDefinition,
  wellEngineered as unknown as schema.ConcernDefinition,
];
