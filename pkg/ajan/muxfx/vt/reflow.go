// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt

// Reflow re-wraps soft-wrapped lines when the width changes, following the
// algorithm of xterm.js (src/common/buffer/BufferReflow.ts and Buffer.ts,
// MIT licence, Copyright (c) 2017-2019 The xterm.js authors), including its
// choices about the cursor: the wrapped line holding the cursor is left
// alone, and the cursor moves with the rows added or removed.

// unpackAll unpacks the history lines of a wrapped group: the reflow reads
// and writes their cells.
func unpackAll(lines []*line) {
	for _, l := range lines {
		l.unpack()
	}
}

func (b *buffer) reflowTo(newCols, newRows int) {
	switch {
	case newCols == b.cols:
		return
	case newCols > b.cols:
		b.reflowLarger(newCols, newRows)
	default:
		b.reflowSmaller(newCols, newRows)
	}
}

// wrappedLineTrimmedLength is the number of cells line i of a wrapped group
// contributes: the last row's content length, or the full width for the
// others unless a wide character was pushed to the next row.
func wrappedLineTrimmedLength(lines []*line, i, cols int) int {
	if i == len(lines)-1 {
		return lines[i].trimmedLength()
	}

	endsInNull := !lines[i].cells[cols-1].hasContent() && lines[i].width(cols-1) == 1
	followingStartsWithWide := lines[i+1].width(0) == 2

	if endsInNull && followingStartsWithWide {
		return cols - 1
	}

	return cols
}

func (b *buffer) reflowLarger(newCols, newRows int) {
	toRemove := b.reflowLargerLinesToRemove(newCols)
	if len(toRemove) == 0 {
		return
	}

	removed := 0
	kept := make([]*line, 0, len(b.lines))

	next := 0
	for i := 0; i < len(b.lines); i++ {
		if next < len(toRemove) && i == toRemove[next] {
			count := toRemove[next+1]
			removed += count
			i += count - 1
			next += 2

			continue
		}

		kept = append(kept, b.lines[i])
	}

	b.lines = kept

	for range removed {
		if b.ybase == 0 {
			if b.y > 0 {
				b.y--
			}

			if len(b.lines) < newRows {
				b.lines = append(b.lines, newLine(newCols, emptyCell(Attrs{}), false))
			}
		} else {
			b.ybase--
		}
	}

	b.savedY = max(b.savedY-removed, 0)
}

// reflowLargerLinesToRemove pulls the cells of each wrapped group up into
// fewer rows and returns (index, count) pairs of the rows left empty.
func (b *buffer) reflowLargerLinesToRemove(newCols int) []int {
	oldCols := b.cols
	cursorY := b.ybase + b.y
	nullCell := emptyCell(Attrs{})

	var toRemove []int

	for y := 0; y < len(b.lines)-1; y++ {
		i := y + 1
		if !b.lines[i].wrapped {
			continue
		}

		wrapped := []*line{b.lines[y]}
		for i < len(b.lines) && b.lines[i].wrapped {
			wrapped = append(wrapped, b.lines[i])
			i++
		}

		unpackAll(wrapped)

		if cursorY >= y && cursorY < i {
			y += len(wrapped) - 1

			continue
		}

		destLine := 0
		destCol := wrappedLineTrimmedLength(wrapped, destLine, oldCols)
		srcLine := 1
		srcCol := 0

		for srcLine < len(wrapped) {
			srcTrimmed := wrappedLineTrimmedLength(wrapped, srcLine, oldCols)
			cells := min(srcTrimmed-srcCol, newCols-destCol)

			wrapped[destLine].copyCellsFrom(wrapped[srcLine], srcCol, destCol, cells)

			destCol += cells
			if destCol == newCols {
				destLine++
				destCol = 0
			}

			srcCol += cells
			if srcCol == srcTrimmed {
				srcLine++
				srcCol = 0
			}

			if destCol == 0 && destLine != 0 && wrapped[destLine-1].width(newCols-1) == 2 {
				wrapped[destLine].copyCellsFrom(wrapped[destLine-1], newCols-1, destCol, 1)
				destCol++
				wrapped[destLine-1].cells[newCols-1] = nullCell
			}
		}

		wrapped[destLine].replaceCells(destCol, newCols, nullCell)

		count := 0
		for k := len(wrapped) - 1; k > 0; k-- {
			if k > destLine || wrapped[k].trimmedLength() == 0 {
				count++
			} else {
				break
			}
		}

		if count > 0 {
			toRemove = append(toRemove, y+len(wrapped)-count, count)
		}

		y += len(wrapped) - 1
	}

	return toRemove
}

// reflowSmallerLineLengths splits a wrapped group's cells into rows of
// newCols, keeping a wide character from straddling two rows.
func reflowSmallerLineLengths(wrapped []*line, oldCols, newCols int) []int {
	needed := 0
	for i := range wrapped {
		needed += wrappedLineTrimmedLength(wrapped, i, oldCols)
	}

	var lengths []int

	srcCol := 0
	srcLine := 0
	available := 0

	for available < needed {
		if needed-available < newCols {
			lengths = append(lengths, needed-available)

			break
		}

		srcCol += newCols

		oldTrimmed := wrappedLineTrimmedLength(wrapped, srcLine, oldCols)
		if srcCol > oldTrimmed {
			srcCol -= oldTrimmed
			srcLine++
		}

		endsWithWide := srcCol > 0 && srcLine < len(wrapped) && wrapped[srcLine].width(srcCol-1) == 2
		if endsWithWide {
			srcCol--
		}

		length := newCols
		if endsWithWide {
			length = newCols - 1
		}

		lengths = append(lengths, length)
		available += length
	}

	return lengths
}

type reflowInsert struct {
	start int
	lines []*line
}

func (b *buffer) reflowSmaller(newCols, newRows int) {
	nullCell := emptyCell(Attrs{})

	var toInsert []reflowInsert

	countToInsert := 0

	for y := len(b.lines) - 1; y >= 0; y-- {
		if y >= len(b.lines) {
			// Moving the cursor down for the rows added below dropped rows
			// from the end, this one included. xterm.js reads the stale row
			// its ring buffer still holds there; it is gone here.
			continue
		}

		next := b.lines[y]
		if !next.wrapped && next.trimmedLength() <= newCols {
			continue
		}

		wrapped := []*line{next}
		for next.wrapped && y > 0 {
			y--
			next = b.lines[y]
			wrapped = append([]*line{next}, wrapped...)
		}

		cursorY := b.ybase + b.y
		if cursorY >= y && cursorY < y+len(wrapped) {
			continue
		}

		unpackAll(wrapped)

		lastLineLength := wrapped[len(wrapped)-1].trimmedLength()
		destLengths := reflowSmallerLineLengths(wrapped, b.cols, newCols)
		linesToAdd := len(destLengths) - len(wrapped)
		if linesToAdd < 0 {
			continue
		}

		trimmed := 0
		if b.ybase == 0 && b.y != len(b.lines)-1 {
			trimmed = max(0, b.y-b.maxLength+linesToAdd)
		} else {
			trimmed = max(0, len(b.lines)-b.maxLength+linesToAdd)
		}

		added := make([]*line, 0, max(linesToAdd, 0))
		for range linesToAdd {
			added = append(added, newLine(newCols, nullCell, true))
		}

		if len(added) > 0 {
			toInsert = append(toInsert, reflowInsert{start: y + len(wrapped) + countToInsert, lines: added})
			countToInsert += len(added)
		}

		wrapped = append(wrapped, added...)

		b.reflowSmallerCopy(wrapped, destLengths, linesToAdd, lastLineLength)

		for i := range wrapped {
			if i < len(destLengths) && destLengths[i] < newCols {
				wrapped[i].cells[destLengths[i]] = nullCell
			}
		}

		for adjust := linesToAdd - trimmed; adjust > 0; adjust-- {
			if b.ybase == 0 {
				if b.y < newRows-1 {
					b.y++
					b.lines = b.lines[:len(b.lines)-1]
				} else {
					b.ybase++
				}
			} else if b.ybase < min(b.maxLength, len(b.lines)+countToInsert)-newRows {
				b.ybase++
			}
		}

		b.savedY = min(b.savedY+linesToAdd, b.ybase+newRows-1)
	}

	if len(toInsert) > 0 {
		b.applyReflowInserts(toInsert, countToInsert)
	}
}

// reflowSmallerCopy moves a group's cells, back to front, into the new row
// lengths.
func (b *buffer) reflowSmallerCopy(wrapped []*line, destLengths []int, linesToAdd, lastLineLength int) {
	destLine := len(destLengths) - 1
	destCol := destLengths[destLine]

	if destCol == 0 {
		destLine--
		destCol = destLengths[destLine]
	}

	srcLine := len(wrapped) - linesToAdd - 1
	srcCol := lastLineLength

	for srcLine >= 0 {
		if destLine < 0 || destLine >= len(wrapped) {
			break
		}

		if srcLine >= len(wrapped) {
			break
		}

		cells := min(srcCol, destCol)
		wrapped[destLine].copyCellsFrom(wrapped[srcLine], srcCol-cells, destCol-cells, cells)

		destCol -= cells
		if destCol == 0 {
			destLine--
			if destLine >= 0 {
				destCol = destLengths[destLine]
			}
		}

		srcCol -= cells
		if srcCol == 0 {
			srcLine--
			srcCol = wrappedLineTrimmedLength(wrapped, max(srcLine, 0), b.cols)
		}
	}
}

// applyReflowInserts places the rows a smaller reflow created, dropping rows
// off the top when the buffer is full.
func (b *buffer) applyReflowInserts(toInsert []reflowInsert, countToInsert int) {
	original := b.lines
	originalLength := len(original)
	originalIndex := originalLength - 1

	newLength := min(b.maxLength, originalLength+countToInsert)
	result := make([]*line, newLength)

	next := 0
	inserted := 0

	for i := min(b.maxLength-1, originalLength+countToInsert-1); i >= 0; i-- {
		if next < len(toInsert) && toInsert[next].start > originalIndex+inserted {
			added := toInsert[next].lines
			for k := len(added) - 1; k >= 0; k-- {
				if i >= 0 {
					result[i] = added[k]
				}

				i--
			}

			i++

			inserted += len(added)
			next++

			continue
		}

		if originalIndex >= 0 {
			result[i] = original[originalIndex]
		}

		originalIndex--
	}

	for i, l := range result {
		if l == nil {
			result[i] = b.blankLine(Attrs{}, false)
		}
	}

	b.lines = result
}
