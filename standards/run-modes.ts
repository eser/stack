// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export enum RunMode {
  Development = 0,
  Production = 1,
  Test = 2,
}

export const inDevelopmentMode = (mode: RunMode) => {
  return (mode & RunMode.Production) !== RunMode.Production;
};

export const inProductionMode = (mode: RunMode) => {
  return (mode & RunMode.Production) === RunMode.Production;
};

export const inTestMode = (mode: RunMode) => {
  return (mode & RunMode.Test) === RunMode.Test;
};
