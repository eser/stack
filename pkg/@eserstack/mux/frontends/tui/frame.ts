// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/** A composited terminal frame: the ANSI byte stream plus final cursor placement. */
export type Frame = {
  readonly data: string;
  readonly cursor: {
    readonly row: number;
    readonly col: number;
    readonly visible: boolean;
  };
};
