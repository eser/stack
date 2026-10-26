// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"strconv"
	"strings"
	"unicode/utf8"
)

// The drawing helpers the TUI frontend needs, ported from
// @eserstack/shell/tui (ansi, box, tab-bar and terminal).

const (
	seqEnterAltScreen = "\x1b[?1049h"
	seqExitAltScreen  = "\x1b[?1049l"
	seqHideCursor     = "\x1b[?25l"
	seqShowCursor     = "\x1b[?25h"
	seqClearScreen    = "\x1b[2J\x1b[H"
	seqReset          = "\x1b[0m"
	seqEnableMouse    = "\x1b[?1000h\x1b[?1002h\x1b[?1006h"
	seqDisableMouse   = "\x1b[?1006l\x1b[?1002l\x1b[?1000l"
)

func moveTo(row, col int) string {
	return "\x1b[" + strconv.Itoa(row) + ";" + strconv.Itoa(col) + "H"
}

func inverse(text string) string {
	return "\x1b[7m" + text + "\x1b[27m"
}

func dim(text string) string {
	return "\x1b[2m" + text + "\x1b[22m"
}

// stripSGR removes CSI sequences (ESC [ digits/semicolons, then a letter).
func stripSGR(s string) string {
	var out strings.Builder

	for i := 0; i < len(s); i++ {
		if s[i] == 0x1b && i+1 < len(s) && s[i+1] == '[' {
			j := i + 2
			for j < len(s) && (s[j] == ';' || (s[j] >= '0' && s[j] <= '9')) {
				j++
			}

			if j < len(s) && ((s[j] >= 'a' && s[j] <= 'z') || (s[j] >= 'A' && s[j] <= 'Z')) {
				i = j

				continue
			}
		}

		out.WriteByte(s[i])
	}

	return out.String()
}

// visibleLength counts the characters of s outside escape sequences.
func visibleLength(s string) int {
	return utf8.RuneCountInString(stripSGR(s))
}

// truncate cuts s to maxWidth visible characters, ending it with an ellipsis
// and a reset when it was longer.
func truncate(s string, maxWidth int) string {
	if visibleLength(s) <= maxWidth {
		return s
	}

	visible := 0
	i := 0

	for i < len(s) && visible < maxWidth-1 {
		if s[i] == 0x1b {
			if end := strings.IndexByte(s[i:], 'm'); end >= 0 {
				i += end + 1

				continue
			}
		}

		_, size := utf8.DecodeRuneInString(s[i:])
		i += size
		visible++
	}

	return s[:i] + "…" + seqReset
}

type borderStyle uint8

const (
	borderSingle borderStyle = iota
	borderDouble
)

type borderChars struct {
	tl, tr, bl, br, h, v string
}

func bordersFor(style borderStyle) borderChars {
	if style == borderDouble {
		return borderChars{"╔", "╗", "╚", "╝", "═", "║"}
	}

	return borderChars{"┌", "┐", "└", "┘", "─", "│"}
}

// drawBoxOutline draws a box border at 1-based x, y with a title in the top
// edge, leaving the interior untouched.
func drawBoxOutline(x, y, width, height int, title string, style borderStyle) string {
	b := bordersFor(style)
	inner := max(0, width-2)

	var out strings.Builder

	top := b.tl
	if title != "" {
		label := " " + title + " "
		top += label + strings.Repeat(b.h, max(0, inner-utf8.RuneCountInString(label)))
	} else {
		top += strings.Repeat(b.h, inner)
	}

	out.WriteString(moveTo(y, x) + top + b.tr)

	for r := 1; r < height-1; r++ {
		out.WriteString(moveTo(y+r, x) + b.v + moveTo(y+r, x+width-1) + b.v)
	}

	out.WriteString(moveTo(y+height-1, x) + b.bl + strings.Repeat(b.h, inner) + b.br)

	return out.String()
}

// renderTabBar draws the tab labels in maxWidth columns, the active one in
// inverse, ending with an ellipsis when they do not all fit.
func renderTabBar(tabs []SceneTab, active, maxWidth int) string {
	if len(tabs) == 0 {
		return strings.Repeat(" ", max(0, maxWidth))
	}

	separator := dim("│")

	var out strings.Builder

	used := 0

	for i, tab := range tabs {
		label := " " + strconv.Itoa(i+1) + ":" + tab.Name + " "

		rendered := dim(label)
		if i == active {
			rendered = inverse(label)
		}

		width := visibleLength(rendered)

		sepCost := 0
		if i > 0 {
			sepCost = 1
		}

		reserve := 0
		if i < len(tabs)-1 {
			reserve = 1
		}

		if used+sepCost+width+reserve > maxWidth {
			if maxWidth-used > 0 {
				out.WriteString("…")
				used++
			}

			break
		}

		if i > 0 {
			out.WriteString(separator)
			used++
		}

		out.WriteString(rendered)
		used += width
	}

	out.WriteString(strings.Repeat(" ", max(0, maxWidth-used)))

	return out.String()
}
