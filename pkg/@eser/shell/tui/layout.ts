// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Layout engine — splits a terminal viewport into named panels.
 *
 * `calculateLayout` accepts absolute terminal dimensions and a
 * configuration object, then returns four non-overlapping panels:
 * left, rightTop, rightBottom, and statusBar.
 *
 * @module
 */

export type Panel = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type LayoutConfig = {
  /** Left panel width: 0-1 as a fraction of total columns, or >1 as absolute columns. */
  readonly leftWidth: number;
  /** Right-top panel height: 0-1 as a fraction of usable rows, or >1 as absolute rows. */
  readonly rightTopHeight: number;
};

export type LayoutResult = {
  readonly left: Panel;
  readonly rightTop: Panel;
  readonly rightBottom: Panel;
  readonly statusBar: Panel;
};

/** Calculate a three-panel-plus-status-bar layout for the given terminal size. */
export const calculateLayout = (
  cols: number,
  rows: number,
  config: LayoutConfig,
): LayoutResult => {
  const leftCols = config.leftWidth <= 1
    ? Math.floor(cols * config.leftWidth)
    : Math.min(Math.floor(config.leftWidth), cols);
  const rightCols = cols - leftCols;
  const usableRows = rows - 1; // reserve 1 row for status bar
  const rightTopRows = config.rightTopHeight <= 1
    ? Math.floor(usableRows * config.rightTopHeight)
    : Math.min(Math.floor(config.rightTopHeight), usableRows);
  const rightBottomRows = usableRows - rightTopRows;

  return {
    left: {
      id: "left",
      x: 1,
      y: 1,
      width: leftCols,
      height: usableRows,
    },
    rightTop: {
      id: "rightTop",
      x: leftCols + 1,
      y: 1,
      width: rightCols,
      height: rightTopRows,
    },
    rightBottom: {
      id: "rightBottom",
      x: leftCols + 1,
      y: rightTopRows + 1,
      width: rightCols,
      height: rightBottomRows,
    },
    statusBar: {
      id: "statusBar",
      x: 1,
      y: rows,
      width: cols,
      height: 1,
    },
  };
};
