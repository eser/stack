// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"strconv"
	"strings"
	"unicode/utf8"
)

// KeyChord is the canonical form of a key and its modifiers: "ctrl+p",
// "alt+left", "shift+tab", "n", "enter".
type KeyChord string

// KeyEvent is one decoded key press.
type KeyEvent struct {
	// Name is the key: a single character for printable keys, or a name such
	// as "enter", "escape", "left", "pageup".
	Name  string
	Ctrl  bool
	Meta  bool
	Shift bool
	// Raw is the bytes the terminal sent for the key; an unbound key is
	// forwarded to the pane as these bytes.
	Raw []byte
}

// ParseChord builds the canonical chord for a key event. Letter case is
// folded to lower case and shift is only spelled out for named keys, so "A"
// with shift is the chord "a", as in the TypeScript keymap.
func ParseChord(ev *KeyEvent) KeyChord {
	parts := make([]string, 0, 4)

	if ev.Ctrl {
		parts = append(parts, "ctrl")
	}

	if ev.Meta {
		parts = append(parts, "alt")
	}

	printable := utf8.RuneCountInString(ev.Name) == 1
	if ev.Shift && !printable {
		parts = append(parts, "shift")
	}

	if printable {
		parts = append(parts, strings.ToLower(ev.Name))
	} else {
		parts = append(parts, ev.Name)
	}

	return KeyChord(strings.Join(parts, "+"))
}

// Keymap is a compiled mode -> chord -> actions table. Treat it as read-only;
// build changes with [MergeOverrides].
type Keymap map[InputMode]map[KeyChord][]Action

// KeymapTable is the authoring form of a keymap: actions per chord per mode.
type KeymapTable map[InputMode]map[KeyChord][]Action

// BuildKeymap compiles a table into a keymap.
func BuildKeymap(table KeymapTable) Keymap {
	return MergeOverrides(Keymap{}, table)
}

// Lookup returns the actions bound to a chord in a mode, and whether the chord
// is bound.
func Lookup(km Keymap, mode InputMode, chord KeyChord) ([]Action, bool) {
	actions, ok := km[mode][chord]

	return actions, ok
}

// MergeOverrides returns base with the chords of overrides laid over it, per
// mode and per chord. base is not modified.
func MergeOverrides(base Keymap, overrides KeymapTable) Keymap {
	merged := make(Keymap, len(base)+len(overrides))

	for mode, chords := range base {
		inner := make(map[KeyChord][]Action, len(chords))
		for chord, actions := range chords {
			inner[chord] = actions
		}

		merged[mode] = inner
	}

	for mode, chords := range overrides {
		inner, ok := merged[mode]
		if !ok {
			inner = make(map[KeyChord][]Action, len(chords))
			merged[mode] = inner
		}

		for chord, actions := range chords {
			inner[chord] = append([]Action(nil), actions...)
		}
	}

	return merged
}

func one(action *Action) []Action {
	return []Action{*action}
}

func toNormal() Action {
	return Action{Type: ActionSwitchMode, Mode: ModeNormal}
}

func thenNormal(action *Action) []Action {
	return []Action{*action, toNormal()}
}

// DefaultKeymap returns the default bindings, modelled on established
// terminal multiplexers. In normal mode the reserved chords switch modes and
// every other key goes to the focused pane; in locked mode only ctrl+g is
// read, so full-screen programs get every key.
func DefaultKeymap() Keymap {
	focus := func(d Direction) []Action { return one(&Action{Type: ActionFocusDirection, Direction: string(d)}) }
	resize := func(d Direction) []Action { return one(&Action{Type: ActionResizePane, Direction: string(d)}) }
	scroll := func(s ScrollAction) []Action { return one(&Action{Type: ActionScroll, Scroll: s}) }
	exit := []Action{toNormal()}

	tabKeys := map[KeyChord][]Action{
		"n":     thenNormal(&Action{Type: ActionNewTab}),
		"x":     thenNormal(&Action{Type: ActionCloseTab}),
		"left":  one(&Action{Type: ActionPrevTab}),
		"h":     one(&Action{Type: ActionPrevTab}),
		"right": one(&Action{Type: ActionNextTab}),
		"l":     one(&Action{Type: ActionNextTab}),
		"enter": exit, "escape": exit,
	}

	for i := 1; i <= 9; i++ {
		tabKeys[KeyChord(strconv.Itoa(i))] = one(&Action{Type: ActionGotoTab, Index: IntPtr(i - 1)})
	}

	return BuildKeymap(KeymapTable{
		ModeNormal: {
			"ctrl+p": one(&Action{Type: ActionSwitchMode, Mode: ModePane}),
			"ctrl+t": one(&Action{Type: ActionSwitchMode, Mode: ModeTab}),
			"ctrl+n": one(&Action{Type: ActionSwitchMode, Mode: ModeResize}),
			"ctrl+s": one(&Action{Type: ActionSwitchMode, Mode: ModeScroll}),
			"ctrl+g": one(&Action{Type: ActionSwitchMode, Mode: ModeLocked}),
			"ctrl+o": one(&Action{Type: ActionDetach}),
			"ctrl+q": one(&Action{Type: ActionQuit}),
		},
		ModePane: {
			"n":     thenNormal(&Action{Type: ActionNewPane}),
			"v":     thenNormal(&Action{Type: ActionSplitPane, Direction: string(SplitVertical)}),
			"s":     thenNormal(&Action{Type: ActionSplitPane, Direction: string(SplitHorizontal)}),
			"x":     thenNormal(&Action{Type: ActionCloseFocusedPane}),
			"f":     thenNormal(&Action{Type: ActionToggleFullscreen}),
			"z":     thenNormal(&Action{Type: ActionToggleFullscreen}),
			"left":  focus(DirectionLeft),
			"right": focus(DirectionRight),
			"up":    focus(DirectionUp),
			"down":  focus(DirectionDown),
			"h":     focus(DirectionLeft),
			"l":     focus(DirectionRight),
			"k":     focus(DirectionUp),
			"j":     focus(DirectionDown),
			"enter": exit, "escape": exit,
		},
		ModeTab: tabKeys,
		ModeResize: {
			"left":  resize(DirectionLeft),
			"right": resize(DirectionRight),
			"up":    resize(DirectionUp),
			"down":  resize(DirectionDown),
			"h":     resize(DirectionLeft),
			"l":     resize(DirectionRight),
			"k":     resize(DirectionUp),
			"j":     resize(DirectionDown),
			"enter": exit, "escape": exit,
		},
		ModeScroll: {
			"up":       scroll(ScrollUp),
			"down":     scroll(ScrollDown),
			"k":        scroll(ScrollUp),
			"j":        scroll(ScrollDown),
			"pageup":   scroll(ScrollPageUp),
			"pagedown": scroll(ScrollPageDown),
			"g":        scroll(ScrollHome),
			"shift+g":  scroll(ScrollEnd),
			"enter":    exit, "escape": exit,
		},
		ModeLocked: {
			"ctrl+g": exit,
		},
	})
}
