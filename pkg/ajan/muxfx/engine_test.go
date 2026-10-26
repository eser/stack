// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx_test

import (
	"slices"
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx"
)

func reduce(t *testing.T, s *muxfx.State, action *muxfx.Action) muxfx.Result {
	t.Helper()

	return muxfx.Reduce(s, action)
}

func ptr[T any](v T) *T {
	return &v
}

func baseState(t *testing.T) muxfx.State {
	t.Helper()

	return reduce(t, ptr(muxfx.NewInitialState(muxfx.Viewport{Cols: 80, Rows: 24})), &muxfx.Action{Type: muxfx.ActionNewTab}).State
}

func hasEffect(effects []muxfx.Effect, typ muxfx.EffectType) bool {
	return slices.ContainsFunc(effects, func(e muxfx.Effect) bool { return e.Type == typ })
}

func split(t *testing.T, s *muxfx.State) muxfx.State {
	t.Helper()

	return reduce(t, s, &muxfx.Action{Type: muxfx.ActionSplitPane, Direction: string(muxfx.SplitVertical)}).State
}

func TestReducerTabsAndPanes(t *testing.T) {
	t.Parallel()

	t.Run("newTab opens a tab with one pane and asks to spawn it", func(t *testing.T) {
		t.Parallel()

		r := reduce(t, ptr(muxfx.NewInitialState(muxfx.Viewport{Cols: 80, Rows: 24})), &muxfx.Action{Type: muxfx.ActionNewTab})
		if len(r.State.Tabs) != 1 {
			t.Fatalf("tabs = %d, want 1", len(r.State.Tabs))
		}

		tab := r.State.Tabs[0]
		if leaves := muxfx.CollectLeaves(tab.Root); len(leaves) != 1 || tab.FocusedPane != leaves[0] {
			t.Errorf("leaves = %v, focused %q", leaves, tab.FocusedPane)
		}

		if tab.Name != "tab 1" || tab.ID != "tab-1" || r.State.Panes["pane-1"].Title != "shell" {
			t.Errorf("tab = %+v, pane = %+v", tab, r.State.Panes["pane-1"])
		}

		if !hasEffect(r.Effects, muxfx.EffectSpawnPty) {
			t.Errorf("effects = %+v, want spawnPty", r.Effects)
		}
	})

	t.Run("splitPane adds a pane, focuses it and spawns it", func(t *testing.T) {
		t.Parallel()

		r := reduce(t, ptr(baseState(t)), &muxfx.Action{Type: muxfx.ActionSplitPane, Direction: string(muxfx.SplitVertical)})
		tab := r.State.Tabs[0]

		leaves := muxfx.CollectLeaves(tab.Root)
		if len(leaves) != 2 || tab.FocusedPane != leaves[1] {
			t.Errorf("leaves = %v, focused %q", leaves, tab.FocusedPane)
		}

		spawns := 0
		for _, e := range r.Effects {
			if e.Type == muxfx.EffectSpawnPty {
				spawns++
			}
		}

		if spawns != 1 {
			t.Errorf("spawn effects = %d, want 1", spawns)
		}
	})

	t.Run("closeFocusedPane removes the pane and kills its process", func(t *testing.T) {
		t.Parallel()

		s := split(t, ptr(baseState(t)))
		closed := s.Tabs[0].FocusedPane
		r := reduce(t, &s, &muxfx.Action{Type: muxfx.ActionCloseFocusedPane})

		if len(muxfx.CollectLeaves(r.State.Tabs[0].Root)) != 1 || len(r.State.Panes) != 1 {
			t.Errorf("state after close = %+v", r.State)
		}

		if !slices.Contains(r.Effects, muxfx.Effect{Type: muxfx.EffectKillPty, Pane: closed}) {
			t.Errorf("effects = %+v, want killPty %q", r.Effects, closed)
		}
	})

	t.Run("closeFocusedPane on the last pane closes the tab and exits", func(t *testing.T) {
		t.Parallel()

		r := reduce(t, ptr(baseState(t)), &muxfx.Action{Type: muxfx.ActionCloseFocusedPane})
		if len(r.State.Tabs) != 0 || r.State.Running || !hasEffect(r.Effects, muxfx.EffectExit) {
			t.Errorf("result = %+v", r)
		}
	})

	t.Run("the input state is not modified", func(t *testing.T) {
		t.Parallel()

		s := baseState(t)
		before := len(s.Panes)
		_ = split(t, &s)

		if len(s.Panes) != before || len(muxfx.CollectLeaves(s.Tabs[0].Root)) != 1 {
			t.Error("reduce changed its input state")
		}
	})
}

func TestReducerFocus(t *testing.T) {
	t.Parallel()

	t.Run("focusNext cycles through panes", func(t *testing.T) {
		t.Parallel()

		s := split(t, ptr(baseState(t)))
		leaves := muxfx.CollectLeaves(s.Tabs[0].Root)
		s = reduce(t, &s, &muxfx.Action{Type: muxfx.ActionFocusNext}).State

		if s.Tabs[0].FocusedPane != leaves[0] {
			t.Errorf("focused = %q, want %q", s.Tabs[0].FocusedPane, leaves[0])
		}

		s = reduce(t, &s, &muxfx.Action{Type: muxfx.ActionFocusPrev}).State
		if s.Tabs[0].FocusedPane != leaves[1] {
			t.Errorf("focused = %q, want %q", s.Tabs[0].FocusedPane, leaves[1])
		}
	})

	t.Run("focusDirection moves to the spatial neighbour", func(t *testing.T) {
		t.Parallel()

		s := split(t, ptr(baseState(t)))
		leaves := muxfx.CollectLeaves(s.Tabs[0].Root)
		s = reduce(t, &s, &muxfx.Action{Type: muxfx.ActionFocusDirection, Direction: string(muxfx.DirectionLeft)}).State

		if s.Tabs[0].FocusedPane != leaves[0] {
			t.Errorf("focused = %q, want %q", s.Tabs[0].FocusedPane, leaves[0])
		}
	})

	t.Run("toggleFullscreen sets and clears the fullscreen pane", func(t *testing.T) {
		t.Parallel()

		s := baseState(t)
		focused := s.Tabs[0].FocusedPane

		s = reduce(t, &s, &muxfx.Action{Type: muxfx.ActionToggleFullscreen}).State
		if s.Tabs[0].FullscreenPane != focused {
			t.Errorf("fullscreen = %q, want %q", s.Tabs[0].FullscreenPane, focused)
		}

		s = reduce(t, &s, &muxfx.Action{Type: muxfx.ActionToggleFullscreen}).State
		if s.Tabs[0].FullscreenPane != "" {
			t.Errorf("fullscreen = %q, want none", s.Tabs[0].FullscreenPane)
		}
	})

	t.Run("resizePane changes the ratio of the matching branch", func(t *testing.T) {
		t.Parallel()

		s := split(t, ptr(baseState(t)))
		r := reduce(t, &s, &muxfx.Action{Type: muxfx.ActionResizePane, Direction: string(muxfx.DirectionRight)})

		if got := r.State.Tabs[0].Root.Ratio; got != 0.55 {
			t.Errorf("ratio = %v, want 0.55", got)
		}

		if r := reduce(t, &s, &muxfx.Action{Type: muxfx.ActionResizePane, Direction: string(muxfx.DirectionUp)}); len(r.Effects) != 0 {
			t.Errorf("a perpendicular resize emitted %+v", r.Effects)
		}
	})
}

func TestReducerInput(t *testing.T) {
	t.Parallel()

	s := split(t, ptr(baseState(t)))
	leaves := muxfx.CollectLeaves(s.Tabs[0].Root)

	tests := []struct {
		name   string
		action muxfx.Action
		want   []muxfx.Effect
	}{
		{
			"writeInput targets the focused pane",
			muxfx.Action{Type: muxfx.ActionWriteInput, Data: "ls\r"},
			[]muxfx.Effect{{Type: muxfx.EffectWritePty, Pane: leaves[1], Data: "ls\r"}},
		},
		{
			"writeToPane targets a pane regardless of focus",
			muxfx.Action{Type: muxfx.ActionWriteToPane, Pane: leaves[0], Data: "hi\r"},
			[]muxfx.Effect{{Type: muxfx.EffectWritePty, Pane: leaves[0], Data: "hi\r"}},
		},
		{
			"writeToPane ignores an unknown pane",
			muxfx.Action{Type: muxfx.ActionWriteToPane, Pane: "pane-does-not-exist", Data: "x"},
			nil,
		},
		{
			"scroll targets the focused pane",
			muxfx.Action{Type: muxfx.ActionScroll, Scroll: muxfx.ScrollPageUp},
			[]muxfx.Effect{{Type: muxfx.EffectScrollPane, Pane: leaves[1], Scroll: muxfx.ScrollPageUp}},
		},
		{
			"detach emits detach",
			muxfx.Action{Type: muxfx.ActionDetach},
			[]muxfx.Effect{{Type: muxfx.EffectDetach}},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := reduce(t, &s, &tc.action).Effects; !slices.Equal(got, tc.want) {
				t.Errorf("effects = %+v, want %+v", got, tc.want)
			}
		})
	}
}

func TestReducerExitsAndTabs(t *testing.T) {
	t.Parallel()

	t.Run("paneExited removes a pane without killing it", func(t *testing.T) {
		t.Parallel()

		s := split(t, ptr(baseState(t)))
		leaves := muxfx.CollectLeaves(s.Tabs[0].Root)
		r := reduce(t, &s, &muxfx.Action{Type: muxfx.ActionPaneExited, Pane: leaves[0]})

		if got := muxfx.CollectLeaves(r.State.Tabs[0].Root); !slices.Equal(got, leaves[1:]) {
			t.Errorf("leaves = %v, want %v", got, leaves[1:])
		}

		if hasEffect(r.Effects, muxfx.EffectKillPty) || !hasEffect(r.Effects, muxfx.EffectRender) {
			t.Errorf("effects = %+v", r.Effects)
		}
	})

	t.Run("paneExited on a tab before the active one keeps the same tab visible", func(t *testing.T) {
		t.Parallel()

		s := baseState(t)
		s = reduce(t, &s, &muxfx.Action{Type: muxfx.ActionNewTab}).State
		s = reduce(t, &s, &muxfx.Action{Type: muxfx.ActionNewTab}).State
		s = reduce(t, &s, &muxfx.Action{Type: muxfx.ActionGotoTab, Index: muxfx.IntPtr(1)}).State
		viewed := s.Tabs[1].ID

		s = reduce(t, &s, &muxfx.Action{Type: muxfx.ActionPaneExited, Pane: muxfx.CollectLeaves(s.Tabs[0].Root)[0]}).State
		if len(s.Tabs) != 2 || s.Tabs[s.ActiveTab].ID != viewed {
			t.Errorf("active tab = %+v, want %q", s.Tabs[s.ActiveTab], viewed)
		}
	})

	t.Run("closeTab with a lower index keeps the same tab visible", func(t *testing.T) {
		t.Parallel()

		s := baseState(t)
		s = reduce(t, &s, &muxfx.Action{Type: muxfx.ActionNewTab}).State
		s = reduce(t, &s, &muxfx.Action{Type: muxfx.ActionNewTab}).State
		viewed := s.Tabs[2].ID

		r := reduce(t, &s, &muxfx.Action{Type: muxfx.ActionCloseTab, Index: muxfx.IntPtr(0)})
		if len(r.State.Tabs) != 2 || r.State.Tabs[r.State.ActiveTab].ID != viewed || !hasEffect(r.Effects, muxfx.EffectKillPty) {
			t.Errorf("result = %+v", r)
		}
	})

	t.Run("closeTab without an index closes the active tab", func(t *testing.T) {
		t.Parallel()

		s := reduce(t, ptr(baseState(t)), &muxfx.Action{Type: muxfx.ActionNewTab}).State
		if r := reduce(t, &s, &muxfx.Action{Type: muxfx.ActionCloseTab}); len(r.State.Tabs) != 1 {
			t.Errorf("tabs = %d, want 1", len(r.State.Tabs))
		}
	})

	t.Run("nextTab and prevTab wrap around", func(t *testing.T) {
		t.Parallel()

		s := reduce(t, ptr(baseState(t)), &muxfx.Action{Type: muxfx.ActionNewTab}).State
		s = reduce(t, &s, &muxfx.Action{Type: muxfx.ActionNextTab}).State

		if s.ActiveTab != 0 {
			t.Errorf("active = %d, want 0", s.ActiveTab)
		}

		s = reduce(t, &s, &muxfx.Action{Type: muxfx.ActionPrevTab}).State
		if s.ActiveTab != 1 {
			t.Errorf("active = %d, want 1", s.ActiveTab)
		}
	})

	t.Run("resizeViewport updates the viewport", func(t *testing.T) {
		t.Parallel()

		r := reduce(t, ptr(baseState(t)), &muxfx.Action{Type: muxfx.ActionResizeViewport, Cols: 120, Rows: 40})
		if r.State.Viewport != (muxfx.Viewport{Cols: 120, Rows: 40}) {
			t.Errorf("viewport = %+v", r.State.Viewport)
		}
	})
}

func TestSplitTree(t *testing.T) {
	t.Parallel()

	ab := muxfx.SplitLeaf(muxfx.Leaf("a"), "a", muxfx.SplitVertical, "b", 0.5)
	abc := muxfx.SplitLeaf(ab, "b", muxfx.SplitHorizontal, "c", 0.5)

	t.Run("collectLeaves returns panes in order", func(t *testing.T) {
		t.Parallel()

		if got := muxfx.CollectLeaves(abc); !slices.Equal(got, []muxfx.PaneID{"a", "b", "c"}) {
			t.Errorf("leaves = %v", got)
		}
	})

	t.Run("splitLeaf on a missing target is a no-op", func(t *testing.T) {
		t.Parallel()

		if got := muxfx.SplitLeaf(ab, "zz", muxfx.SplitVertical, "x", 0.5); got != ab {
			t.Error("tree changed")
		}
	})

	t.Run("removeLeaf collapses the branch and promotes the sibling", func(t *testing.T) {
		t.Parallel()

		r := muxfx.RemoveLeaf(abc, "b")
		if got := muxfx.CollectLeaves(r.Root); !slices.Equal(got, []muxfx.PaneID{"a", "c"}) || r.Promoted != "c" {
			t.Errorf("result = %v promoted %q", got, r.Promoted)
		}

		if r := muxfx.RemoveLeaf(muxfx.Leaf("a"), "a"); r.Root != nil {
			t.Error("removing the only pane left a tree")
		}
	})

	t.Run("resizeFocused clamps to the usable range", func(t *testing.T) {
		t.Parallel()

		node := ab
		for range 20 {
			node = muxfx.ResizeFocused(node, "a", muxfx.DirectionRight, 0.05)
		}

		if node.Ratio != 0.9 {
			t.Errorf("ratio = %v, want 0.9", node.Ratio)
		}

		if got := muxfx.ResizeFocused(ab, "a", muxfx.DirectionDown, 0.05); got != ab {
			t.Error("a perpendicular resize changed the tree")
		}
	})
}

func TestGeometry(t *testing.T) {
	t.Parallel()

	t.Run("neighbour lookup follows overlap", func(t *testing.T) {
		t.Parallel()

		geoms := map[muxfx.PaneID]muxfx.Geom{
			"a": {X: 0, Y: 0, Width: 40, Height: 12},
			"b": {X: 40, Y: 0, Width: 40, Height: 12},
			"c": {X: 0, Y: 12, Width: 80, Height: 12},
		}
		order := []muxfx.PaneID{"a", "b", "c"}

		tests := []struct {
			from muxfx.PaneID
			dir  muxfx.Direction
			want muxfx.PaneID
		}{
			{"a", muxfx.DirectionRight, "b"},
			{"b", muxfx.DirectionLeft, "a"},
			{"a", muxfx.DirectionDown, "c"},
			{"c", muxfx.DirectionUp, "a"},
			{"a", muxfx.DirectionLeft, ""},
			{"a", muxfx.DirectionUp, ""},
		}

		for _, tc := range tests {
			if got := muxfx.NeighborInDirection(geoms, order, tc.from, tc.dir); got != tc.want {
				t.Errorf("%s %s = %q, want %q", tc.from, tc.dir, got, tc.want)
			}
		}
	})

	t.Run("reserved regions offset and shrink the pane area", func(t *testing.T) {
		t.Parallel()

		tab := muxfx.Tab{ID: "t", Name: "t", Root: muxfx.Leaf("p"), FocusedPane: "p"}
		chrome := muxfx.Chrome{TabBarRows: 1, StatusBarRows: 1, LeftCols: 20, TopRows: 5}

		got := muxfx.ComputeTabGeoms(&tab, muxfx.Viewport{Cols: 100, Rows: 30}, chrome)["p"]
		if got != (muxfx.Geom{X: 20, Y: 6, Width: 80, Height: 23}) {
			t.Errorf("geom = %+v", got)
		}

		regions := muxfx.ComputeDecorationRegions(muxfx.Viewport{Cols: 100, Rows: 30}, chrome)
		if *regions.Left != (muxfx.Region{X: 1, Y: 2, Width: 20, Height: 28}) ||
			*regions.Top != (muxfx.Region{X: 21, Y: 2, Width: 80, Height: 5}) || regions.Right != nil {
			t.Errorf("regions = %+v %+v %+v", regions.Left, regions.Top, regions.Right)
		}
	})

	t.Run("effective chrome drops decorations that would starve the panes", func(t *testing.T) {
		t.Parallel()

		chrome := muxfx.Chrome{TabBarRows: 1, StatusBarRows: 1, LeftCols: 30, TopRows: 8}

		if got := muxfx.EffectiveChrome(muxfx.Viewport{Cols: 100, Rows: 30}, chrome); got.LeftCols != 30 || got.TopRows != 8 {
			t.Errorf("roomy chrome = %+v", got)
		}

		if got := muxfx.EffectiveChrome(muxfx.Viewport{Cols: 35, Rows: 10}, chrome); got.LeftCols != 0 || got.TopRows != 0 {
			t.Errorf("cramped chrome = %+v", got)
		}
	})

	t.Run("splits round the way the TypeScript flex layout did", func(t *testing.T) {
		t.Parallel()

		root := muxfx.SplitLeaf(muxfx.Leaf("a"), "a", muxfx.SplitVertical, "b", 0.5)
		root = muxfx.ResizeFocused(root, "a", muxfx.DirectionRight, 0.05)
		tab := muxfx.Tab{Root: root, FocusedPane: "a"}

		geoms := muxfx.ComputeTabGeoms(&tab, muxfx.Viewport{Cols: 81, Rows: 24}, muxfx.DefaultChrome())
		if geoms["a"] != (muxfx.Geom{X: 0, Y: 1, Width: 44, Height: 22}) || geoms["b"] != (muxfx.Geom{X: 44, Y: 1, Width: 37, Height: 22}) {
			t.Errorf("geoms = %+v", geoms)
		}
	})
}
