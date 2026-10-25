// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import "strings"

// Frame is a composited terminal frame: the bytes to write and where the
// host cursor goes afterwards (1-based).
type Frame struct {
	Data          string
	CursorRow     int
	CursorCol     int
	CursorVisible bool
}

func modeHint(mode InputMode) string {
	switch mode {
	case ModeNormal:
		return "ctrl+p pane · ctrl+t tab · ctrl+n resize · ctrl+s scroll · ctrl+q quit"
	case ModePane:
		return "PANE: n new · v|s split · x close · f full · hjkl focus · esc"
	case ModeTab:
		return "TAB: n new · x close · h/l switch · 1-9 goto · esc"
	case ModeResize:
		return "RESIZE: hjkl/arrows · esc"
	case ModeScroll:
		return "SCROLL: j/k · g/G · esc"
	case ModeLocked:
		return "LOCKED: ctrl+g to unlock"
	default:
		return ""
	}
}

func statusBar(scene *Scene, override string) string {
	cols := scene.Viewport.Cols

	text := override
	if text == "" {
		text = " " + strings.ToUpper(string(scene.Mode)) + "  " + modeHint(scene.Mode)
	}

	padded := truncate(text, cols) + strings.Repeat(" ", max(0, cols-visibleLength(text)))

	return moveTo(scene.Viewport.Rows, 1) + inverse(padded)
}

// composite draws the tab bar, every pane's border and content, and the
// status bar. Pane geometry is 0-based; a pane's box starts at the 1-based
// (geom.Y+1, geom.X+1) and its content is inset one cell for the border.
// A pane without a screen yet gets its border only.
func composite(scene *Scene, screens map[PaneID]*paneScreen, fullRedraw bool, statusText string) Frame {
	var out strings.Builder

	if fullRedraw {
		out.WriteString(seqClearScreen)
	}

	out.WriteString(moveTo(1, 1) + renderTabBar(scene.Tabs, scene.ActiveTab, scene.Viewport.Cols))

	frame := Frame{CursorRow: scene.Viewport.Rows, CursorCol: 1}

	for _, pane := range scene.Panes {
		// Too small for a bordered box: skip it rather than draw garbage.
		if pane.Geom.Width < 2 || pane.Geom.Height < 2 {
			continue
		}

		x := pane.Geom.X + 1
		y := pane.Geom.Y + 1

		style := borderSingle
		if pane.Focused {
			style = borderDouble
		}

		out.WriteString(drawBoxOutline(x, y, pane.Geom.Width, pane.Geom.Height, pane.Title, style))

		screen, ok := screens[pane.ID]
		if !ok {
			continue
		}

		rect := paneRect{row: y + 1, col: x + 1, width: pane.Geom.Width - 2, height: pane.Geom.Height - 2}
		screen.render(&out, rect, fullRedraw)

		cursor := screen.cursor
		if pane.Focused && cursor.Visible && cursor.X >= 0 && cursor.Y >= 0 && cursor.X < rect.width && cursor.Y < rect.height {
			frame.CursorRow = rect.row + cursor.Y
			frame.CursorCol = rect.col + cursor.X
			frame.CursorVisible = true
		}
	}

	out.WriteString(statusBar(scene, statusText))
	frame.Data = out.String()

	return frame
}
