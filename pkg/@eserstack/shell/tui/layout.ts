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

/** A named rectangle of the terminal that one widget draws into. */
export type Panel = {
  /** The panel's name, such as "left" or "statusBar". */
  readonly id: string;
  /** Left column, 1-based. */
  readonly x: number;
  /** Top row, 1-based. */
  readonly y: number;
  /** Width in columns. */
  readonly width: number;
  /** Height in rows. */
  readonly height: number;
};

/** How {@link calculateLayout} divides the terminal. */
export type LayoutConfig = {
  /** Left panel width: 0-1 as a fraction of total columns, or >1 as absolute columns. */
  readonly leftWidth: number;
  /** Right-top panel height: 0-1 as a fraction of usable rows, or >1 as absolute rows. */
  readonly rightTopHeight: number;
};

/** The four panels {@link calculateLayout} returns. */
export type LayoutResult = {
  /** The full-height panel on the left. */
  readonly left: Panel;
  /** The upper panel on the right. */
  readonly rightTop: Panel;
  /** The lower panel on the right. */
  readonly rightBottom: Panel;
  /** The one-row bar along the bottom. */
  readonly statusBar: Panel;
};

/** Calculate a three-panel-plus-status-bar layout for the given terminal size. */
export const calculateLayout = (
  cols: number,
  rows: number,
  config: LayoutConfig,
): LayoutResult => {
  const leftCols =
    config.leftWidth <= 1
      ? Math.floor(cols * config.leftWidth)
      : Math.min(Math.floor(config.leftWidth), cols);
  const rightCols = cols - leftCols;
  const usableRows = rows - 1; // reserve 1 row for status bar
  const rightTopRows =
    config.rightTopHeight <= 1
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
