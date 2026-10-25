// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt

// charAttributes applies an SGR sequence (CSI ... m) to the current
// attributes.
func (t *Terminal) charAttributes(p *params) {
	if p.length() == 1 && p.at(0) == 0 {
		t.cur = Attrs{}

		return
	}

	a := &t.cur

	for i := 0; i < p.length(); i++ {
		code := p.at(i)

		switch {
		case code >= 30 && code <= 37:
			a.Fg = Color{Mode: ColorPalette16, Value: uint32(code - 30)}
		case code >= 40 && code <= 47:
			a.Bg = Color{Mode: ColorPalette16, Value: uint32(code - 40)}
		case code >= 90 && code <= 97:
			a.Fg = Color{Mode: ColorPalette16, Value: uint32(code-90) | 8}
		case code >= 100 && code <= 107:
			a.Bg = Color{Mode: ColorPalette16, Value: uint32(code-100) | 8}
		case code == 38 || code == 48 || code == 58:
			i += extractColor(p, i, a)
		default:
			applyAttribute(a, code, p, i)
		}
	}
}

// applyAttribute handles the SGR codes that toggle a flag or reset a colour.
func applyAttribute(a *Attrs, code int, p *params, i int) {
	switch code {
	case 0:
		*a = Attrs{}
	case 1:
		a.Flags |= FlagBold
	case 2:
		a.Flags |= FlagDim
	case 3:
		a.Flags |= FlagItalic
	case 4:
		style := int32(UnderlineSingle)
		if subs := p.subParams(i); len(subs) > 0 {
			style = subs[0]
		}

		setUnderline(a, style)
	case 5:
		a.Flags |= FlagBlink
	case 7:
		a.Flags |= FlagInverse
	case 8:
		a.Flags |= FlagInvisible
	case 9:
		a.Flags |= FlagStrikethrough
	case 21:
		setUnderline(a, int32(UnderlineDouble))
	case 22:
		a.Flags &^= FlagBold | FlagDim
	case 23:
		a.Flags &^= FlagItalic
	case 24:
		setUnderline(a, int32(UnderlineNone))
	case 25:
		a.Flags &^= FlagBlink
	case 27:
		a.Flags &^= FlagInverse
	case 28:
		a.Flags &^= FlagInvisible
	case 29:
		a.Flags &^= FlagStrikethrough
	case 39:
		a.Fg = Color{}
	case 49:
		a.Bg = Color{}
	case 59:
		a.UnderlineColor = Color{}
	case 53:
		a.Flags |= FlagOverline
	case 55:
		a.Flags &^= FlagOverline
	}
}

// setUnderline sets the underline style; an empty (-1) or unknown style is a
// single underline and 0 removes it, as in xterm.js.
func setUnderline(a *Attrs, style int32) {
	if style < 0 || style > int32(UnderlineDashed) {
		style = int32(UnderlineSingle)
	}

	a.Underline = UnderlineStyle(style)
	a.Flags |= FlagUnderline

	if style == 0 {
		a.Flags &^= FlagUnderline
	}
}

// extractColor reads an extended colour (38, 48 or 58: foreground,
// background or underline) in either the ';'-separated or the ':'-separated
// form starting at parameter pos, applies it, and returns how many extra
// parameters it consumed.
func extractColor(p *params, pos int, a *Attrs) int {
	accu := []int32{0, 0, -1, 0, 0, 0}
	cSpace := 0
	advance := 0

	for {
		accu[advance+cSpace] = int32(p.at(pos + advance))

		if subs := p.subParams(pos + advance); len(subs) > 0 {
			for k := 0; k < len(subs); k++ {
				if accu[1] == 5 {
					cSpace = 1
				}

				idx := advance + k + 1 + cSpace
				if idx < 0 || idx >= len(accu) {
					break
				}

				accu[idx] = subs[k]

				if k+1+advance+1+cSpace >= len(accu) {
					break
				}
			}

			break
		}

		if (accu[1] == 5 && advance+cSpace >= 2) || (accu[1] == 2 && advance+cSpace >= 5) {
			break
		}

		if accu[1] != 0 {
			cSpace = 1
		}

		advance++
		if advance+pos >= p.length() || advance+cSpace >= len(accu) {
			break
		}
	}

	for i := 2; i < len(accu); i++ {
		if accu[i] == -1 {
			accu[i] = 0
		}
	}

	switch accu[0] {
	case 38:
		a.Fg = updateColor(a.Fg, accu[1], accu[3], accu[4], accu[5])
	case 48:
		a.Bg = updateColor(a.Bg, accu[1], accu[3], accu[4], accu[5])
	case 58:
		a.UnderlineColor = updateColor(a.UnderlineColor, accu[1], accu[3], accu[4], accu[5])
	}

	return advance
}

func updateColor(c Color, mode, c1, c2, c3 int32) Color {
	switch mode {
	case 2:
		rgb := uint32(c1&0xff)<<16 | uint32(c2&0xff)<<8 | uint32(c3&0xff)

		return Color{Mode: ColorRGB, Value: rgb}
	case 5:
		return Color{Mode: ColorPalette256, Value: uint32(c1 & 0xff)}
	default:
		return c
	}
}
