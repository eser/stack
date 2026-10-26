// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"bytes"
	"encoding/json"
	"fmt"
	"slices"
)

// ScenePane is a pane as a frontend needs to place and label it.
type ScenePane struct {
	ID      PaneID   `json:"id"`
	Kind    PaneKind `json:"kind"`
	Title   string   `json:"title"`
	Geom    Geom     `json:"geom"`
	Focused bool     `json:"focused"`
	Exited  bool     `json:"exited"`
}

// SceneTab is a tab as the tab bar shows it.
type SceneTab struct {
	ID   TabID  `json:"id"`
	Name string `json:"name"`
}

// Scene is everything a frontend needs to lay out a frame of the active tab:
// no ANSI and no pane output, which is streamed separately.
type Scene struct {
	Tabs        []SceneTab     `json:"tabs"`
	ActiveTab   int            `json:"activeTab"`
	Mode        InputMode      `json:"mode"`
	Viewport    Viewport       `json:"viewport"`
	FocusedPane OptionalPaneID `json:"focusedPane"`
	Panes       []ScenePane    `json:"panes"`
	// Chrome is the effective chrome the server laid panes out with; frontends
	// draw decorations into the same regions.
	Chrome Chrome `json:"chrome"`
}

// DeriveScene builds the scene of the active tab.
func DeriveScene(state *State, chrome Chrome) Scene {
	if state.ActiveTab < 0 || state.ActiveTab >= len(state.Tabs) {
		return Scene{
			Tabs:     []SceneTab{},
			Mode:     state.Mode,
			Viewport: state.Viewport,
			Panes:    []ScenePane{},
			Chrome:   chrome,
		}
	}

	tab := state.Tabs[state.ActiveTab]
	geoms := ComputeTabGeoms(&tab, state.Viewport, chrome)

	panes := []ScenePane{}

	for _, id := range CollectLeaves(tab.Root) {
		geom, ok := geoms[id]
		if !ok {
			continue // hidden behind a fullscreen pane
		}

		sp := ScenePane{ID: id, Kind: PaneKindTerminal, Title: string(id), Geom: geom, Focused: id == tab.FocusedPane}
		if pane, known := state.Panes[id]; known {
			sp.Kind = pane.Kind
			sp.Title = pane.Title
			sp.Exited = pane.Exited
		}

		panes = append(panes, sp)
	}

	tabs := make([]SceneTab, 0, len(state.Tabs))
	for _, t := range state.Tabs {
		tabs = append(tabs, SceneTab{ID: t.ID, Name: t.Name})
	}

	return Scene{
		Tabs:        tabs,
		ActiveTab:   state.ActiveTab,
		Mode:        state.Mode,
		Viewport:    state.Viewport,
		FocusedPane: OptionalPaneID(tab.FocusedPane),
		Panes:       panes,
		Chrome:      chrome,
	}
}

// SceneDelta holds the scene fields that changed; nil fields did not. The tab
// and pane lists are sent whole when they differ.
type SceneDelta struct {
	Mode      *InputMode
	ActiveTab *int
	// FocusedPane points to "" when the focus changed to no pane (null on the
	// wire).
	FocusedPane *OptionalPaneID
	Viewport    *Viewport
	Tabs        []SceneTab
	Panes       []ScenePane
	Chrome      *Chrome

	// tabsSet and panesSet tell an empty list that changed from no change.
	tabsSet  bool
	panesSet bool
}

// HasTabs reports whether the delta carries the tab list.
func (d *SceneDelta) HasTabs() bool {
	return d.tabsSet
}

// HasPanes reports whether the delta carries the pane list.
func (d *SceneDelta) HasPanes() bool {
	return d.panesSet
}

// sceneDeltaWire is the JSON shape of a delta: absent fields did not change.
type sceneDeltaWire struct {
	Mode        *InputMode      `json:"mode,omitempty"`
	ActiveTab   *int            `json:"activeTab,omitempty"`
	FocusedPane json.RawMessage `json:"focusedPane,omitempty"`
	Viewport    *Viewport       `json:"viewport,omitempty"`
	Tabs        *[]SceneTab     `json:"tabs,omitempty"`
	Panes       *[]ScenePane    `json:"panes,omitempty"`
	Chrome      *Chrome         `json:"chrome,omitempty"`
}

// MarshalJSON writes the changed fields only, including empty lists that
// changed and a focus that moved to no pane (null).
func (d *SceneDelta) MarshalJSON() ([]byte, error) {
	w := sceneDeltaWire{Mode: d.Mode, ActiveTab: d.ActiveTab, Viewport: d.Viewport, Chrome: d.Chrome}

	if d.FocusedPane != nil {
		raw, err := d.FocusedPane.MarshalJSON()
		if err != nil {
			return nil, err
		}

		w.FocusedPane = raw
	}

	if d.tabsSet {
		tabs := d.Tabs
		if tabs == nil {
			tabs = []SceneTab{}
		}

		w.Tabs = &tabs
	}

	if d.panesSet {
		panes := d.Panes
		if panes == nil {
			panes = []ScenePane{}
		}

		w.Panes = &panes
	}

	out, err := json.Marshal(w)
	if err != nil {
		return nil, fmt.Errorf("write scene delta: %w", err)
	}

	return out, nil
}

// UnmarshalJSON reads a delta written by [SceneDelta.MarshalJSON] or by the
// TypeScript server.
func (d *SceneDelta) UnmarshalJSON(data []byte) error {
	var w sceneDeltaWire
	if err := json.Unmarshal(data, &w); err != nil {
		return fmt.Errorf("read scene delta: %w", err)
	}

	*d = SceneDelta{Mode: w.Mode, ActiveTab: w.ActiveTab, Viewport: w.Viewport, Chrome: w.Chrome}

	if len(w.FocusedPane) > 0 {
		var focus OptionalPaneID
		if !bytes.Equal(w.FocusedPane, []byte("null")) {
			if err := json.Unmarshal(w.FocusedPane, &focus); err != nil {
				return fmt.Errorf("read scene delta focusedPane: %w", err)
			}
		}

		d.FocusedPane = &focus
	}

	if w.Tabs != nil {
		d.setTabs(*w.Tabs)
	}

	if w.Panes != nil {
		d.setPanes(*w.Panes)
	}

	return nil
}

func (d *SceneDelta) setTabs(tabs []SceneTab) {
	d.Tabs = tabs
	d.tabsSet = true
}

func (d *SceneDelta) setPanes(panes []ScenePane) {
	d.Panes = panes
	d.panesSet = true
}

// DiffScene returns the delta from prev to next, or nil when nothing
// changed. A nil prev gives a full delta, for a fresh attach.
func DiffScene(prev, next *Scene) *SceneDelta {
	if prev == nil {
		d := &SceneDelta{
			Mode:        ptrTo(next.Mode),
			ActiveTab:   ptrTo(next.ActiveTab),
			FocusedPane: ptrTo(next.FocusedPane),
			Viewport:    ptrTo(next.Viewport),
			Chrome:      ptrTo(next.Chrome),
		}
		d.setTabs(next.Tabs)
		d.setPanes(next.Panes)

		return d
	}

	d := &SceneDelta{}
	changed := false

	if prev.Mode != next.Mode {
		d.Mode = ptrTo(next.Mode)
		changed = true
	}

	if prev.ActiveTab != next.ActiveTab {
		d.ActiveTab = ptrTo(next.ActiveTab)
		changed = true
	}

	if prev.FocusedPane != next.FocusedPane {
		d.FocusedPane = ptrTo(next.FocusedPane)
		changed = true
	}

	if prev.Viewport != next.Viewport {
		d.Viewport = ptrTo(next.Viewport)
		changed = true
	}

	if !slices.Equal(prev.Tabs, next.Tabs) {
		d.setTabs(next.Tabs)
		changed = true
	}

	if !slices.Equal(prev.Panes, next.Panes) {
		d.setPanes(next.Panes)
		changed = true
	}

	if prev.Chrome != next.Chrome {
		d.Chrome = ptrTo(next.Chrome)
		changed = true
	}

	if !changed {
		return nil
	}

	return d
}

// ApplyDelta returns the scene a frontend holds after receiving delta on top
// of prev (nil before the first scene). fallback is the viewport to use when
// neither carries one.
func ApplyDelta(prev *Scene, delta *SceneDelta, fallback Viewport) Scene {
	next := Scene{
		Tabs:     []SceneTab{},
		Mode:     ModeNormal,
		Viewport: fallback,
		Panes:    []ScenePane{},
		Chrome:   DefaultChrome(),
	}

	if prev != nil {
		next = *prev
	}

	if delta.HasTabs() {
		next.Tabs = delta.Tabs
	}

	if delta.ActiveTab != nil {
		next.ActiveTab = *delta.ActiveTab
	}

	if delta.Mode != nil {
		next.Mode = *delta.Mode
	}

	if delta.Viewport != nil {
		next.Viewport = *delta.Viewport
	}

	if delta.FocusedPane != nil {
		next.FocusedPane = *delta.FocusedPane
	}

	if delta.HasPanes() {
		next.Panes = delta.Panes
	}

	if delta.Chrome != nil {
		next.Chrome = *delta.Chrome
	}

	return next
}

func ptrTo[T any](v T) *T {
	return &v
}
