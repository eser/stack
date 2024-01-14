// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export enum RunMode {
  NotSet = 0,
  Development = 1,
  Test = 2,
}

export const inProductionMode = (mode: RunMode) => {
  return (mode & RunMode.Development) !== RunMode.Development;
};

export const inDevelopmentMode = (mode: RunMode) => {
  return (mode & RunMode.Development) === RunMode.Development;
};

export const inTestMode = (mode: RunMode) => {
  return (mode & RunMode.Test) === RunMode.Test;
};
