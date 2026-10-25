// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"unicode/utf8"
)

// The wire form of screen messages. Rows are most of a screen message, so
// runs and lines travel as JSON arrays instead of objects, and a run leaves
// out its trailing elements while they hold their defaults:
//
//	run:          [text, style, cells, width, cluster, link]
//	blank run:    cells
//	screen line:  [row, [run, ...], wrapped]
//	history line: [[run, ...], wrapped]
//
// The defaults are style 0, cells the text's cell count (see
// [ScreenRun.DefaultCells]), width 1, cluster 0 and link 0; cluster and
// wrapped are 1 when set, and wrapped is left out when 0. A blank run
// always carries its cells, since its text counts none, and one in the
// default style, of width 1 and without a link is that number alone, the
// most common run between words and columns. The encoders append to a
// buffer instead of going through encoding/json's reflection, which a
// screen message of a few thousand runs would spend most of its encoding
// time in.

// Errors reading a screen message from the wire; the wrapping error names
// the element that does not fit.
var (
	ErrScreenRunMalformed  = errors.New("screen run is not a cell count or [text, style, cells, width, cluster, link]")
	ErrScreenLineMalformed = errors.New("screen line is not [row, runs, wrapped] or, in the history, [runs, wrapped]")
)

const (
	// screenRunFields is the most elements a run array holds.
	screenRunFields = 6
	// maxWireCells bounds a run's style index and cells as read, far above
	// any pane, so the numbers stay ints on every platform.
	maxWireCells = 1 << 30
)

// DefaultCells is the cells a run covers when its wire form leaves them
// out: the text's code points times the width, or the width for a
// cluster, which is one cell. A blank run's text counts none.
func (r *ScreenRun) DefaultCells() int {
	if r.Text == "" {
		return 0
	}

	if r.Cluster {
		return r.Width
	}

	return utf8.RuneCountInString(r.Text) * r.Width
}

// plainBlank reports whether the run is blank cells in the default style,
// of width 1 and without a link, which the wire form sends as a number.
func (r *ScreenRun) plainBlank() bool {
	return r.Text == "" && r.Style == 0 && r.Width == 1 && !r.Cluster && r.Link == 0
}

// appendJSON appends the run's wire form.
func (r *ScreenRun) appendJSON(b []byte) []byte {
	if r.plainBlank() {
		return strconv.AppendInt(b, int64(r.Cells), 10)
	}

	cluster := 0
	if r.Cluster {
		cluster = 1
	}

	// The elements after the text, and how many of them differ from their
	// defaults counting from the end.
	fields := [screenRunFields - 1]int{r.Style, r.Cells, r.Width, cluster, int(r.Link)}
	defaults := [screenRunFields - 1]int{0, r.DefaultCells(), 1, 0, 0}

	n := len(fields)
	for n > 0 && fields[n-1] == defaults[n-1] {
		n--
	}

	b = append(b, '[')
	b = appendJSONString(b, r.Text)

	for _, v := range fields[:n] {
		b = append(b, ',')
		b = strconv.AppendInt(b, int64(v), 10)
	}

	return append(b, ']')
}

// MarshalJSON writes the run's wire form.
func (r ScreenRun) MarshalJSON() ([]byte, error) {
	return r.appendJSON(nil), nil
}

// UnmarshalJSON reads a run's wire form: an array or, for plain blank
// cells, their number. The message may come from a remote server, so every
// element is checked: the text is a string, style, cells and link are not
// negative, the width is 0, 1 or 2 and cluster 0 or 1. The caller still
// bounds the cells by the pane.
func (r *ScreenRun) UnmarshalJSON(data []byte) error {
	if trimmed := bytes.TrimLeft(data, " \t\r\n"); len(trimmed) > 0 && trimmed[0] != '[' {
		var cells int64
		if err := json.Unmarshal(trimmed, &cells); err != nil {
			return fmt.Errorf("%w: %w", ErrScreenRunMalformed, err)
		}

		if bytes.HasPrefix(trimmed, []byte("null")) {
			return fmt.Errorf("%w: null", ErrScreenRunMalformed)
		}

		if cells < 0 || cells > maxWireCells {
			return fmt.Errorf("%w: cells %d out of range", ErrScreenRunMalformed, cells)
		}

		*r = ScreenRun{Width: 1, Cells: int(cells)}

		return nil
	}

	var raw []json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("%w: %w", ErrScreenRunMalformed, err)
	}

	if len(raw) == 0 || len(raw) > screenRunFields {
		return fmt.Errorf("%w: %d elements, want 1 to %d", ErrScreenRunMalformed, len(raw), screenRunFields)
	}

	run := ScreenRun{Width: 1}
	if err := json.Unmarshal(raw[0], &run.Text); err != nil {
		return fmt.Errorf("%w: text: %w", ErrScreenRunMalformed, err)
	}

	fields := [screenRunFields - 1]int64{0, -1, 1, 0, 0}
	limits := [screenRunFields - 1]int64{maxWireCells, maxWireCells, 2, 1, 1<<32 - 1}
	names := [screenRunFields - 1]string{"style", "cells", "width", "cluster", "link"}

	for i, elem := range raw[1:] {
		var v int64
		if err := json.Unmarshal(elem, &v); err != nil {
			return fmt.Errorf("%w: %s: %w", ErrScreenRunMalformed, names[i], err)
		}

		if v < 0 || v > limits[i] {
			return fmt.Errorf("%w: %s %d out of range", ErrScreenRunMalformed, names[i], v)
		}

		fields[i] = v
	}

	run.Style, run.Width, run.Cluster, run.Link = int(fields[0]), int(fields[2]), fields[3] == 1, uint32(fields[4])

	run.Cells = int(fields[1])
	if run.Cells < 0 {
		run.Cells = run.DefaultCells()
	}

	*r = run

	return nil
}

func appendRuns(b []byte, runs []ScreenRun) []byte {
	b = append(b, '[')

	for i := range runs {
		if i > 0 {
			b = append(b, ',')
		}

		b = runs[i].appendJSON(b)
	}

	return append(b, ']')
}

// appendJSON appends the line's wire array.
func (l *ScreenLine) appendJSON(b []byte) []byte {
	b = append(b, '[')
	b = strconv.AppendInt(b, int64(l.Row), 10)
	b = append(b, ',')
	b = appendRuns(b, l.Runs)

	if l.Wrapped {
		b = append(b, ",1"...)
	}

	return append(b, ']')
}

// MarshalJSON writes the line's wire array.
func (l ScreenLine) MarshalJSON() ([]byte, error) {
	return l.appendJSON(nil), nil
}

// UnmarshalJSON reads a screen line's wire array: the row, the runs and,
// when it is 1, wrapped. The caller checks the row against the pane.
func (l *ScreenLine) UnmarshalJSON(data []byte) error {
	var raw []json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("%w: %w", ErrScreenLineMalformed, err)
	}

	if len(raw) < 2 || len(raw) > 3 {
		return fmt.Errorf("%w: %d elements, want 2 or 3", ErrScreenLineMalformed, len(raw))
	}

	var line ScreenLine
	if err := json.Unmarshal(raw[0], &line.Row); err != nil {
		return fmt.Errorf("%w: row: %w", ErrScreenLineMalformed, err)
	}

	runs, wrapped, err := readLineRest(raw[1:])
	if err != nil {
		return err
	}

	line.Runs, line.Wrapped = runs, wrapped
	*l = line

	return nil
}

// appendJSON appends the history line's wire array.
func (l *ScreenHistoryLine) appendJSON(b []byte) []byte {
	b = append(b, '[')
	b = appendRuns(b, l.Runs)

	if l.Wrapped {
		b = append(b, ",1"...)
	}

	return append(b, ']')
}

// MarshalJSON writes the history line's wire array.
func (l ScreenHistoryLine) MarshalJSON() ([]byte, error) {
	return l.appendJSON(nil), nil
}

// UnmarshalJSON reads a history line's wire array: the runs and, when it is
// 1, wrapped.
func (l *ScreenHistoryLine) UnmarshalJSON(data []byte) error {
	var raw []json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("%w: %w", ErrScreenLineMalformed, err)
	}

	if len(raw) < 1 || len(raw) > 2 {
		return fmt.Errorf("%w: %d elements, want 1 or 2", ErrScreenLineMalformed, len(raw))
	}

	runs, wrapped, err := readLineRest(raw)
	if err != nil {
		return err
	}

	*l = ScreenHistoryLine{Runs: runs, Wrapped: wrapped}

	return nil
}

// readLineRest reads the runs and the optional wrapped flag of a line.
func readLineRest(raw []json.RawMessage) ([]ScreenRun, bool, error) {
	var runs []ScreenRun
	if err := json.Unmarshal(raw[0], &runs); err != nil {
		return nil, false, fmt.Errorf("%w: runs: %w", ErrScreenLineMalformed, err)
	}

	if len(raw) == 1 {
		return runs, false, nil
	}

	var wrapped int
	if err := json.Unmarshal(raw[1], &wrapped); err != nil || (wrapped != 0 && wrapped != 1) {
		return nil, false, fmt.Errorf("%w: wrapped %s, want 0 or 1", ErrScreenLineMalformed, raw[1])
	}

	return runs, wrapped == 1, nil
}
