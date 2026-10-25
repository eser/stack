// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt_test

import (
	"fmt"
	"runtime"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// historyProfiles are kinds of output a pane's history fills with. Each
// returns line i for a screen of cols columns.
func historyProfiles() []struct {
	name string
	line func(i, cols int) string
} {
	return []struct {
		name string
		line func(i, cols int) string
	}{
		// Text across the whole width in the default colours.
		{"plain-full-width", func(i, cols int) string {
			return strings.Repeat(string(rune('a'+i%26)), cols)
		}},
		// Shell output: short lines with a coloured name, as ls or a prompt.
		{"shell-short", func(i, cols int) string {
			return fmt.Sprintf("-rw-r--r--  1 user  staff  %6d \x1b[1;34mfile-%04d.txt\x1b[m", i*37, i)
		}},
		// Source code in a pager or diff: two thirds of the width, eight colour
		// changes.
		{"code-colored", func(i, cols int) string {
			var b strings.Builder

			colors := []string{"31", "32", "33", "34", "35", "36", "1;37", "38;5;208"}
			for k := range 8 {
				fmt.Fprintf(&b, "\x1b[%sm%s", colors[(i+k)%len(colors)], strings.Repeat("x", cols*2/3/8))
			}

			b.WriteString("\x1b[m")

			return b.String()
		}},
		// The worst ordinary case: a different colour in every cell.
		{"every-cell-colored", func(i, cols int) string {
			var b strings.Builder
			for k := range cols {
				fmt.Fprintf(&b, "\x1b[38;5;%dm%c", (i+k)%256, 'a'+k%26)
			}

			b.WriteString("\x1b[m")

			return b.String()
		}},
	}
}

func heapInUse() uint64 {
	runtime.GC()
	runtime.GC()

	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	return m.HeapAlloc
}

// fullPane returns a 40-row pane whose history holds DefaultScrollback lines
// of a profile.
func fullPane(cols int, line func(i, cols int) string) *vt.Terminal {
	term := vt.New(cols, 40)

	for i := range vt.DefaultScrollback + 40 {
		term.WriteString(line(i, cols) + "\r\n")
	}

	return term
}

// BenchmarkHistoryMemory measures the heap a pane holds with a full history
// (DefaultScrollback lines, or fewer where the byte limit stops first) at 120
// and 240 columns, for each kind of output, and the time to fill it.
// "B/pane" is the measured heap, "history-B" what the byte limit counts,
// "lines" the history lines kept and "cells-B" what those lines would take
// as one Cell per column. Run it with
// go test -run '^$' -bench BenchmarkHistoryMemory -benchtime 3x ./pkg/ajan/muxfx/vt/
func BenchmarkHistoryMemory(b *testing.B) {
	for _, cols := range []int{120, 240} {
		for _, profile := range historyProfiles() {
			b.Run(fmt.Sprintf("%dcols/%s", cols, profile.name), func(b *testing.B) {
				for b.Loop() {
					runtime.KeepAlive(fullPane(cols, profile.line))
				}

				before := heapInUse()
				term := fullPane(cols, profile.line)
				after := heapInUse()

				const cellSize = 56 // vt.Cell: a string, an int and 28 bytes of Attrs

				b.ReportMetric(float64(after-before), "B/pane")
				b.ReportMetric(float64(term.HistoryBytes()), "history-B")
				b.ReportMetric(float64(term.HistoryLen()), "lines")
				b.ReportMetric(float64(term.HistoryLen()*cols*cellSize), "cells-B")
				runtime.KeepAlive(term)
			})
		}
	}
}
