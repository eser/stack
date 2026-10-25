// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt

// CursorShape is the cursor shape a program asked for with DECSCUSR
// (CSI Ps SP q).
type CursorShape uint8

const (
	// CursorShapeDefault leaves the shape to the frontend: no DECSCUSR yet,
	// DECSCUSR 0, or a reset since.
	CursorShapeDefault CursorShape = iota
	// CursorShapeBlock is DECSCUSR 1 or 2.
	CursorShapeBlock
	// CursorShapeUnderline is DECSCUSR 3 or 4.
	CursorShapeUnderline
	// CursorShapeBar is DECSCUSR 5 or 6.
	CursorShapeBar
)

// String returns "default", "block", "underline" or "bar".
func (s CursorShape) String() string {
	switch s {
	case CursorShapeBlock:
		return "block"
	case CursorShapeUnderline:
		return "underline"
	case CursorShapeBar:
		return "bar"
	default:
		return "default"
	}
}

// CursorBlink is whether the program asked for a blinking cursor.
type CursorBlink uint8

const (
	// CursorBlinkDefault leaves blinking to the frontend.
	CursorBlinkDefault CursorBlink = iota
	// CursorBlinkOn is an odd DECSCUSR parameter (1, 3, 5).
	CursorBlinkOn
	// CursorBlinkOff is an even DECSCUSR parameter (2, 4, 6).
	CursorBlinkOff
)

// CursorStyle is the cursor shape and blinking a program set with DECSCUSR.
// The zero value leaves both to the frontend.
type CursorStyle struct {
	Shape CursorShape `json:"shape"`
	Blink CursorBlink `json:"blink"`
}

// CursorStyle returns the cursor style the program asked for. A full reset
// (RIS) and a soft reset (DECSTR) bring back the zero value, as in xterm.js.
func (t *Terminal) CursorStyle() CursorStyle {
	return t.cursorStyle
}

// setCursorStyle applies DECSCUSR the way xterm.js 6 does: 0 gives the
// shape and blinking back to the frontend; 1 to 6 pick a shape and an odd
// parameter blinks; any other parameter keeps the shape and sets blinking
// from its parity.
func (t *Terminal) setCursorStyle(p *params) {
	param := 1
	if p.length() > 0 {
		param = p.at(0)
	}

	if param == 0 {
		t.cursorStyle = CursorStyle{}

		return
	}

	switch param {
	case 1, 2:
		t.cursorStyle.Shape = CursorShapeBlock
	case 3, 4:
		t.cursorStyle.Shape = CursorShapeUnderline
	case 5, 6:
		t.cursorStyle.Shape = CursorShapeBar
	}

	t.cursorStyle.Blink = CursorBlinkOff
	if param%2 == 1 {
		t.cursorStyle.Blink = CursorBlinkOn
	}
}
