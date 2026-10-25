// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// A frontend that paints screens instead of parsing pane output (ADR 0006)
// sends what the user did: a key, a paste, a mouse event or a focus change.
// The functions here turn each one into the bytes a program in the pane
// expects, given the pane's terminal modes. They follow xterm.js 6, the
// emulator the browser dashboard used: Keyboard.ts (evaluateKeyboardEvent)
// for keys, Clipboard.ts for pastes, CoreMouseService.ts for mouse reports
// and the focus handler of its Terminal for focus reports. Where xterm.js
// sends nothing the encoders return nil; where they go further than
// xterm.js, the doc comment says so.

// Modifiers are the modifier keys held during a key or mouse event, as a
// browser's KeyboardEvent and MouseEvent report them (shiftKey, altKey,
// ctrlKey, metaKey).
type Modifiers struct {
	Shift bool `json:"shift,omitempty"`
	Alt   bool `json:"alt,omitempty"`
	Ctrl  bool `json:"ctrl,omitempty"`
	Meta  bool `json:"meta,omitempty"`
}

// param is the modifier parameter of an xterm key sequence (CSI 1 ; m X):
// one plus shift 1, alt 2, ctrl 4 and meta 8.
func (m Modifiers) param() int {
	bits := 0

	if m.Shift {
		bits |= 1
	}

	if m.Alt {
		bits |= 2
	}

	if m.Ctrl {
		bits |= 4
	}

	if m.Meta {
		bits |= 8
	}

	return bits + 1
}

func (m Modifiers) none() bool {
	return !m.Shift && !m.Alt && !m.Ctrl && !m.Meta
}

// KeyInput is a key press. Key and Code are a browser KeyboardEvent's key
// and code ("ArrowUp", "KeyA"); Text is the text the key produces on the
// user's layout, empty for keys that produce none.
//
// Alt means meta: Alt with a letter sends ESC and the letter, as xterm.js
// does off macOS. A frontend that lets AltGr or the macOS Option key compose
// characters sends the composed text with alt and ctrl cleared.
type KeyInput struct {
	Key  string `json:"key"`
	Code string `json:"code,omitempty"`
	Text string `json:"text,omitempty"`
	Modifiers
}

// MouseKind is what a mouse event reports. The empty kind is unknown and
// sends nothing.
type MouseKind string

const (
	// MouseKindPress is a button press.
	MouseKindPress MouseKind = "press"
	// MouseKindRelease is a button release.
	MouseKindRelease MouseKind = "release"
	// MouseKindMove is pointer motion, with Button held or none.
	MouseKindMove MouseKind = "move"
	// MouseKindWheel is one wheel step in the direction of Wheel.
	MouseKindWheel MouseKind = "wheel"
)

// MouseButton names a mouse button. The empty button is none, which only a
// move may report.
type MouseButton string

const (
	// MouseButtonNone is no button.
	MouseButtonNone MouseButton = ""
	// MouseButtonLeft is the primary button.
	MouseButtonLeft MouseButton = "left"
	// MouseButtonMiddle is the middle button.
	MouseButtonMiddle MouseButton = "middle"
	// MouseButtonRight is the secondary button.
	MouseButtonRight MouseButton = "right"
)

// WheelDirection is the direction of a wheel step. The empty direction is
// unknown and sends nothing.
type WheelDirection string

const (
	// WheelUp scrolls up.
	WheelUp WheelDirection = "up"
	// WheelDown scrolls down.
	WheelDown WheelDirection = "down"
	// WheelLeft scrolls left.
	WheelLeft WheelDirection = "left"
	// WheelRight scrolls right.
	WheelRight WheelDirection = "right"
)

// MouseInput is a mouse event inside a pane. Row and Col are the 0-based
// cell inside the pane's content. X and Y are the 0-based pixel offset
// inside the pane's content, which only the SGR-pixels encoding (DECSET
// 1016) reports; a frontend that cannot measure pixels leaves them zero.
type MouseInput struct {
	Kind   MouseKind      `json:"kind"`
	Button MouseButton    `json:"button,omitempty"`
	Wheel  WheelDirection `json:"wheel,omitempty"`
	Row    int            `json:"row"`
	Col    int            `json:"col"`
	X      int            `json:"x,omitempty"`
	Y      int            `json:"y,omitempty"`
	Modifiers
}

// PasteInput is text the user pasted.
type PasteInput struct {
	Text string `json:"text"`
}

// FocusInput reports that the pane gained (Focused) or lost focus.
type FocusInput struct {
	Focused bool `json:"focused"`
}

const (
	esc = "\x1b"
	csi = esc + "["
	ss3 = esc + "O"
)

// EncodeKey returns the bytes a key press sends to a pane in the given
// modes, or nil when it sends nothing. Cursor keys follow DECCKM
// (ApplicationCursorKeys) and keypad keys DECKPAM (ApplicationKeypad).
//
// The rules are those of xterm.js's evaluateKeyboardEvent with macOS
// handling off, plus two additions: the keypad sends its SS3 sequences in
// application keypad mode, as xterm does (xterm.js leaves the keypad in
// numeric mode), and Ctrl+Shift+6 sends RS for Ctrl+^ next to the Ctrl+@
// and Ctrl+_ xterm.js already maps.
func EncodeKey(key *KeyInput, modes vt.Modes) []byte {
	if seq, ok := applicationKeypadKey(key, modes); ok {
		return []byte(seq)
	}

	if seq, ok := namedKey(key, modes.ApplicationCursorKeys); ok {
		if seq == "" {
			return nil
		}

		return []byte(seq)
	}

	return characterKey(key)
}

// applicationKeypadKey is the SS3 sequence of an unmodified keypad key in
// application keypad mode (xterm ctlseqs, "VT100 keypad application mode").
// With NumLock off the keypad reports navigation keys, which namedKey
// handles.
func applicationKeypadKey(key *KeyInput, modes vt.Modes) (string, bool) {
	if !modes.ApplicationKeypad || !key.none() || !strings.HasPrefix(key.Code, "Numpad") {
		return "", false
	}

	if key.Key != "Enter" && utf8.RuneCountInString(key.Key) != 1 {
		return "", false
	}

	name := strings.TrimPrefix(key.Code, "Numpad")
	if len(name) == 1 && name[0] >= '0' && name[0] <= '9' {
		return ss3 + string(rune('p'+name[0]-'0')), true
	}

	finals := map[string]string{
		"Decimal":  "n",
		"Enter":    "M",
		"Add":      "k",
		"Subtract": "m",
		"Multiply": "j",
		"Divide":   "o",
		"Equal":    "X",
		"Comma":    "l",
	}

	if final, ok := finals[name]; ok {
		return ss3 + final, true
	}

	return "", false
}

// cursorFinal is the final byte of the four arrows, Home and End.
func cursorFinal(key string) (byte, bool) {
	switch key {
	case "ArrowUp":
		return 'A', true
	case "ArrowDown":
		return 'B', true
	case "ArrowRight":
		return 'C', true
	case "ArrowLeft":
		return 'D', true
	case "Home":
		return 'H', true
	case "End":
		return 'F', true
	default:
		return 0, false
	}
}

// functionKeyCodes are the CSI n ~ codes of F5 to F12.
func functionKeyCode(key string) (int, bool) {
	switch key {
	case "F5":
		return 15, true
	case "F6":
		return 17, true
	case "F7":
		return 18, true
	case "F8":
		return 19, true
	case "F9":
		return 20, true
	case "F10":
		return 21, true
	case "F11":
		return 23, true
	case "F12":
		return 24, true
	default:
		return 0, false
	}
}

// namedKey encodes the keys xterm.js matches by key code before it looks at
// the character: editing, cursor and function keys. ok reports that the key
// is one of them; an empty sequence then means it sends nothing.
func namedKey(key *KeyInput, applicationCursor bool) (string, bool) {
	mods := key.Modifiers

	switch key.Key {
	case "Backspace":
		seq := "\x7f"
		if mods.Ctrl {
			seq = "\b"
		}

		if mods.Alt {
			seq = esc + seq
		}

		return seq, true
	case "Tab":
		if mods.Shift {
			return csi + "Z", true
		}

		return "\t", true
	case "Enter":
		if mods.Alt {
			return esc + "\r", true
		}

		return "\r", true
	case "Escape":
		if mods.Alt {
			return esc + esc, true
		}

		return esc, true
	case "Insert":
		// Shift+Insert and Ctrl+Insert are paste and copy on some systems.
		if mods.Shift || mods.Ctrl {
			return "", true
		}

		return csi + "2~", true
	case "Delete":
		return tildeKey(3, mods), true
	case "PageUp", "PageDown":
		// Shift scrolls the frontend's own history instead.
		if mods.Shift {
			return "", true
		}

		code := 5
		if key.Key == "PageDown" {
			code = 6
		}

		if mods.Ctrl {
			return csi + strconv.Itoa(code) + ";" + strconv.Itoa(mods.param()) + "~", true
		}

		return csi + strconv.Itoa(code) + "~", true
	case "F1", "F2", "F3", "F4":
		final := "PQRS"[key.Key[1]-'1']
		if !mods.none() {
			return csi + "1;" + strconv.Itoa(mods.param()) + string(final), true
		}

		return ss3 + string(final), true
	}

	if code, ok := functionKeyCode(key.Key); ok {
		return tildeKey(code, mods), true
	}

	if final, ok := cursorFinal(key.Key); ok {
		return cursorKey(final, mods, applicationCursor), true
	}

	return "", false
}

func tildeKey(code int, mods Modifiers) string {
	if mods.none() {
		return csi + strconv.Itoa(code) + "~"
	}

	return csi + strconv.Itoa(code) + ";" + strconv.Itoa(mods.param()) + "~"
}

// cursorKey encodes an arrow, Home or End. Meta with an arrow sends
// nothing, and Alt alone on an arrow sends the Ctrl sequence so it moves by
// word, as xterm.js does off macOS.
func cursorKey(final byte, mods Modifiers, applicationCursor bool) string {
	arrow := final != 'H' && final != 'F'

	if arrow && mods.Meta {
		return ""
	}

	if !mods.none() {
		param := mods.param()
		if arrow && param == 3 {
			param = 5
		}

		return csi + "1;" + strconv.Itoa(param) + string(final)
	}

	if applicationCursor {
		return ss3 + string(final)
	}

	return csi + string(final)
}

// asciiLetter is the lower-case letter a key stands for: its key when that
// is an ASCII letter, else the letter of its physical code ("KeyA"), as
// xterm.js's key codes give for other layouts and composed keys.
func asciiLetter(key *KeyInput) (byte, bool) {
	if len(key.Key) == 1 {
		c := key.Key[0] | 0x20
		if c >= 'a' && c <= 'z' {
			return c, true
		}

		if key.Key[0] < utf8.RuneSelf {
			return 0, false
		}
	}

	if len(key.Code) == 4 && strings.HasPrefix(key.Code, "Key") {
		c := key.Code[3] | 0x20
		if c >= 'a' && c <= 'z' {
			return c, true
		}
	}

	return 0, false
}

// usLayout is the character of a digit or punctuation key code on a US
// layout, unshifted and shifted: xterm.js's KEYCODE_KEY_MAPPINGS.
func usLayout(code string) (string, bool) {
	pairs := map[string]string{
		"Digit0": "0)", "Digit1": "1!", "Digit2": "2@", "Digit3": "3#", "Digit4": "4$",
		"Digit5": "5%", "Digit6": "6^", "Digit7": "7&", "Digit8": "8*", "Digit9": "9(",
		"Semicolon": ";:", "Equal": "=+", "Comma": ",<", "Minus": "-_", "Period": ".>",
		"Slash": "/?", "Backquote": "`~", "BracketLeft": "[{", "Backslash": "\\|",
		"BracketRight": "]}", "Quote": "'\"",
	}

	pair, ok := pairs[code]

	return pair, ok
}

// keyChar is the one ASCII character a key types, from its key or, when the
// layout typed something else, from its code on a US layout.
func keyChar(key *KeyInput) (byte, bool) {
	if len(key.Key) == 1 && key.Key[0] >= 0x20 && key.Key[0] < 0x7f {
		return key.Key[0], true
	}

	pair, ok := usLayout(key.Code)
	if !ok {
		return 0, false
	}

	if key.Shift {
		return pair[1], true
	}

	return pair[0], true
}

// ctrlByte is the control character of Ctrl with a key and no other
// modifier: a letter, space (NUL), 3 to 7 (ESC, FS, GS, RS, US), 8 (DEL) and
// [ \ ] (ESC, FS, GS).
func ctrlByte(key *KeyInput) (byte, bool) {
	if letter, ok := asciiLetter(key); ok {
		return letter - 'a' + 1, true
	}

	if key.Key == " " || key.Code == "Space" {
		return 0, true
	}

	c, ok := keyChar(key)
	if !ok {
		return 0, false
	}

	switch {
	case c >= '3' && c <= '7':
		return c - '3' + 0x1b, true
	case c == '8':
		return 0x7f, true
	case c == '[':
		return 0x1b, true
	case c == '\\':
		return 0x1c, true
	case c == ']':
		return 0x1d, true
	default:
		return 0, false
	}
}

// altSequence is ESC followed by what Alt with a key types: a digit or
// punctuation character, a letter (its control character with Ctrl, upper
// case with Shift) or space (NUL with Ctrl).
func altSequence(key *KeyInput) (string, bool) {
	if letter, ok := asciiLetter(key); ok {
		switch {
		case key.Ctrl:
			letter = letter - 'a' + 1
		case key.Shift:
			letter -= 0x20
		}

		return esc + string(rune(letter)), true
	}

	if key.Key == " " || key.Code == "Space" {
		if key.Ctrl {
			return esc + "\x00", true
		}

		return esc + " ", true
	}

	if c, ok := keyChar(key); ok {
		return esc + string(rune(c)), true
	}

	return "", false
}

// characterKey encodes a key xterm.js does not match by key code: control
// characters, Alt (meta) sequences and the text a key types.
func characterKey(key *KeyInput) []byte {
	mods := key.Modifiers

	switch {
	case mods.Ctrl && !mods.Shift && !mods.Alt && !mods.Meta:
		if c, ok := ctrlByte(key); ok {
			return []byte{c}
		}

		return nil
	case mods.Alt && !mods.Meta:
		if seq, ok := altSequence(key); ok {
			return []byte(seq)
		}

		return nil
	case !mods.Ctrl && !mods.Alt && !mods.Meta:
		if key.Text != "" {
			return []byte(key.Text)
		}

		if utf8.RuneCountInString(key.Key) == 1 {
			return []byte(key.Key)
		}

		return nil
	case mods.Ctrl:
		// Ctrl with Shift or Meta: the characters xterm.js reaches by key.
		switch key.Key {
		case "@":
			return []byte{0x00}
		case "^":
			return []byte{0x1e}
		case "_":
			return []byte{0x1f}
		}

		return nil
	default:
		return nil
	}
}

// EncodePaste returns the bytes a paste sends to a pane, or nil for an empty
// paste. Line breaks become CR, as xterm.js's prepareTextForTerminal makes
// them. With bracketed paste on (DECSET 2004) the text is wrapped in
// ESC [200~ and ESC [201~, and every control character but tab and CR is
// dropped from it: xterm.js drops ESC, which keeps an ESC [201~ inside the
// text from ending the paste early, and the other C0 and C1 controls go too
// so pasted text cannot drive the program.
func EncodePaste(text string, modes vt.Modes) []byte {
	if text == "" {
		return nil
	}

	text = strings.ReplaceAll(text, "\r\n", "\r")
	text = strings.ReplaceAll(text, "\n", "\r")

	if !modes.BracketedPaste {
		return []byte(text)
	}

	var b strings.Builder

	b.Grow(len(text) + 12)
	b.WriteString(csi + "200~")

	for _, r := range text {
		if pasteControl(r) {
			continue
		}

		b.WriteRune(r)
	}

	b.WriteString(csi + "201~")

	return []byte(b.String())
}

func pasteControl(r rune) bool {
	switch {
	case r == '\t' || r == '\r':
		return false
	case r < 0x20 || r == 0x7f:
		return true
	default:
		return r >= 0x80 && r <= 0x9f
	}
}

// EncodeFocus returns the focus report of a pane that gained or lost focus
// (ESC [I or ESC [O), or nil when the program did not ask for focus reports
// (DECSET 1004).
func EncodeFocus(focused bool, modes vt.Modes) []byte {
	if !modes.SendFocus {
		return nil
	}

	if focused {
		return []byte(csi + "I")
	}

	return []byte(csi + "O")
}

// The button and action numbers of xterm.js's CoreMouseButton and
// CoreMouseAction.
const (
	mouseButtonLeft   = 0
	mouseButtonMiddle = 1
	mouseButtonRight  = 2
	mouseButtonNone   = 3
	mouseButtonWheel  = 4

	mouseActionUp    = 0
	mouseActionDown  = 1
	mouseActionLeft  = 2
	mouseActionRight = 3
	mouseActionMove  = 32
)

// defaultEncodingLimit is the largest value one byte of the default mouse
// encoding carries: 255 minus its offset of 32.
const defaultEncodingLimit = 223

func buttonNumber(button MouseButton) (int, bool) {
	switch button {
	case MouseButtonLeft:
		return mouseButtonLeft, true
	case MouseButtonMiddle:
		return mouseButtonMiddle, true
	case MouseButtonRight:
		return mouseButtonRight, true
	case MouseButtonNone:
		return mouseButtonNone, true
	default:
		return 0, false
	}
}

func wheelAction(direction WheelDirection) (int, bool) {
	switch direction {
	case WheelUp:
		return mouseActionUp, true
	case WheelDown:
		return mouseActionDown, true
	case WheelLeft:
		return mouseActionLeft, true
	case WheelRight:
		return mouseActionRight, true
	default:
		return 0, false
	}
}

// mouseButtonAction maps an event to xterm.js's button and action, and
// rejects the combinations it rejects: a press or release without a button,
// a wheel step without a direction.
func mouseButtonAction(ev *MouseInput) (int, int, bool) {
	if ev.Kind == MouseKindWheel {
		action, ok := wheelAction(ev.Wheel)

		return mouseButtonWheel, action, ok
	}

	button, ok := buttonNumber(ev.Button)
	if !ok {
		return 0, 0, false
	}

	switch ev.Kind {
	case MouseKindPress:
		return button, mouseActionDown, button != mouseButtonNone
	case MouseKindRelease:
		return button, mouseActionUp, button != mouseButtonNone
	case MouseKindMove:
		return button, mouseActionMove, true
	case MouseKindWheel:
		return 0, 0, false
	default:
		return 0, 0, false
	}
}

// mouseAllowed applies the restrictions of xterm.js's protocols: X10 (9)
// reports presses only and without modifiers, VT200 (1000) adds releases and
// the wheel, DRAG (1002) motion with a button held, ANY (1003) all motion.
func mouseAllowed(protocol vt.MouseProtocol, button, action int, mods *Modifiers) bool {
	switch protocol {
	case vt.MouseX10:
		if button == mouseButtonWheel || action != mouseActionDown {
			return false
		}

		*mods = Modifiers{}

		return true
	case vt.MouseVT200:
		return action != mouseActionMove
	case vt.MouseDrag:
		return action != mouseActionMove || button != mouseButtonNone
	case vt.MouseAny:
		return true
	case vt.MouseNone:
		return false
	default:
		return false
	}
}

// mouseEventCode is xterm.js's eventCode: the button, plus 4 for shift, 8
// for alt, 16 for ctrl, 32 for motion and 64 for the wheel. Only SGR reports
// which button was released; the default encoding reports button 3.
func mouseEventCode(button, action int, mods Modifiers, sgr bool) int {
	code := 0

	if mods.Shift {
		code |= 4
	}

	if mods.Alt {
		code |= 8
	}

	if mods.Ctrl {
		code |= 16
	}

	if button == mouseButtonWheel {
		return code | 64 | action
	}

	code |= button & 3

	switch {
	case action == mouseActionMove:
		code |= mouseActionMove
	case action == mouseActionUp && !sgr:
		code |= mouseButtonNone
	}

	return code
}

// EncodeMouse returns the report of a mouse event in a pane in the given
// modes, or nil when the program's mouse protocol does not report it. The
// encoding is the default one (CSI M and three bytes, which cannot address
// a cell past 223 and then sends nothing, as xterm.js does), SGR (DECSET
// 1006, CSI < code ; col ; row M or m) or SGR pixels (DECSET 1016, the same
// with X and Y). Cells are reported 1-based and pixels as given.
//
// The caller checks that the cell is inside the pane. xterm.js also drops a
// move to the cell of the previous event; that is left to the frontend,
// which sends a move only when the cell changes.
func EncodeMouse(ev *MouseInput, modes vt.Modes) []byte {
	if modes.MouseProtocol == vt.MouseNone || ev.Row < 0 || ev.Col < 0 {
		return nil
	}

	button, action, ok := mouseButtonAction(ev)
	if !ok {
		return nil
	}

	mods := ev.Modifiers
	if !mouseAllowed(modes.MouseProtocol, button, action, &mods) {
		return nil
	}

	col, row := ev.Col+1, ev.Row+1

	final := "M"
	if action == mouseActionUp && button != mouseButtonWheel {
		final = "m"
	}

	switch modes.MouseEncoding {
	case vt.MouseEncodingSGR:
		code := mouseEventCode(button, action, mods, true)

		return []byte(csi + "<" + strconv.Itoa(code) + ";" + strconv.Itoa(col) + ";" + strconv.Itoa(row) + final)
	case vt.MouseEncodingSGRPixels:
		code := mouseEventCode(button, action, mods, true)

		return []byte(csi + "<" + strconv.Itoa(code) + ";" + strconv.Itoa(max(0, ev.X)) + ";" +
			strconv.Itoa(max(0, ev.Y)) + final)
	case vt.MouseEncodingDefault:
		code := mouseEventCode(button, action, mods, false)
		if code > defaultEncodingLimit || col > defaultEncodingLimit || row > defaultEncodingLimit {
			return nil
		}

		return []byte{0x1b, '[', 'M', byte(code + 32), byte(col + 32), byte(row + 32)}
	default:
		return nil
	}
}
