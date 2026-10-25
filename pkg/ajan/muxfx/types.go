// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package muxfx is the core of a terminal multiplexer: tabs, split panes,
// keybinding modes and the processes running in them.
//
// A pure engine (split tree, geometry, [Reduce]) holds the state, a [Server]
// owns the pseudo-terminals (through shellfx/pty) and turns reducer effects
// into I/O, and frontends draw what the server sends. The server speaks one
// neutral protocol over any [Transport], so the same session can drive the
// terminal frontend in this package or a browser frontend; the JSON shape of
// every message matches the TypeScript @eserstack/mux protocol it replaces.
// The vt subpackage is the screen model frontends render pane output with.
package muxfx

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// PaneID identifies a pane ("pane-3").
type PaneID string

// TabID identifies a tab ("tab-2").
type TabID string

// PaneKind says what a pane runs. Only terminal panes exist; "agent" is kept
// for wire compatibility and nothing branches on it.
type PaneKind string

const (
	// PaneKindTerminal runs a shell or command.
	PaneKindTerminal PaneKind = "terminal"
	// PaneKindAgent is accepted on the wire and treated as a terminal pane.
	PaneKindAgent PaneKind = "agent"
)

// Geom is a rectangle in terminal cells, 0-based.
type Geom struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

// Viewport is a client's terminal size in cells.
type Viewport struct {
	Cols int `json:"cols"`
	Rows int `json:"rows"`
}

// Pane describes a pane. The live process is owned by the server and keyed
// by ID, so a Pane can be copied, diffed and sent over the wire.
type Pane struct {
	ID    PaneID   `json:"id"`
	Kind  PaneKind `json:"kind"`
	Title string   `json:"title"`
	Cwd   string   `json:"cwd,omitempty"`
	// Command to run; empty means the server's default shell.
	Command string   `json:"command,omitempty"`
	Args    []string `json:"args,omitempty"`
	// Meta is free-form data for consumers, such as a session id.
	Meta   map[string]string `json:"meta,omitempty"`
	Exited bool              `json:"exited,omitempty"`
}

// SplitDirection is how a branch divides its area. "vertical" draws a
// vertical divider (panes side by side); "horizontal" stacks them.
type SplitDirection string

const (
	// SplitVertical puts the panes side by side.
	SplitVertical SplitDirection = "vertical"
	// SplitHorizontal stacks the panes.
	SplitHorizontal SplitDirection = "horizontal"
)

// NodeKind tells a split-tree leaf from a branch.
type NodeKind string

const (
	// NodeLeaf holds one pane.
	NodeLeaf NodeKind = "leaf"
	// NodeBranch splits its area between two children.
	NodeBranch NodeKind = "branch"
)

// SplitNode is a binary split tree: a leaf holds one pane, a branch splits
// its area between First and Second. Nodes are never modified once built;
// the tree functions return new trees.
type SplitNode struct {
	Kind      NodeKind       `json:"kind"`
	Pane      PaneID         `json:"pane,omitempty"`
	Direction SplitDirection `json:"direction,omitempty"`
	First     *SplitNode     `json:"first,omitempty"`
	Second    *SplitNode     `json:"second,omitempty"`
	// Ratio is the share of the area First gets, between 0.1 and 0.9.
	Ratio float64 `json:"ratio,omitempty"`
}

// Tab is a named workspace holding a split tree of panes.
type Tab struct {
	ID          TabID      `json:"id"`
	Name        string     `json:"name"`
	Root        *SplitNode `json:"root"`
	FocusedPane PaneID     `json:"focusedPane"`
	// FullscreenPane, when set, is the only pane laid out (zoom).
	FullscreenPane PaneID `json:"fullscreenPane,omitempty"`
}

// Direction is a cardinal direction for focus movement and resizing.
type Direction string

const (
	// DirectionUp points up.
	DirectionUp Direction = "up"
	// DirectionDown points down.
	DirectionDown Direction = "down"
	// DirectionLeft points left.
	DirectionLeft Direction = "left"
	// DirectionRight points right.
	DirectionRight Direction = "right"
)

// ScrollAction is a scrollback navigation step.
type ScrollAction string

const (
	// ScrollUp moves up a few lines.
	ScrollUp ScrollAction = "up"
	// ScrollDown moves down a few lines.
	ScrollDown ScrollAction = "down"
	// ScrollPageUp moves up a page.
	ScrollPageUp ScrollAction = "pageUp"
	// ScrollPageDown moves down a page.
	ScrollPageDown ScrollAction = "pageDown"
	// ScrollHome goes to the top.
	ScrollHome ScrollAction = "home"
	// ScrollEnd goes to the bottom.
	ScrollEnd ScrollAction = "end"
)

// InputMode decides how keys are read.
type InputMode string

const (
	// ModeNormal passes unbound keys to the focused pane.
	ModeNormal InputMode = "normal"
	// ModePane binds pane commands.
	ModePane InputMode = "pane"
	// ModeTab binds tab commands.
	ModeTab InputMode = "tab"
	// ModeResize binds pane resizing.
	ModeResize InputMode = "resize"
	// ModeScroll binds scrollback navigation.
	ModeScroll InputMode = "scroll"
	// ModeLocked passes every key but the unlock chord to the pane.
	ModeLocked InputMode = "locked"
)

// State is the whole engine state. Treat it as a value: [Reduce] returns a
// new State and never changes the one it is given.
type State struct {
	Panes       map[PaneID]Pane `json:"panes"`
	Tabs        []Tab           `json:"tabs"`
	ActiveTab   int             `json:"activeTab"`
	Mode        InputMode       `json:"mode"`
	Viewport    Viewport        `json:"viewport"`
	Running     bool            `json:"running"`
	NextPaneSeq int             `json:"nextPaneSeq"`
	NextTabSeq  int             `json:"nextTabSeq"`
}

// ActionType names an [Action].
type ActionType string

// The actions the reducer understands.
const (
	ActionSwitchMode       ActionType = "switchMode"
	ActionSplitPane        ActionType = "splitPane"
	ActionNewPane          ActionType = "newPane"
	ActionCloseFocusedPane ActionType = "closeFocusedPane"
	ActionFocusDirection   ActionType = "focusDirection"
	ActionFocusNext        ActionType = "focusNext"
	ActionFocusPrev        ActionType = "focusPrev"
	ActionFocusPane        ActionType = "focusPane"
	ActionToggleFullscreen ActionType = "toggleFullscreen"
	ActionResizePane       ActionType = "resizePane"
	ActionNewTab           ActionType = "newTab"
	ActionCloseTab         ActionType = "closeTab"
	ActionGotoTab          ActionType = "gotoTab"
	ActionNextTab          ActionType = "nextTab"
	ActionPrevTab          ActionType = "prevTab"
	ActionScroll           ActionType = "scroll"
	ActionWriteInput       ActionType = "writeInput"
	ActionWriteToPane      ActionType = "writeToPane"
	ActionResizeViewport   ActionType = "resizeViewport"
	ActionPaneExited       ActionType = "paneExited"
	ActionDetach           ActionType = "detach"
	ActionQuit             ActionType = "quit"
)

// Action is the engine vocabulary. Frontends turn keys and mouse events into
// actions; the reducer is the one place that interprets them. Which fields
// matter depends on Type, as in the TypeScript union:
//
//   - switchMode: Mode
//   - splitPane: Direction (a SplitDirection)
//   - newPane: Direction, Kind, Command, Args, Cwd, Title, Meta
//   - focusDirection, resizePane: Direction (a Direction), Step
//   - focusPane: Pane
//   - newTab: Kind, Command, Args, Cwd, Title, Meta
//   - closeTab: Index (nil for the active tab); gotoTab: Index
//   - scroll: Scroll
//   - writeInput: Data; writeToPane: Pane, Data
//   - resizeViewport: Cols, Rows
//   - paneExited: Pane, Code
type Action struct {
	Type      ActionType        `json:"type"`
	Mode      InputMode         `json:"mode,omitempty"`
	Direction string            `json:"direction,omitempty"`
	Kind      PaneKind          `json:"kind,omitempty"`
	Command   string            `json:"command,omitempty"`
	Args      []string          `json:"args,omitempty"`
	Cwd       string            `json:"cwd,omitempty"`
	Title     string            `json:"title,omitempty"`
	Meta      map[string]string `json:"meta,omitempty"`
	Pane      PaneID            `json:"pane,omitempty"`
	Data      string            `json:"data,omitempty"`
	Index     *int              `json:"index,omitempty"`
	Step      float64           `json:"step,omitempty"`
	Scroll    ScrollAction      `json:"action,omitempty"`
	Cols      int               `json:"cols,omitempty"`
	Rows      int               `json:"rows,omitempty"`
	Code      int               `json:"code,omitempty"`
}

// IntPtr returns a pointer to v, for [Action.Index].
func IntPtr(v int) *int {
	return &v
}

// OptionalPaneID is a pane id that is null on the wire when empty, as the
// focused pane of a scene with no tabs is.
type OptionalPaneID PaneID

// MarshalJSON writes null for an empty id.
func (p OptionalPaneID) MarshalJSON() ([]byte, error) {
	if p == "" {
		return []byte("null"), nil
	}

	return json.Marshal(string(p))
}

// UnmarshalJSON reads null as an empty id.
func (p *OptionalPaneID) UnmarshalJSON(data []byte) error {
	if bytes.Equal(data, []byte("null")) {
		*p = ""

		return nil
	}

	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return fmt.Errorf("read pane id: %w", err)
	}

	*p = OptionalPaneID(s)

	return nil
}
