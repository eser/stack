// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"maps"
	"strconv"
)

// EffectType names an [Effect].
type EffectType string

// The effects the reducer emits. Pane resizing is not one: the server
// recomputes the layout after every action and resizes the panes whose
// rectangle changed.
const (
	// EffectSpawnPty starts the process of a new pane.
	EffectSpawnPty EffectType = "spawnPty"
	// EffectWritePty writes input to a pane's process.
	EffectWritePty EffectType = "writePty"
	// EffectKillPty stops a closed pane's process.
	EffectKillPty EffectType = "killPty"
	// EffectScrollPane scrolls a pane's scrollback.
	EffectScrollPane EffectType = "scrollPane"
	// EffectRender asks for a frame.
	EffectRender EffectType = "render"
	// EffectDetach lets the client go and keeps the session.
	EffectDetach EffectType = "detach"
	// EffectExit ends the session.
	EffectExit EffectType = "exit"
)

// Effect is an I/O request the reducer leaves to the server.
type Effect struct {
	Type   EffectType   `json:"type"`
	Pane   PaneID       `json:"pane,omitempty"`
	Data   string       `json:"data,omitempty"`
	Scroll ScrollAction `json:"action,omitempty"`
}

// Result is one reduce step: the next state and the effects to run.
type Result struct {
	State   State
	Effects []Effect
}

const resizeDelta = 0.05

func renderOnly() []Effect {
	return []Effect{{Type: EffectRender}}
}

// NewInitialState returns an empty state; dispatch newTab to open the first
// tab.
func NewInitialState(viewport Viewport) State {
	return State{
		Panes:       map[PaneID]Pane{},
		Tabs:        []Tab{},
		ActiveTab:   0,
		Mode:        ModeNormal,
		Viewport:    viewport,
		Running:     true,
		NextPaneSeq: 1,
		NextTabSeq:  1,
	}
}

func noop(state *State) Result {
	return Result{State: *state}
}

func activeTabOf(state *State) (Tab, bool) {
	if state.ActiveTab < 0 || state.ActiveTab >= len(state.Tabs) {
		return Tab{}, false
	}

	return state.Tabs[state.ActiveTab], true
}

// withTab returns a copy of state whose tab at index is replaced.
func withTab(state *State, index int, tab *Tab) State {
	next := *state
	next.Tabs = make([]Tab, len(state.Tabs))
	copy(next.Tabs, state.Tabs)
	next.Tabs[index] = *tab

	return next
}

func withoutTab(tabs []Tab, index int) []Tab {
	out := make([]Tab, 0, len(tabs)-1)
	out = append(out, tabs[:index]...)

	return append(out, tabs[index+1:]...)
}

type paneSpec struct {
	kind    PaneKind
	command string
	args    []string
	cwd     string
	title   string
	meta    map[string]string
}

func specOf(action *Action) paneSpec {
	return paneSpec{
		kind:    action.Kind,
		command: action.Command,
		args:    action.Args,
		cwd:     action.Cwd,
		title:   action.Title,
		meta:    action.Meta,
	}
}

func makePane(state *State, spec *paneSpec) (Pane, State) {
	id := PaneID("pane-" + strconv.Itoa(state.NextPaneSeq))

	kind := spec.kind
	if kind == "" {
		kind = PaneKindTerminal
	}

	title := spec.title
	if title == "" {
		title = spec.command
	}

	if title == "" {
		title = "shell"
	}

	pane := Pane{
		ID:      id,
		Kind:    kind,
		Title:   title,
		Cwd:     spec.cwd,
		Command: spec.command,
		Args:    spec.args,
		Meta:    spec.meta,
	}

	next := *state
	next.Panes = maps.Clone(state.Panes)
	next.Panes[id] = pane
	next.NextPaneSeq = state.NextPaneSeq + 1

	return pane, next
}

// shiftActiveTab keeps the user on the same tab after the tab at removed
// goes: lower indexes shift down by one, otherwise the index is clamped.
func shiftActiveTab(active, removed, remaining int) int {
	if removed < active {
		return active - 1
	}

	return min(active, remaining-1)
}

// closeTabAt closes a tab and kills its panes; closing the last tab exits.
func closeTabAt(state *State, index int) Result {
	if index < 0 || index >= len(state.Tabs) {
		return noop(state)
	}

	tab := state.Tabs[index]
	paneIDs := CollectLeaves(tab.Root)

	effects := make([]Effect, 0, len(paneIDs)+1)
	panes := maps.Clone(state.Panes)

	for _, p := range paneIDs {
		effects = append(effects, Effect{Type: EffectKillPty, Pane: p})
		delete(panes, p)
	}

	next := *state
	next.Panes = panes
	next.Tabs = withoutTab(state.Tabs, index)

	if len(next.Tabs) == 0 {
		next.Running = false

		return Result{State: next, Effects: append(effects, Effect{Type: EffectExit})}
	}

	next.ActiveTab = shiftActiveTab(state.ActiveTab, index, len(next.Tabs))

	return Result{State: next, Effects: append(effects, Effect{Type: EffectRender})}
}

func addPane(state *State, direction SplitDirection, spec *paneSpec) Result {
	tab, ok := activeTabOf(state)
	if !ok {
		return noop(state)
	}

	pane, next := makePane(state, spec)
	tab.Root = SplitLeaf(tab.Root, tab.FocusedPane, direction, pane.ID, 0.5)
	tab.FocusedPane = pane.ID
	tab.FullscreenPane = ""

	return Result{
		State:   withTab(&next, next.ActiveTab, &tab),
		Effects: []Effect{{Type: EffectSpawnPty, Pane: pane.ID}, {Type: EffectRender}},
	}
}

// Reduce applies an action to a state. It does no I/O: what has to happen
// outside the state comes back as effects. Neither argument is modified.
func Reduce(state *State, action *Action) Result {
	switch action.Type {
	case ActionSwitchMode:
		next := *state
		next.Mode = action.Mode

		return Result{State: next, Effects: renderOnly()}
	case ActionSplitPane:
		return addPane(state, SplitDirection(action.Direction), &paneSpec{})
	case ActionNewPane:
		direction := SplitDirection(action.Direction)
		if direction == "" {
			direction = SplitVertical
		}

		spec := specOf(action)

		return addPane(state, direction, &spec)
	case ActionCloseFocusedPane:
		return closeFocusedPane(state)
	case ActionFocusDirection:
		return focusDirection(state, Direction(action.Direction))
	case ActionFocusNext, ActionFocusPrev:
		return focusCycle(state, action.Type == ActionFocusNext)
	case ActionFocusPane:
		return focusPane(state, action.Pane)
	case ActionToggleFullscreen:
		return toggleFullscreen(state)
	case ActionResizePane:
		return resizePane(state, Direction(action.Direction))
	case ActionNewTab:
		return newTab(state, action)
	case ActionCloseTab:
		index := state.ActiveTab
		if action.Index != nil {
			index = *action.Index
		}

		return closeTabAt(state, index)
	case ActionGotoTab:
		if action.Index == nil || *action.Index < 0 || *action.Index >= len(state.Tabs) {
			return noop(state)
		}

		next := *state
		next.ActiveTab = *action.Index

		return Result{State: next, Effects: renderOnly()}
	case ActionNextTab, ActionPrevTab:
		return cycleTab(state, action.Type == ActionNextTab)
	case ActionScroll:
		tab, ok := activeTabOf(state)
		if !ok {
			return noop(state)
		}

		return Result{State: *state, Effects: []Effect{{Type: EffectScrollPane, Pane: tab.FocusedPane, Scroll: action.Scroll}}}
	case ActionWriteInput:
		tab, ok := activeTabOf(state)
		if !ok {
			return noop(state)
		}

		return Result{State: *state, Effects: []Effect{{Type: EffectWritePty, Pane: tab.FocusedPane, Data: action.Data}}}
	case ActionWriteToPane:
		// Address a pane regardless of focus, for an agent driving it or a web
		// client notifying the pane bound to a spec. Unknown panes are ignored.
		if _, ok := state.Panes[action.Pane]; !ok {
			return noop(state)
		}

		return Result{State: *state, Effects: []Effect{{Type: EffectWritePty, Pane: action.Pane, Data: action.Data}}}
	case ActionResizeViewport:
		next := *state
		next.Viewport = Viewport{Cols: action.Cols, Rows: action.Rows}

		return Result{State: next, Effects: renderOnly()}
	case ActionPaneExited:
		return paneExited(state, action.Pane)
	case ActionDetach:
		return Result{State: *state, Effects: []Effect{{Type: EffectDetach}}}
	case ActionQuit:
		next := *state
		next.Running = false

		return Result{State: next, Effects: []Effect{{Type: EffectExit}}}
	default:
		return noop(state)
	}
}

func closeFocusedPane(state *State) Result {
	tab, ok := activeTabOf(state)
	if !ok {
		return noop(state)
	}

	closed := tab.FocusedPane

	removed := RemoveLeaf(tab.Root, closed)
	if removed.Root == nil {
		return closeTabAt(state, state.ActiveTab)
	}

	next := *state
	next.Panes = maps.Clone(state.Panes)
	delete(next.Panes, closed)

	tab.Root = removed.Root
	tab.FocusedPane = removed.Promoted

	if tab.FocusedPane == "" {
		tab.FocusedPane = FirstLeaf(removed.Root)
	}

	tab.FullscreenPane = ""

	return Result{
		State:   withTab(&next, next.ActiveTab, &tab),
		Effects: []Effect{{Type: EffectKillPty, Pane: closed}, {Type: EffectRender}},
	}
}

func focusDirection(state *State, direction Direction) Result {
	tab, ok := activeTabOf(state)
	if !ok {
		return noop(state)
	}

	// The reducer lays out with the default chrome, as the TypeScript engine
	// did; decoration bands only shift panes, not their neighbours.
	geoms := ComputeTabGeoms(&tab, state.Viewport, DefaultChrome())

	target := NeighborInDirection(geoms, CollectLeaves(tab.Root), tab.FocusedPane, direction)
	if target == "" {
		return noop(state)
	}

	tab.FocusedPane = target

	return Result{State: withTab(state, state.ActiveTab, &tab), Effects: renderOnly()}
}

func focusCycle(state *State, forward bool) Result {
	tab, ok := activeTabOf(state)
	if !ok {
		return noop(state)
	}

	leaves := CollectLeaves(tab.Root)
	if len(leaves) <= 1 {
		return noop(state)
	}

	idx := -1

	for i, id := range leaves {
		if id == tab.FocusedPane {
			idx = i

			break
		}
	}

	step := -1
	if forward {
		step = 1
	}

	tab.FocusedPane = leaves[((idx+step)%len(leaves)+len(leaves))%len(leaves)]

	return Result{State: withTab(state, state.ActiveTab, &tab), Effects: renderOnly()}
}

func focusPane(state *State, pane PaneID) Result {
	tab, ok := activeTabOf(state)
	if !ok || !HasLeaf(tab.Root, pane) {
		return noop(state)
	}

	tab.FocusedPane = pane

	return Result{State: withTab(state, state.ActiveTab, &tab), Effects: renderOnly()}
}

func toggleFullscreen(state *State) Result {
	tab, ok := activeTabOf(state)
	if !ok {
		return noop(state)
	}

	if tab.FullscreenPane == tab.FocusedPane {
		tab.FullscreenPane = ""
	} else {
		tab.FullscreenPane = tab.FocusedPane
	}

	return Result{State: withTab(state, state.ActiveTab, &tab), Effects: renderOnly()}
}

func resizePane(state *State, direction Direction) Result {
	tab, ok := activeTabOf(state)
	if !ok {
		return noop(state)
	}

	root := ResizeFocused(tab.Root, tab.FocusedPane, direction, resizeDelta)
	if root == tab.Root {
		return noop(state)
	}

	tab.Root = root

	return Result{State: withTab(state, state.ActiveTab, &tab), Effects: renderOnly()}
}

func newTab(state *State, action *Action) Result {
	spec := specOf(action)
	pane, next := makePane(state, &spec)

	name := action.Title
	if name == "" {
		name = "tab " + strconv.Itoa(state.NextTabSeq)
	}

	tab := Tab{
		ID:          TabID("tab-" + strconv.Itoa(state.NextTabSeq)),
		Name:        name,
		Root:        Leaf(pane.ID),
		FocusedPane: pane.ID,
	}

	next.Tabs = make([]Tab, len(state.Tabs), len(state.Tabs)+1)
	copy(next.Tabs, state.Tabs)
	next.Tabs = append(next.Tabs, tab)
	next.ActiveTab = len(next.Tabs) - 1
	next.NextTabSeq = state.NextTabSeq + 1

	return Result{
		State:   next,
		Effects: []Effect{{Type: EffectSpawnPty, Pane: pane.ID}, {Type: EffectRender}},
	}
}

func cycleTab(state *State, forward bool) Result {
	if len(state.Tabs) <= 1 {
		return noop(state)
	}

	step := -1
	if forward {
		step = 1
	}

	next := *state
	next.ActiveTab = ((state.ActiveTab+step)%len(state.Tabs) + len(state.Tabs)) % len(state.Tabs)

	return Result{State: next, Effects: renderOnly()}
}

// paneExited removes a pane whose process ended on its own. No kill effect:
// the process is already gone.
func paneExited(state *State, pane PaneID) Result {
	tabIndex := -1

	for i := range state.Tabs {
		if HasLeaf(state.Tabs[i].Root, pane) {
			tabIndex = i

			break
		}
	}

	if tabIndex < 0 {
		return noop(state)
	}

	tab := state.Tabs[tabIndex]
	removed := RemoveLeaf(tab.Root, pane)

	next := *state
	next.Panes = maps.Clone(state.Panes)
	delete(next.Panes, pane)

	if removed.Root == nil {
		next.Tabs = withoutTab(state.Tabs, tabIndex)

		if len(next.Tabs) == 0 {
			next.Running = false

			return Result{State: next, Effects: []Effect{{Type: EffectExit}}}
		}

		next.ActiveTab = shiftActiveTab(state.ActiveTab, tabIndex, len(next.Tabs))

		return Result{State: next, Effects: renderOnly()}
	}

	tab.Root = removed.Root

	if tab.FocusedPane == pane {
		tab.FocusedPane = removed.Promoted
		if tab.FocusedPane == "" {
			tab.FocusedPane = FirstLeaf(removed.Root)
		}
	}

	if tab.FullscreenPane == pane {
		tab.FullscreenPane = ""
	}

	return Result{State: withTab(&next, tabIndex, &tab), Effects: renderOnly()}
}
