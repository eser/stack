// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"strconv"
	"unicode/utf8"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// The encoder of a whole screen update: the fields around the rows, and the
// JSON strings in all of them (screen_wire.go has the rows).

// appendJSON appends the update as a JSON object, with the fields and
// names of its struct tags.
func (u *ScreenUpdate) appendJSON(b []byte) []byte {
	b = append(b, `{"full":`...)
	b = strconv.AppendBool(b, u.Full)
	b = append(b, `,"cols":`...)
	b = strconv.AppendInt(b, int64(u.Cols), 10)
	b = append(b, `,"rows":`...)
	b = strconv.AppendInt(b, int64(u.Rows), 10)
	b = append(b, `,"cursor":`...)
	b = u.Cursor.appendJSON(b)
	b = append(b, `,"title":`...)
	b = appendJSONString(b, u.Title)
	b = append(b, `,"mouse":`...)
	b = appendJSONString(b, u.Mouse)
	b = append(b, `,"altScreen":`...)
	b = strconv.AppendBool(b, u.AltScreen)
	b = append(b, `,"styles":`...)
	b = appendList(b, u.Styles, func(b []byte, s *ScreenStyle) []byte { return s.appendJSON(b) })

	if len(u.Links) > 0 {
		b = append(b, `,"links":`...)
		b = appendList(b, u.Links, func(b []byte, l *ScreenLink) []byte { return l.appendJSON(b) })
	}

	b = append(b, `,"lines":`...)
	b = appendList(b, u.Lines, func(b []byte, l *ScreenLine) []byte { return l.appendJSON(b) })

	if h := u.History; h != nil {
		b = append(b, `,"history":{`...)

		if h.Reset {
			b = append(b, `"reset":true,`...)
		}

		b = append(b, `"lines":`...)
		b = appendList(b, h.Lines, func(b []byte, l *ScreenHistoryLine) []byte { return l.appendJSON(b) })
		b = append(b, '}')
	}

	return append(b, '}')
}

// MarshalJSON writes the update with runs and lines in their wire form. It
// takes the update by value so that json.Marshal uses it for a value too.
func (u ScreenUpdate) MarshalJSON() ([]byte, error) { //nolint:gocritic // hugeParam: a value receiver, so json.Marshal finds it on values
	return u.appendJSON(make([]byte, 0, 1024)), nil
}

// appendList appends a JSON array of items, or null for a nil slice, as
// encoding/json writes one.
func appendList[T any](b []byte, items []T, appendItem func(b []byte, item *T) []byte) []byte {
	if items == nil {
		return append(b, "null"...)
	}

	b = append(b, '[')

	for i := range items {
		if i > 0 {
			b = append(b, ',')
		}

		b = appendItem(b, &items[i])
	}

	return append(b, ']')
}

func (c *ScreenCursor) appendJSON(b []byte) []byte {
	b = append(b, `{"x":`...)
	b = strconv.AppendInt(b, int64(c.X), 10)
	b = append(b, `,"y":`...)
	b = strconv.AppendInt(b, int64(c.Y), 10)
	b = append(b, `,"visible":`...)
	b = strconv.AppendBool(b, c.Visible)

	if c.Shape != "" {
		b = append(b, `,"shape":`...)
		b = appendJSONString(b, c.Shape)
	}

	if c.Blink != nil {
		b = append(b, `,"blink":`...)
		b = strconv.AppendBool(b, *c.Blink)
	}

	return append(b, '}')
}

func (s *ScreenStyle) appendJSON(b []byte) []byte {
	b = append(b, '{')
	sep := false

	field := func(name string) {
		if sep {
			b = append(b, ',')
		}

		sep = true
		b = append(b, '"')
		b = append(b, name...)
		b = append(b, `":`...)
	}

	color := func(name string, c vt.Color) {
		if c == (vt.Color{}) {
			return
		}

		field(name)
		b = append(b, `{"mode":`...)
		b = strconv.AppendUint(b, uint64(c.Mode), 10)
		b = append(b, `,"value":`...)
		b = strconv.AppendUint(b, uint64(c.Value), 10)
		b = append(b, '}')
	}

	color("fg", s.Fg)
	color("bg", s.Bg)
	color("underlineColor", s.UnderlineColor)

	if s.Flags != 0 {
		field("flags")
		b = strconv.AppendUint(b, uint64(s.Flags), 10)
	}

	if s.Underline != 0 {
		field("underline")
		b = strconv.AppendInt(b, int64(s.Underline), 10)
	}

	return append(b, '}')
}

func (l *ScreenLink) appendJSON(b []byte) []byte {
	b = append(b, `{"link":`...)
	b = strconv.AppendUint(b, uint64(l.Link), 10)

	if l.ID != "" {
		b = append(b, `,"id":`...)
		b = appendJSONString(b, l.ID)
	}

	b = append(b, `,"uri":`...)
	b = appendJSONString(b, l.URI)

	return append(b, '}')
}

const hexDigits = "0123456789abcdef"

// appendJSONString appends s as a JSON string. It escapes what JSON
// requires, and U+2028 and U+2029 as encoding/json does, and replaces
// invalid UTF-8 with U+FFFD; unlike encoding/json it leaves <, > and &
// alone, which a screen message never puts into HTML.
func appendJSONString(b []byte, s string) []byte {
	b = append(b, '"')
	start := 0

	for i := 0; i < len(s); {
		c := s[i]

		if c < utf8.RuneSelf {
			if c >= 0x20 && c != '"' && c != '\\' {
				i++

				continue
			}

			b = append(b, s[start:i]...)

			switch c {
			case '"', '\\':
				b = append(b, '\\', c)
			case '\n':
				b = append(b, `\n`...)
			case '\r':
				b = append(b, `\r`...)
			case '\t':
				b = append(b, `\t`...)
			default:
				b = append(b, '\\', 'u', '0', '0', hexDigits[c>>4], hexDigits[c&0xf])
			}

			i++
			start = i

			continue
		}

		r, size := utf8.DecodeRuneInString(s[i:])

		switch {
		case r == utf8.RuneError && size == 1:
			b = append(b, s[start:i]...)
			b = append(b, "\\ufffd"...)
		case r == '\u2028' || r == '\u2029':
			b = append(b, s[start:i]...)
			b = append(b, '\\', 'u', '2', '0', '2', hexDigits[r&0xf])
		default:
			i += size

			continue
		}

		i += size
		start = i
	}

	b = append(b, s[start:]...)

	return append(b, '"')
}
