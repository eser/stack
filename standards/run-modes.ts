// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export enum RunMode {
  Development = 0,
  Production = 1,
  Test = 2,
}

export function inDevelopmentMode(mode: RunMode): boolean {
  return (mode & RunMode.Production) !== RunMode.Production;
}

export function inProductionMode(mode: RunMode): boolean {
  return (mode & RunMode.Production) === RunMode.Production;
}

export function inTestMode(mode: RunMode): boolean {
  return (mode & RunMode.Test) === RunMode.Test;
}
