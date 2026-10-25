// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

func TestComposite(t *testing.T) {
	t.Parallel()

	state := NewInitialState(Viewport{Cols: 40, Rows: 10})
	state = Reduce(&state, &Action{Type: ActionNewTab, Title: "main"}).State
	scene := DeriveScene(&state, DefaultChrome())

	term := vt.New(38, 6)
	term.WriteString("hi")

	frame := composite(&scene, map[PaneID]*paneScreen{"pane-1": screenOf(term)}, true, "")

	for _, want := range []string{
		seqClearScreen,
		"\x1b[7m 1:main \x1b[27m",
		"\x1b[2;1H╔ main ═",
		"\x1b[3;2Hhi",
		" NORMAL  ctrl+p pane",
	} {
		if !strings.Contains(frame.Data, want) {
			t.Errorf("frame lacks %q:\n%q", want, frame.Data)
		}
	}

	if !frame.CursorVisible || frame.CursorRow != 3 || frame.CursorCol != 4 {
		t.Errorf("cursor = %d,%d visible %v, want 3,4 visible", frame.CursorRow, frame.CursorCol, frame.CursorVisible)
	}
}

func TestTabBarEllipsis(t *testing.T) {
	t.Parallel()

	tabs := []SceneTab{{ID: "1", Name: "alpha"}, {ID: "2", Name: "beta"}, {ID: "3", Name: "gamma"}}

	bar := renderTabBar(tabs, 0, 20)
	if visibleLength(bar) != 20 || !strings.Contains(bar, "…") {
		t.Errorf("bar = %q (%d visible)", bar, visibleLength(bar))
	}
}
