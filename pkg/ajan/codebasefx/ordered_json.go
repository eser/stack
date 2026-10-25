// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
	"unicode/utf8"
)

// orderedValue is a JSON value that keeps its object keys in file order.
type orderedValue struct {
	object []orderedMember // set for objects (possibly empty)
	array  []orderedValue  // set for arrays (possibly empty)
	scalar any             // string, json.Number, bool or nil for the rest
	kind   byte            // 'o' object, 'a' array, 's' scalar
}

type orderedMember struct {
	key   string
	value orderedValue
}

var errNotJSONObject = errors.New("the file is not a JSON object")

// decodeOrdered parses JSON, keeping object key order.
func decodeOrdered(data []byte) (orderedValue, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()

	value, err := decodeOrderedValue(dec)
	if err != nil {
		return orderedValue{}, err
	}

	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return orderedValue{}, fmt.Errorf("unexpected data after the JSON value")
	}

	return value, nil
}

func decodeOrderedValue(dec *json.Decoder) (orderedValue, error) {
	tok, err := dec.Token()
	if err != nil {
		return orderedValue{}, err //nolint:wrapcheck
	}

	if t, ok := tok.(json.Delim); ok {
		switch t {
		case '{':
			value := orderedValue{kind: 'o', object: []orderedMember{}} //nolint:exhaustruct

			for dec.More() {
				keyTok, err := dec.Token()
				if err != nil {
					return orderedValue{}, err //nolint:wrapcheck
				}

				key, _ := keyTok.(string)

				member, err := decodeOrderedValue(dec)
				if err != nil {
					return orderedValue{}, err
				}

				value.object = append(value.object, orderedMember{key: key, value: member})
			}

			_, err := dec.Token() // }

			return value, err //nolint:wrapcheck
		case '[':
			value := orderedValue{kind: 'a', array: []orderedValue{}} //nolint:exhaustruct

			for dec.More() {
				item, err := decodeOrderedValue(dec)
				if err != nil {
					return orderedValue{}, err
				}

				value.array = append(value.array, item)
			}

			_, err := dec.Token() // ]

			return value, err //nolint:wrapcheck
		case '}', ']':
		}
	}

	return orderedValue{kind: 's', scalar: tok}, nil //nolint:exhaustruct
}

// get returns the member key of an object.
func (v *orderedValue) get(key string) (*orderedValue, bool) {
	for i := range v.object {
		if v.object[i].key == key {
			return &v.object[i].value, true
		}
	}

	return nil, false
}

// stringify encodes v as JavaScript's JSON.stringify(v, null, 2) does, with
// a final newline, so a rewritten config file matches the TypeScript tools.
func (v *orderedValue) stringify() []byte {
	var b strings.Builder

	writeStringified(&b, v, "")
	b.WriteByte('\n')

	return []byte(b.String())
}

func writeStringified(b *strings.Builder, v *orderedValue, indent string) {
	inner := indent + "  "

	switch v.kind {
	case 'o':
		if len(v.object) == 0 {
			b.WriteString("{}")

			return
		}

		b.WriteString("{\n")

		for i := range v.object {
			b.WriteString(inner)
			b.WriteString(jsString(v.object[i].key))
			b.WriteString(": ")
			writeStringified(b, &v.object[i].value, inner)

			if i < len(v.object)-1 {
				b.WriteByte(',')
			}

			b.WriteByte('\n')
		}

		b.WriteString(indent + "}")
	case 'a':
		if len(v.array) == 0 {
			b.WriteString("[]")

			return
		}

		b.WriteString("[\n")

		for i := range v.array {
			b.WriteString(inner)
			writeStringified(b, &v.array[i], inner)

			if i < len(v.array)-1 {
				b.WriteByte(',')
			}

			b.WriteByte('\n')
		}

		b.WriteString(indent + "]")
	default:
		switch s := v.scalar.(type) {
		case string:
			b.WriteString(jsString(s))
		case json.Number:
			b.WriteString(jsNumber(s))
		case bool:
			b.WriteString(strconv.FormatBool(s))
		default:
			b.WriteString("null")
		}
	}
}

// jsString quotes s as JSON.stringify does: only ", \ and control characters
// are escaped; other characters, U+2028 and U+2029 included, stay as they are.
func jsString(s string) string {
	var b strings.Builder

	b.WriteByte('"')

	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])

		switch {
		case r == '"':
			b.WriteString(`\"`)
		case r == '\\':
			b.WriteString(`\\`)
		case r == '\b':
			b.WriteString(`\b`)
		case r == '\f':
			b.WriteString(`\f`)
		case r == '\n':
			b.WriteString(`\n`)
		case r == '\r':
			b.WriteString(`\r`)
		case r == '\t':
			b.WriteString(`\t`)
		case r < 0x20:
			fmt.Fprintf(&b, `\u%04x`, r)
		default:
			b.WriteString(s[i : i+size])
		}

		i += size
	}

	b.WriteByte('"')

	return b.String()
}

// jsNumber formats a JSON number as JavaScript's Number#toString does.
func jsNumber(n json.Number) string {
	f, err := strconv.ParseFloat(string(n), 64)
	if err != nil || math.IsInf(f, 0) || math.IsNaN(f) {
		return "null"
	}

	if f == 0 {
		return "0"
	}

	sign := ""
	if f < 0 {
		sign = "-"
		f = -f
	}

	// The shortest round-trip digits and the decimal exponent.
	mantissa, expPart, _ := strings.Cut(strconv.FormatFloat(f, 'e', -1, 64), "e")
	digits := strings.ReplaceAll(mantissa, ".", "")
	exp, _ := strconv.Atoi(expPart)
	k, point := len(digits), exp+1

	switch {
	case k <= point && point <= 21:
		return sign + digits + strings.Repeat("0", point-k)
	case 0 < point && point <= 21:
		return sign + digits[:point] + "." + digits[point:]
	case -6 < point && point <= 0:
		return sign + "0." + strings.Repeat("0", -point) + digits
	}

	expSign := "+"
	if point-1 < 0 {
		expSign = "-"
	}

	frac := ""
	if k > 1 {
		frac = "." + digits[1:]
	}

	return fmt.Sprintf("%s%s%se%s%d", sign, digits[:1], frac, expSign, abs(point-1))
}

func abs(n int) int {
	if n < 0 {
		return -n
	}

	return n
}

// stripJSONComments removes // and /* */ comments outside strings, for
// .jsonc files (the TypeScript loader parses them with comments ignored).
func stripJSONComments(data []byte) []byte {
	var out bytes.Buffer

	inString := false

	for i := 0; i < len(data); i++ {
		c := data[i]

		switch {
		case inString:
			out.WriteByte(c)

			if c == '\\' && i+1 < len(data) {
				i++
				out.WriteByte(data[i])
			} else if c == '"' {
				inString = false
			}
		case c == '"':
			inString = true
			out.WriteByte(c)
		case c == '/' && i+1 < len(data) && data[i+1] == '/':
			for i < len(data) && data[i] != '\n' {
				i++
			}

			if i < len(data) {
				out.WriteByte('\n')
			}
		case c == '/' && i+1 < len(data) && data[i+1] == '*':
			end := bytes.Index(data[i+2:], []byte("*/"))
			if end < 0 {
				return out.Bytes()
			}

			i += end + 3
		default:
			out.WriteByte(c)
		}
	}

	return out.Bytes()
}
