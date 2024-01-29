// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export const RunModes = {
  NotSet: 0,
  Development: 1,
  Test: 2,
} as const;

export type RunModeKey = Exclude<keyof typeof RunModes, number>;
export type RunMode = typeof RunModes[RunModeKey];

export const inProductionMode = (mode: RunMode) => {
  return (mode & RunModes.Development) !== RunModes.Development;
};

export const inDevelopmentMode = (mode: RunMode) => {
  return (mode & RunModes.Development) === RunModes.Development;
};

export const inTestMode = (mode: RunMode) => {
  return (mode & RunModes.Test) === RunModes.Test;
};
