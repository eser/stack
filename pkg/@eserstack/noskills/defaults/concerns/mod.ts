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
import developerExperience from "./008-developer-experience.json" with {
  type: "json",
};
import rootCause from "./009-root-cause.json" with { type: "json" };
import qaTested from "./010-qa-tested.json" with { type: "json" };
import securityAudited from "./011-security-audited.json" with { type: "json" };
import peerReviewed from "./012-peer-reviewed.json" with { type: "json" };
import shipReady from "./013-ship-ready.json" with { type: "json" };
import documented from "./014-documented.json" with { type: "json" };
import deployReady from "./015-deploy-ready.json" with { type: "json" };
import productionReady from "./016-production-ready.json" with { type: "json" };
import retroFed from "./017-retro-fed.json" with { type: "json" };

/** All built-in concerns, ordered by numeric prefix. */
export const DEFAULT_CONCERNS: readonly schema.ConcernDefinition[] = [
  openSource as unknown as schema.ConcernDefinition,
  beautifulProduct as unknown as schema.ConcernDefinition,
  longLived as unknown as schema.ConcernDefinition,
  moveFast as unknown as schema.ConcernDefinition,
  compliance as unknown as schema.ConcernDefinition,
  learningProject as unknown as schema.ConcernDefinition,
  wellEngineered as unknown as schema.ConcernDefinition,
  developerExperience as unknown as schema.ConcernDefinition,
  rootCause as unknown as schema.ConcernDefinition,
  qaTested as unknown as schema.ConcernDefinition,
  securityAudited as unknown as schema.ConcernDefinition,
  peerReviewed as unknown as schema.ConcernDefinition,
  shipReady as unknown as schema.ConcernDefinition,
  documented as unknown as schema.ConcernDefinition,
  deployReady as unknown as schema.ConcernDefinition,
  productionReady as unknown as schema.ConcernDefinition,
  retroFed as unknown as schema.ConcernDefinition,
];
