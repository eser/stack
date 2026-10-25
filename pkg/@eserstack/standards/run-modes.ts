// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Run mode flags (development, test) and checks for them.
 *
 * @module
 */

/**
 * Run mode bit flags. Combine them with `|`; a mode without the Development
 * bit counts as production.
 */
export const RunModes = {
  NotSet: 0,
  Development: 1,
  Test: 2,
} as const;

/** Name of a run mode flag, such as "Development". */
export type RunModeKey = Exclude<keyof typeof RunModes, number>;

/** Value of a run mode flag. */
export type RunMode = (typeof RunModes)[RunModeKey];

/** Reports whether `mode` lacks the Development bit. */
export const inProductionMode = (mode: RunMode): boolean => {
  return (mode & RunModes.Development) !== RunModes.Development;
};

/** Reports whether `mode` has the Development bit. */
export const inDevelopmentMode = (mode: RunMode): boolean => {
  return (mode & RunModes.Development) === RunModes.Development;
};

/** Reports whether `mode` has the Test bit. */
export const inTestMode = (mode: RunMode): boolean => {
  return (mode & RunModes.Test) === RunModes.Test;
};
