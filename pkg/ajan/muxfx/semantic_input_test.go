// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx"
	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// The expected bytes follow xterm.js 6. The key rows cite the branch of
// evaluateKeyboardEvent (src/common/input/Keyboard.ts) they take, with
// isMac false; "xterm" marks the two additions xterm.js does not have.

var (
	normalModes = vt.Modes{}
	appCursor   = vt.Modes{ApplicationCursorKeys: true}
	appKeypad   = vt.Modes{ApplicationKeypad: true}
)

func key(name, code, text string) muxfx.KeyInput {
	return muxfx.KeyInput{Key: name, Code: code, Text: text}
}

func withMods(k muxfx.KeyInput, mods string) muxfx.KeyInput {
	for _, m := range mods {
		switch m {
		case 's':
			k.Shift = true
		case 'a':
			k.Alt = true
		case 'c':
			k.Ctrl = true
		case 'm':
			k.Meta = true
		}
	}

	return k
}

type keyCase struct {
	name  string
	ref   string
	key   muxfx.KeyInput
	modes vt.Modes
	want  string
}

func printableKeyCases() []keyCase {
	return []keyCase{
		{"letter", "default: ev.key of one character", key("a", "KeyA", "a"), normalModes, "a"},
		{"shift letter", "default: ev.key of one character", withMods(key("A", "KeyA", "A"), "s"), normalModes, "A"},
		{"shift digit", "default: ev.key of one character", withMods(key("!", "Digit1", "!"), "s"), normalModes, "!"},
		{"non-ASCII text", "keypress: the typed character", key("é", "KeyE", "é"), normalModes, "é"},
		{"IME composition", "input event: the composed text", key("Process", "", "日本"), normalModes, "日本"},
		{"space", "keypress: the typed character", key(" ", "Space", " "), normalModes, " "},
		{"modifier alone", "no branch: no character", withMods(key("Shift", "ShiftLeft", ""), "s"), normalModes, ""},
		{"meta letter", "no branch: meta sends nothing", withMods(key("a", "KeyA", "a"), "m"), normalModes, ""},
		{"key without text", "default: ev.key of one character", key("x", "KeyX", ""), normalModes, "x"},
	}
}

func altKeyCases() []keyCase {
	return []keyCase{
		{"alt letter", "default alt: ESC + lower-case letter", withMods(key("a", "KeyA", "a"), "a"), normalModes, "\x1ba"},
		{"alt shift letter", "default alt: ESC + upper-case letter", withMods(key("A", "KeyA", "A"), "sa"), normalModes, "\x1bA"},
		{"alt ctrl letter", "default alt: ESC + control character", withMods(key("a", "KeyA", ""), "ca"), normalModes, "\x1b\x01"},
		{"alt digit", "default alt: KEYCODE_KEY_MAPPINGS unshifted", withMods(key("1", "Digit1", "1"), "a"), normalModes, "\x1b1"},
		{"alt shift digit", "default alt: KEYCODE_KEY_MAPPINGS shifted", withMods(key("!", "Digit1", "!"), "sa"), normalModes, "\x1b!"},
		{"alt punctuation", "default alt: KEYCODE_KEY_MAPPINGS", withMods(key(".", "Period", "."), "a"), normalModes, "\x1b."},
		{"alt space", "default alt: ESC + space", withMods(key(" ", "Space", " "), "a"), normalModes, "\x1b "},
		{"ctrl alt space", "default alt: ESC + NUL", withMods(key(" ", "Space", ""), "ca"), normalModes, "\x1b\x00"},
		{"alt composed letter", "default alt: the letter of the key code", withMods(key("å", "KeyA", "å"), "a"), normalModes, "\x1ba"},
		{"alt dead key", "default alt: Dead with a Key code", withMods(key("Dead", "KeyE", ""), "a"), normalModes, "\x1be"},
		{"alt other layout", "default alt: KEYCODE_KEY_MAPPINGS of the key code", withMods(key("ş", "Semicolon", "ş"), "a"), normalModes, "\x1b;"},
		{"alt meta letter", "no branch: meta sends nothing", withMods(key("a", "KeyA", "a"), "am"), normalModes, ""},
	}
}

func ctrlKeyCases() []keyCase {
	return []keyCase{
		{"ctrl a", "default ctrl: keyCode - 64", withMods(key("a", "KeyA", ""), "c"), normalModes, "\x01"},
		{"ctrl z", "default ctrl: keyCode - 64", withMods(key("z", "KeyZ", ""), "c"), normalModes, "\x1a"},
		{"ctrl caps letter", "default ctrl: keyCode - 64", withMods(key("A", "KeyA", ""), "c"), normalModes, "\x01"},
		{"ctrl other layout", "default ctrl: keyCode of the key code", withMods(key("ф", "KeyA", ""), "c"), normalModes, "\x01"},
		{"ctrl space", "default ctrl: NUL", withMods(key(" ", "Space", ""), "c"), normalModes, "\x00"},
		{"ctrl 3", "default ctrl: 3 to 7 give ESC to US", withMods(key("3", "Digit3", ""), "c"), normalModes, "\x1b"},
		{"ctrl 4", "default ctrl: 3 to 7 give ESC to US", withMods(key("4", "Digit4", ""), "c"), normalModes, "\x1c"},
		{"ctrl 5", "default ctrl: 3 to 7 give ESC to US", withMods(key("5", "Digit5", ""), "c"), normalModes, "\x1d"},
		{"ctrl 6 is ctrl ^", "default ctrl: 3 to 7 give ESC to US", withMods(key("6", "Digit6", ""), "c"), normalModes, "\x1e"},
		{"ctrl 7", "default ctrl: 3 to 7 give ESC to US", withMods(key("7", "Digit7", ""), "c"), normalModes, "\x1f"},
		{"ctrl 8", "default ctrl: DEL", withMods(key("8", "Digit8", ""), "c"), normalModes, "\x7f"},
		{"ctrl [", "default ctrl: keyCode 219 ESC", withMods(key("[", "BracketLeft", ""), "c"), normalModes, "\x1b"},
		{"ctrl \\", "default ctrl: keyCode 220 FS", withMods(key("\\", "Backslash", ""), "c"), normalModes, "\x1c"},
		{"ctrl ]", "default ctrl: keyCode 221 GS", withMods(key("]", "BracketRight", ""), "c"), normalModes, "\x1d"},
		{"ctrl @", "default ctrl key: @ is NUL", withMods(key("@", "Digit2", ""), "sc"), normalModes, "\x00"},
		{"ctrl _", "default ctrl key: _ is US", withMods(key("_", "Minus", ""), "sc"), normalModes, "\x1f"},
		{"ctrl shift ^", "xterm: Ctrl+^ is RS", withMods(key("^", "Digit6", ""), "sc"), normalModes, "\x1e"},
		{"ctrl shift letter", "no branch: sends nothing", withMods(key("A", "KeyA", ""), "sc"), normalModes, ""},
		{"ctrl 1", "default ctrl: no control character", withMods(key("1", "Digit1", ""), "c"), normalModes, ""},
	}
}

func editingKeyCases() []keyCase {
	return []keyCase{
		{"enter", "keyCode 13: CR", key("Enter", "Enter", ""), normalModes, "\r"},
		{"alt enter", "keyCode 13: ESC CR", withMods(key("Enter", "Enter", ""), "a"), normalModes, "\x1b\r"},
		{"shift enter", "keyCode 13: CR", withMods(key("Enter", "Enter", ""), "s"), normalModes, "\r"},
		{"ctrl enter", "keyCode 13: CR", withMods(key("Enter", "Enter", ""), "c"), normalModes, "\r"},
		{"tab", "keyCode 9: HT", key("Tab", "Tab", ""), normalModes, "\t"},
		{"shift tab", "keyCode 9: CSI Z", withMods(key("Tab", "Tab", ""), "s"), normalModes, "\x1b[Z"},
		{"alt tab", "keyCode 9: HT", withMods(key("Tab", "Tab", ""), "a"), normalModes, "\t"},
		{"backspace", "keyCode 8: DEL", key("Backspace", "Backspace", ""), normalModes, "\x7f"},
		{"ctrl backspace", "keyCode 8: BS", withMods(key("Backspace", "Backspace", ""), "c"), normalModes, "\b"},
		{"alt backspace", "keyCode 8: ESC DEL", withMods(key("Backspace", "Backspace", ""), "a"), normalModes, "\x1b\x7f"},
		{"ctrl alt backspace", "keyCode 8: ESC BS", withMods(key("Backspace", "Backspace", ""), "ca"), normalModes, "\x1b\b"},
		{"escape", "keyCode 27: ESC", key("Escape", "Escape", ""), normalModes, "\x1b"},
		{"alt escape", "keyCode 27: ESC ESC", withMods(key("Escape", "Escape", ""), "a"), normalModes, "\x1b\x1b"},
		{"insert", "keyCode 45: CSI 2 ~", key("Insert", "Insert", ""), normalModes, "\x1b[2~"},
		{"shift insert", "keyCode 45: left to paste", withMods(key("Insert", "Insert", ""), "s"), normalModes, ""},
		{"ctrl insert", "keyCode 45: left to copy", withMods(key("Insert", "Insert", ""), "c"), normalModes, ""},
		{"alt insert", "keyCode 45: CSI 2 ~", withMods(key("Insert", "Insert", ""), "a"), normalModes, "\x1b[2~"},
		{"delete", "keyCode 46: CSI 3 ~", key("Delete", "Delete", ""), normalModes, "\x1b[3~"},
		{"shift delete", "keyCode 46: CSI 3 ; m ~", withMods(key("Delete", "Delete", ""), "s"), normalModes, "\x1b[3;2~"},
		{"ctrl alt delete", "keyCode 46: CSI 3 ; m ~", withMods(key("Delete", "Delete", ""), "ca"), normalModes, "\x1b[3;7~"},
		{"page up", "keyCode 33: CSI 5 ~", key("PageUp", "PageUp", ""), normalModes, "\x1b[5~"},
		{"ctrl page up", "keyCode 33: CSI 5 ; m ~", withMods(key("PageUp", "PageUp", ""), "c"), normalModes, "\x1b[5;5~"},
		{"ctrl alt page up", "keyCode 33: CSI 5 ; m ~", withMods(key("PageUp", "PageUp", ""), "ca"), normalModes, "\x1b[5;7~"},
		{"alt page up", "keyCode 33: CSI 5 ~", withMods(key("PageUp", "PageUp", ""), "a"), normalModes, "\x1b[5~"},
		{"shift page up", "keyCode 33: scrolls the viewport", withMods(key("PageUp", "PageUp", ""), "s"), normalModes, ""},
		{"page down", "keyCode 34: CSI 6 ~", key("PageDown", "PageDown", ""), normalModes, "\x1b[6~"},
		{"ctrl page down", "keyCode 34: CSI 6 ; m ~", withMods(key("PageDown", "PageDown", ""), "c"), normalModes, "\x1b[6;5~"},
		{"shift page down", "keyCode 34: scrolls the viewport", withMods(key("PageDown", "PageDown", ""), "cs"), normalModes, ""},
	}
}

func cursorKeyCases() []keyCase {
	return []keyCase{
		{"up", "keyCode 38: CSI A", key("ArrowUp", "ArrowUp", ""), normalModes, "\x1b[A"},
		{"down", "keyCode 40: CSI B", key("ArrowDown", "ArrowDown", ""), normalModes, "\x1b[B"},
		{"right", "keyCode 39: CSI C", key("ArrowRight", "ArrowRight", ""), normalModes, "\x1b[C"},
		{"left", "keyCode 37: CSI D", key("ArrowLeft", "ArrowLeft", ""), normalModes, "\x1b[D"},
		{"app up", "keyCode 38: SS3 A in DECCKM", key("ArrowUp", "ArrowUp", ""), appCursor, "\x1bOA"},
		{"app down", "keyCode 40: SS3 B in DECCKM", key("ArrowDown", "ArrowDown", ""), appCursor, "\x1bOB"},
		{"app right", "keyCode 39: SS3 C in DECCKM", key("ArrowRight", "ArrowRight", ""), appCursor, "\x1bOC"},
		{"app left", "keyCode 37: SS3 D in DECCKM", key("ArrowLeft", "ArrowLeft", ""), appCursor, "\x1bOD"},
		{"shift up", "keyCode 38: CSI 1 ; 2 A", withMods(key("ArrowUp", "ArrowUp", ""), "s"), normalModes, "\x1b[1;2A"},
		{"ctrl up", "keyCode 38: CSI 1 ; 5 A", withMods(key("ArrowUp", "ArrowUp", ""), "c"), normalModes, "\x1b[1;5A"},
		{"app ctrl up", "keyCode 38: modifiers win over DECCKM", withMods(key("ArrowUp", "ArrowUp", ""), "c"), appCursor, "\x1b[1;5A"},
		{"alt up", "keyCode 38: Alt as Ctrl off macOS", withMods(key("ArrowUp", "ArrowUp", ""), "a"), normalModes, "\x1b[1;5A"},
		{"alt down", "keyCode 40: Alt as Ctrl off macOS", withMods(key("ArrowDown", "ArrowDown", ""), "a"), normalModes, "\x1b[1;5B"},
		{"alt right", "keyCode 39: Alt as Ctrl off macOS", withMods(key("ArrowRight", "ArrowRight", ""), "a"), normalModes, "\x1b[1;5C"},
		{"alt left", "keyCode 37: Alt as Ctrl off macOS", withMods(key("ArrowLeft", "ArrowLeft", ""), "a"), normalModes, "\x1b[1;5D"},
		{"shift alt right", "keyCode 39: CSI 1 ; 4 C", withMods(key("ArrowRight", "ArrowRight", ""), "sa"), normalModes, "\x1b[1;4C"},
		{"ctrl shift left", "keyCode 37: CSI 1 ; 6 D", withMods(key("ArrowLeft", "ArrowLeft", ""), "sc"), normalModes, "\x1b[1;6D"},
		{"ctrl alt down", "keyCode 40: CSI 1 ; 7 B", withMods(key("ArrowDown", "ArrowDown", ""), "ca"), normalModes, "\x1b[1;7B"},
		{"meta up", "keyCode 38: meta sends nothing", withMods(key("ArrowUp", "ArrowUp", ""), "m"), normalModes, ""},
		{"home", "keyCode 36: CSI H", key("Home", "Home", ""), normalModes, "\x1b[H"},
		{"end", "keyCode 35: CSI F", key("End", "End", ""), normalModes, "\x1b[F"},
		{"app home", "keyCode 36: SS3 H in DECCKM", key("Home", "Home", ""), appCursor, "\x1bOH"},
		{"app end", "keyCode 35: SS3 F in DECCKM", key("End", "End", ""), appCursor, "\x1bOF"},
		{"shift home", "keyCode 36: CSI 1 ; 2 H", withMods(key("Home", "Home", ""), "s"), normalModes, "\x1b[1;2H"},
		{"alt home", "keyCode 36: CSI 1 ; 3 H", withMods(key("Home", "Home", ""), "a"), normalModes, "\x1b[1;3H"},
		{"ctrl end", "keyCode 35: CSI 1 ; 5 F", withMods(key("End", "End", ""), "c"), appCursor, "\x1b[1;5F"},
		{"meta end", "keyCode 35: CSI 1 ; 9 F", withMods(key("End", "End", ""), "m"), normalModes, "\x1b[1;9F"},
	}
}

func functionKeyCases() []keyCase {
	return []keyCase{
		{"F1", "keyCode 112: SS3 P", key("F1", "F1", ""), normalModes, "\x1bOP"},
		{"F2", "keyCode 113: SS3 Q", key("F2", "F2", ""), normalModes, "\x1bOQ"},
		{"F3", "keyCode 114: SS3 R", key("F3", "F3", ""), normalModes, "\x1bOR"},
		{"F4", "keyCode 115: SS3 S", key("F4", "F4", ""), normalModes, "\x1bOS"},
		{"shift F1", "keyCode 112: CSI 1 ; 2 P", withMods(key("F1", "F1", ""), "s"), normalModes, "\x1b[1;2P"},
		{"alt F2", "keyCode 113: CSI 1 ; 3 Q", withMods(key("F2", "F2", ""), "a"), normalModes, "\x1b[1;3Q"},
		{"ctrl F3", "keyCode 114: CSI 1 ; 5 R", withMods(key("F3", "F3", ""), "c"), normalModes, "\x1b[1;5R"},
		{"ctrl shift F4", "keyCode 115: CSI 1 ; 6 S", withMods(key("F4", "F4", ""), "sc"), normalModes, "\x1b[1;6S"},
		{"F5", "keyCode 116: CSI 15 ~", key("F5", "F5", ""), normalModes, "\x1b[15~"},
		{"F6", "keyCode 117: CSI 17 ~", key("F6", "F6", ""), normalModes, "\x1b[17~"},
		{"F7", "keyCode 118: CSI 18 ~", key("F7", "F7", ""), normalModes, "\x1b[18~"},
		{"F8", "keyCode 119: CSI 19 ~", key("F8", "F8", ""), normalModes, "\x1b[19~"},
		{"F9", "keyCode 120: CSI 20 ~", key("F9", "F9", ""), normalModes, "\x1b[20~"},
		{"F10", "keyCode 121: CSI 21 ~", key("F10", "F10", ""), normalModes, "\x1b[21~"},
		{"F11", "keyCode 122: CSI 23 ~", key("F11", "F11", ""), normalModes, "\x1b[23~"},
		{"F12", "keyCode 123: CSI 24 ~", key("F12", "F12", ""), normalModes, "\x1b[24~"},
		{"shift F5", "keyCode 116: CSI 15 ; 2 ~", withMods(key("F5", "F5", ""), "s"), normalModes, "\x1b[15;2~"},
		{"ctrl F10", "keyCode 121: CSI 21 ; 5 ~", withMods(key("F10", "F10", ""), "c"), normalModes, "\x1b[21;5~"},
		{"ctrl alt F12", "keyCode 123: CSI 24 ; 7 ~", withMods(key("F12", "F12", ""), "ca"), normalModes, "\x1b[24;7~"},
		{"app cursor F1", "keyCode 112: DECCKM does not apply", key("F1", "F1", ""), appCursor, "\x1bOP"},
	}
}

func keypadKeyCases() []keyCase {
	return []keyCase{
		{"keypad 0", "xterm: DECKPAM SS3 p", key("0", "Numpad0", "0"), appKeypad, "\x1bOp"},
		{"keypad 5", "xterm: DECKPAM SS3 u", key("5", "Numpad5", "5"), appKeypad, "\x1bOu"},
		{"keypad 9", "xterm: DECKPAM SS3 y", key("9", "Numpad9", "9"), appKeypad, "\x1bOy"},
		{"keypad decimal", "xterm: DECKPAM SS3 n", key(".", "NumpadDecimal", "."), appKeypad, "\x1bOn"},
		{"keypad enter", "xterm: DECKPAM SS3 M", key("Enter", "NumpadEnter", ""), appKeypad, "\x1bOM"},
		{"keypad add", "xterm: DECKPAM SS3 k", key("+", "NumpadAdd", "+"), appKeypad, "\x1bOk"},
		{"keypad subtract", "xterm: DECKPAM SS3 m", key("-", "NumpadSubtract", "-"), appKeypad, "\x1bOm"},
		{"keypad multiply", "xterm: DECKPAM SS3 j", key("*", "NumpadMultiply", "*"), appKeypad, "\x1bOj"},
		{"keypad divide", "xterm: DECKPAM SS3 o", key("/", "NumpadDivide", "/"), appKeypad, "\x1bOo"},
		{"keypad equal", "xterm: DECKPAM SS3 X", key("=", "NumpadEqual", "="), appKeypad, "\x1bOX"},
		{"keypad comma", "xterm: DECKPAM SS3 l", key(",", "NumpadComma", ","), appKeypad, "\x1bOl"},
		{"numeric keypad 5", "default: ev.key of one character", key("5", "Numpad5", "5"), normalModes, "5"},
		{"numeric keypad enter", "keyCode 13: CR", key("Enter", "NumpadEnter", ""), normalModes, "\r"},
		{"keypad without NumLock", "keyCode 38: CSI A", key("ArrowUp", "Numpad8", ""), appKeypad, "\x1b[A"},
		{"modified keypad key", "default: ctrl sends nothing for a digit", withMods(key("1", "Numpad1", ""), "c"), appKeypad, ""},
	}
}

func TestEncodeKey(t *testing.T) {
	t.Parallel()

	groups := map[string][]keyCase{
		"printable": printableKeyCases(),
		"alt":       altKeyCases(),
		"ctrl":      ctrlKeyCases(),
		"editing":   editingKeyCases(),
		"cursor":    cursorKeyCases(),
		"function":  functionKeyCases(),
		"keypad":    keypadKeyCases(),
	}

	for group, cases := range groups {
		for _, tc := range cases {
			t.Run(group+"/"+tc.name, func(t *testing.T) {
				t.Parallel()

				got := string(muxfx.EncodeKey(&tc.key, tc.modes))
				if got != tc.want {
					t.Errorf("EncodeKey(%+v) = %q, want %q (%s)", tc.key, got, tc.want, tc.ref)
				}
			})
		}
	}
}

func TestEncodePaste(t *testing.T) {
	t.Parallel()

	bracketed := vt.Modes{BracketedPaste: true}

	cases := []struct {
		name  string
		ref   string
		text  string
		modes vt.Modes
		want  string
	}{
		{"plain text", "paste: sent as typed", "hello", normalModes, "hello"},
		{"line breaks become CR", "prepareTextForTerminal: \\r?\\n to \\r", "a\nb\r\nc", normalModes, "a\rb\rc"},
		{"ESC kept without bracketing", "paste: sent as typed", "a\x1b[201~b", normalModes, "a\x1b[201~b"},
		{"empty paste", "nothing to send", "", bracketed, ""},
		{"bracketed", "bracketTextForPaste: ESC [200~ and ESC [201~", "hi", bracketed, "\x1b[200~hi\x1b[201~"},
		{
			"an end marker inside cannot end the paste", "bracketed paste drops ESC",
			"a\x1b[201~rm -rf ~\n", bracketed, "\x1b[200~a[201~rm -rf ~\r\x1b[201~",
		},
		{
			"other controls are dropped", "bracketed paste keeps tab and CR only",
			"a\tb\x00c\x03d\x07e\x7ff\u009b1;2Hg\u0085h", bracketed, "\x1b[200~a\tbcdef1;2Hgh\x1b[201~",
		},
		{"line breaks stay as CR", "prepareTextForTerminal", "1\n2\r\n3\r4", bracketed, "\x1b[200~1\r2\r3\r4\x1b[201~"},
		{"unicode stays", "bracketTextForPaste", "çağ 日本 🙂", bracketed, "\x1b[200~çağ 日本 🙂\x1b[201~"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := string(muxfx.EncodePaste(tc.text, tc.modes))
			if got != tc.want {
				t.Errorf("EncodePaste(%q) = %q, want %q (%s)", tc.text, got, tc.want, tc.ref)
			}
		})
	}
}

func TestEncodeFocus(t *testing.T) {
	t.Parallel()

	sendFocus := vt.Modes{SendFocus: true}

	cases := []struct {
		name    string
		focused bool
		modes   vt.Modes
		want    string
	}{
		{"focus in without 1004", true, normalModes, ""},
		{"focus out without 1004", false, normalModes, ""},
		{"focus in with 1004", true, sendFocus, "\x1b[I"},
		{"focus out with 1004", false, sendFocus, "\x1b[O"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := string(muxfx.EncodeFocus(tc.focused, tc.modes)); got != tc.want {
				t.Errorf("EncodeFocus(%v) = %q, want %q", tc.focused, got, tc.want)
			}
		})
	}
}

func TestEncodeMouseRejects(t *testing.T) {
	t.Parallel()

	anySGR := vt.Modes{MouseProtocol: vt.MouseAny, MouseEncoding: vt.MouseEncodingSGR}

	cases := []struct {
		name  string
		ev    muxfx.MouseInput
		modes vt.Modes
	}{
		{"no mouse protocol", muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft}, normalModes},
		{"negative column", muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Col: -1}, anySGR},
		{"negative row", muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: -1}, anySGR},
		{"press without a button", muxfx.MouseInput{Kind: muxfx.MouseKindPress}, anySGR},
		{"release without a button", muxfx.MouseInput{Kind: muxfx.MouseKindRelease}, anySGR},
		{"wheel without a direction", muxfx.MouseInput{Kind: muxfx.MouseKindWheel}, anySGR},
		{"unknown kind", muxfx.MouseInput{Kind: "hover", Button: muxfx.MouseButtonLeft}, anySGR},
		{"unknown button", muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: "back"}, anySGR},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := muxfx.EncodeMouse(&tc.ev, tc.modes); got != nil {
				t.Errorf("EncodeMouse(%+v) = %q, want nothing", tc.ev, got)
			}
		})
	}
}

// allMouseMods holds every modifier a mouse report carries; meta is not
// one of them.
var allMouseMods = muxfx.Modifiers{Shift: true, Alt: true, Ctrl: true}

// TestEncodeMouse replays reports recorded from @xterm/headless 6.0.0: each
// row is the protocol and encoding a program set (DECSET 9, 1000, 1002,
// 1003 with 1006 or 1016), an event, and what CoreMouseService's
// triggerMouseEvent sent for it on a 300x300 terminal, with the pixel
// position x 37, y 91. An empty report is an event the protocol does not
// send. The last rows are the 223-cell limit of the default encoding.
// etc/temp/muxfx-vt/record-mouse-reports.mjs, outside the tracked files,
// records them.
func TestEncodeMouse(t *testing.T) {
	t.Parallel()

	cases := []struct {
		protocol vt.MouseProtocol
		encoding vt.MouseEncoding
		ev       muxfx.MouseInput
		want     string
	}{
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M %#"},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M %#"},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M!%#"},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M!%#"},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M\"%#"},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M\"%#"},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<0;5;3M"},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<0;5;3M"},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<1;5;3M"},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<1;5;3M"},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<2;5;3M"},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<2;5;3M"},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<0;37;91M"},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<0;37;91M"},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<1;37;91M"},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<1;37;91M"},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<2;37;91M"},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<2;37;91M"},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseX10, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M %#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M<%#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M!%#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M=%#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M\"%#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M>%#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M#%#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M?%#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M#%#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M?%#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M`%#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M|%#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[Ma%#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M}%#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[Mb%#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M~%#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[Mc%#"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M\x7f%#"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<0;5;3M"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<28;5;3M"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<1;5;3M"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<29;5;3M"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<2;5;3M"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<30;5;3M"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<0;5;3m"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<28;5;3m"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<2;5;3m"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<30;5;3m"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<64;5;3M"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<92;5;3M"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<65;5;3M"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<93;5;3M"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<66;5;3M"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<94;5;3M"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<67;5;3M"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<95;5;3M"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<0;37;91M"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<28;37;91M"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<1;37;91M"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<29;37;91M"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<2;37;91M"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<30;37;91M"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<0;37;91m"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<28;37;91m"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<2;37;91m"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<30;37;91m"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<64;37;91M"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<92;37;91M"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<65;37;91M"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<93;37;91M"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<66;37;91M"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<94;37;91M"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<67;37;91M"},
		{vt.MouseVT200, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<95;37;91M"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M %#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M<%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M!%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M=%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M\"%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M>%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M#%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M?%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M#%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M?%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M@%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M\\%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M`%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M|%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[Ma%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M}%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[Mb%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M~%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[Mc%#"},
		{vt.MouseDrag, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M\x7f%#"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<0;5;3M"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<28;5;3M"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<1;5;3M"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<29;5;3M"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<2;5;3M"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<30;5;3M"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<0;5;3m"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<28;5;3m"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<2;5;3m"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<30;5;3m"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<32;5;3M"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<60;5;3M"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<64;5;3M"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<92;5;3M"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<65;5;3M"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<93;5;3M"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<66;5;3M"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<94;5;3M"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<67;5;3M"},
		{vt.MouseDrag, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<95;5;3M"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<0;37;91M"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<28;37;91M"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<1;37;91M"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<29;37;91M"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<2;37;91M"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<30;37;91M"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<0;37;91m"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<28;37;91m"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<2;37;91m"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<30;37;91m"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<32;37;91M"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<60;37;91M"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91}, ""},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, ""},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<64;37;91M"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<92;37;91M"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<65;37;91M"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<93;37;91M"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<66;37;91M"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<94;37;91M"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<67;37;91M"},
		{vt.MouseDrag, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<95;37;91M"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M %#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M<%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M!%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M=%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M\"%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M>%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M#%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M?%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M#%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M?%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M@%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M\\%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[MC%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M_%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[M`%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M|%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[Ma%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M}%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[Mb%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M~%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[Mc%#"},
		{vt.MouseAny, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[M\x7f%#"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<0;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<28;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<1;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<29;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<2;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<30;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<0;5;3m"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<28;5;3m"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<2;5;3m"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<30;5;3m"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<32;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<60;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<35;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<63;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<64;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<92;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<65;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<93;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<66;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<94;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<67;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<95;5;3M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<0;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<28;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<1;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonMiddle, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<29;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<2;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<30;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<0;37;91m"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<28;37;91m"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<2;37;91m"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindRelease, Button: muxfx.MouseButtonRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<30;37;91m"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<32;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Button: muxfx.MouseButtonLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<60;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<35;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindMove, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<63;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<64;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<92;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<65;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<93;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<66;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelLeft, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<94;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91}, "\x1b[<67;37;91M"},
		{vt.MouseAny, vt.MouseEncodingSGRPixels, muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelRight, Row: 2, Col: 4, X: 37, Y: 91, Modifiers: allMouseMods}, "\x1b[<95;37;91M"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 0, Col: 222, X: 37, Y: 91}, "\x1b[M \xff!"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 0, Col: 222, X: 37, Y: 91}, "\x1b[<0;223;1M"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 0, Col: 223, X: 37, Y: 91}, ""},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 0, Col: 223, X: 37, Y: 91}, "\x1b[<0;224;1M"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 222, Col: 0, X: 37, Y: 91}, "\x1b[M !\xff"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 222, Col: 0, X: 37, Y: 91}, "\x1b[<0;1;223M"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 223, Col: 0, X: 37, Y: 91}, ""},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 223, Col: 0, X: 37, Y: 91}, "\x1b[<0;1;224M"},
		{vt.MouseVT200, vt.MouseEncodingDefault, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 222, Col: 222, X: 37, Y: 91}, "\x1b[M \xff\xff"},
		{vt.MouseVT200, vt.MouseEncodingSGR, muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 222, Col: 222, X: 37, Y: 91}, "\x1b[<0;223;223M"},
	}

	for _, tc := range cases {
		modes := vt.Modes{MouseProtocol: tc.protocol, MouseEncoding: tc.encoding}

		if got := string(muxfx.EncodeMouse(&tc.ev, modes)); got != tc.want {
			t.Errorf("EncodeMouse(%+v) with protocol %d, encoding %d = %q, want %q",
				tc.ev, tc.protocol, tc.encoding, got, tc.want)
		}
	}
}
