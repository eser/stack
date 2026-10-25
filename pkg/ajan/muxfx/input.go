// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"strconv"
	"strings"
	"unicode/utf8"
)

// MouseEventType is what a mouse event reports.
type MouseEventType string

const (
	// MouseDown is a button press.
	MouseDown MouseEventType = "mousedown"
	// MouseUp is a button release.
	MouseUp MouseEventType = "mouseup"
	// MouseMove is motion with a button held.
	MouseMove MouseEventType = "mousemove"
	// MouseWheel is a wheel step.
	MouseWheel MouseEventType = "wheel"
)

// MouseEvent is one decoded SGR mouse report. X and Y are 0-based.
type MouseEvent struct {
	Type   MouseEventType
	Button int
	X      int
	Y      int
	Shift  bool
	Ctrl   bool
	// WheelDown is set for a wheel step down (false is up).
	WheelDown bool
}

// InputEvent is a key or a mouse event decoded from terminal input.
type InputEvent struct {
	Key   *KeyEvent
	Mouse *MouseEvent
}

// DecodeInput splits raw terminal input into key and mouse events. An escape
// sequence is expected to arrive whole in one read, as terminals send them.
func DecodeInput(raw []byte) []InputEvent {
	var events []InputEvent

	for len(raw) > 0 {
		ev, n := decodeOne(raw)
		events = append(events, ev)
		raw = raw[n:]
	}

	return events
}

func keyEvent(name string, raw []byte) InputEvent {
	return InputEvent{Key: &KeyEvent{Name: name, Raw: raw}}
}

func decodeOne(raw []byte) (InputEvent, int) {
	b := raw[0]

	switch {
	case b == 0x1b:
		return decodeEscape(raw)
	case b == 0x03:
		return InputEvent{Key: &KeyEvent{Name: "c", Ctrl: true, Raw: raw[:1]}}, 1
	case b == 0x0d || b == 0x0a:
		return keyEvent("enter", raw[:1]), 1
	case b == 0x09:
		return keyEvent("tab", raw[:1]), 1
	case b == 0x7f:
		return keyEvent("backspace", raw[:1]), 1
	case b >= 0x01 && b <= 0x1a:
		return InputEvent{Key: &KeyEvent{Name: string(rune(b + 0x60)), Ctrl: true, Raw: raw[:1]}}, 1
	case b == 0x20:
		return keyEvent("space", raw[:1]), 1
	case b >= 0x21 && b <= 0x7e:
		return keyEvent(string(rune(b)), raw[:1]), 1
	case b >= 0xc0:
		r, size := utf8.DecodeRune(raw)
		if r == utf8.RuneError {
			return keyEvent("unknown", raw[:1]), 1
		}

		return keyEvent(string(r), raw[:size]), size
	default:
		return keyEvent("unknown", raw[:1]), 1
	}
}

func decodeEscape(raw []byte) (InputEvent, int) {
	if len(raw) == 1 {
		return keyEvent("escape", raw), 1
	}

	switch raw[1] {
	case '[':
		if ev, n, ok := decodeCSI(raw); ok {
			return ev, n
		}
	case 'O':
		if len(raw) >= 3 {
			if name, ok := csiKeyName(raw[2]); ok {
				return keyEvent(name, raw[:3]), 3
			}
		}
	case 0x1b:
		return keyEvent("escape", raw[:1]), 1
	}

	// ESC followed by a key is that key with alt held.
	inner, n := decodeOne(raw[1:])
	if inner.Key != nil {
		inner.Key.Meta = true
		inner.Key.Raw = raw[:n+1]

		return inner, n + 1
	}

	return keyEvent("escape", raw[:1]), 1
}

func csiKeyName(final byte) (string, bool) {
	switch final {
	case 'A':
		return "up", true
	case 'B':
		return "down", true
	case 'C':
		return "right", true
	case 'D':
		return "left", true
	case 'H':
		return "home", true
	case 'F':
		return "end", true
	default:
		return "", false
	}
}

func tildeKeyName(code int) (string, bool) {
	switch code {
	case 2:
		return "insert", true
	case 3:
		return "delete", true
	case 5:
		return "pageup", true
	case 6:
		return "pagedown", true
	default:
		return "", false
	}
}

// decodeCSI reads ESC [ ... final: an SGR mouse report, a cursor or editing
// key, optionally with a modifier parameter.
func decodeCSI(raw []byte) (InputEvent, int, bool) {
	end := 2
	for end < len(raw) && raw[end] >= 0x20 && raw[end] <= 0x3f {
		end++
	}

	if end >= len(raw) || raw[end] < 0x40 || raw[end] > 0x7e {
		return InputEvent{}, 0, false
	}

	body := string(raw[2:end])
	final := raw[end]
	seq := raw[:end+1]

	if strings.HasPrefix(body, "<") && (final == 'M' || final == 'm') {
		mouse, ok := parseSGRMouse(body[1:], final == 'm')
		if !ok {
			return keyEvent("unknown", seq), end + 1, true
		}

		return InputEvent{Mouse: &mouse}, end + 1, true
	}

	fields := strings.Split(body, ";")
	modifier := 0

	if len(fields) >= 2 {
		modifier, _ = strconv.Atoi(fields[1])
	}

	name, ok := csiKeyName(final)
	if final == '~' {
		code, _ := strconv.Atoi(fields[0])
		name, ok = tildeKeyName(code)
	}

	if final == 'Z' {
		return InputEvent{Key: &KeyEvent{Name: "tab", Shift: true, Raw: seq}}, end + 1, true
	}

	if !ok {
		// A whole sequence this decoder has no name for (a bracketed paste
		// marker, a function key) stays one event, so it reaches the pane
		// intact.
		return keyEvent("unknown", seq), end + 1, true
	}

	key := &KeyEvent{Name: name, Raw: seq}
	if modifier > 1 {
		bits := modifier - 1
		key.Shift = bits&1 != 0
		key.Meta = bits&2 != 0
		key.Ctrl = bits&4 != 0
	}

	return InputEvent{Key: key}, end + 1, true
}

func parseSGRMouse(body string, release bool) (MouseEvent, bool) {
	parts := strings.Split(body, ";")
	if len(parts) != 3 {
		return MouseEvent{}, false
	}

	code, errCode := strconv.Atoi(parts[0])
	x, errX := strconv.Atoi(parts[1])
	y, errY := strconv.Atoi(parts[2])

	if errCode != nil || errX != nil || errY != nil {
		return MouseEvent{}, false
	}

	ev := MouseEvent{
		Button: code & 3,
		X:      x - 1,
		Y:      y - 1,
		Shift:  code&4 != 0,
		Ctrl:   code&16 != 0,
	}

	switch {
	case code&64 != 0:
		ev.Type = MouseWheel
		ev.Button = 0
		ev.WheelDown = code&1 != 0
	case code&32 != 0:
		ev.Type = MouseMove
	case release:
		ev.Type = MouseUp
	default:
		ev.Type = MouseDown
	}

	return ev, true
}

// KeyToMessages maps a key to frontend messages. A bound chord sends its
// actions; an unbound key in normal or locked mode goes to the focused pane
// as its raw bytes; in a command mode an unbound key is dropped.
func KeyToMessages(key *KeyEvent, mode InputMode, keymap Keymap) []FrontendToServer {
	if actions, ok := Lookup(keymap, mode, ParseChord(key)); ok {
		msgs := make([]FrontendToServer, 0, len(actions))
		for i := range actions {
			action := actions[i]
			msgs = append(msgs, FrontendToServer{T: MessageAction, Action: &action})
		}

		return msgs
	}

	if mode == ModeNormal || mode == ModeLocked {
		return []FrontendToServer{{T: MessageAction, Action: &Action{Type: ActionWriteInput, Data: string(key.Raw)}}}
	}

	return nil
}

// MouseToMessages maps a mouse event to frontend messages: a press inside a
// pane focuses it. The pane test keeps the TypeScript frontend's arithmetic,
// which compares the 0-based event position with the 1-based box origin.
func MouseToMessages(ev *MouseEvent, scene *Scene) []FrontendToServer {
	if scene == nil || ev.Type != MouseDown {
		return nil
	}

	for _, pane := range scene.Panes {
		x0 := pane.Geom.X + 1
		y0 := pane.Geom.Y + 1

		if ev.X >= x0 && ev.X < x0+pane.Geom.Width && ev.Y >= y0 && ev.Y < y0+pane.Geom.Height {
			return []FrontendToServer{{T: MessageAction, Action: &Action{Type: ActionFocusPane, Pane: pane.ID}}}
		}
	}

	return nil
}
