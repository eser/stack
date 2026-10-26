// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"slices"
	"strconv"
	"strings"
)

// The hooks read and rewrite files that the TypeScript CLI owns (state.json,
// the ask token, the JSONL logs) and print JSON that tools and tests compare
// byte for byte. These helpers parse and print JSON as JSON.parse and
// JSON.stringify do: object keys keep their order, numbers are float64 and
// print as JavaScript prints them, and strings escape only what
// JSON.stringify escapes (Go's encoder also escapes <, >, &, U+2028 and
// U+2029).
//
// A parsed value is nil (null), bool, float64, string, []any or *JSObject.

var (
	errJSONTrailing = errors.New("unexpected data after the JSON value")
	errJSONToken    = errors.New("unexpected JSON token")
)

// JSObject is a JSON object with JavaScript's key order.
type JSObject struct {
	keys   []string
	values map[string]any
}

func NewJSObject() *JSObject {
	return &JSObject{keys: nil, values: map[string]any{}}
}

// JSObjectOf builds an object from key and value pairs in order.
func JSObjectOf(pairs ...any) *JSObject {
	o := NewJSObject()

	for i := 0; i+1 < len(pairs); i += 2 {
		key, _ := pairs[i].(string)
		o.set(key, pairs[i+1])
	}

	return o
}

func (o *JSObject) get(key string) (any, bool) {
	if o == nil {
		return nil, false
	}

	v, ok := o.values[key]

	return v, ok
}

// set adds key at the end, or replaces its value where it stands, as an
// assignment to a JavaScript object does.
func (o *JSObject) set(key string, value any) {
	if _, ok := o.values[key]; !ok {
		o.keys = append(o.keys, key)
	}

	o.values[key] = value
}

func (o *JSObject) remove(key string) {
	if _, ok := o.values[key]; !ok {
		return
	}

	delete(o.values, key)
	o.keys = slices.DeleteFunc(o.keys, func(k string) bool { return k == key })
}

// Get returns a field's value and whether the object has the field.
func (o *JSObject) Get(key string) (any, bool) {
	return o.get(key)
}

// String is JSON.stringify of the object.
func (o *JSObject) String() string {
	return jsonStringify(o)
}

// clone copies the object one level deep, as `{ ...object }` does.
func (o *JSObject) clone() *JSObject {
	c := NewJSObject()
	if o == nil {
		return c
	}

	for _, key := range o.keys {
		c.set(key, o.values[key])
	}

	return c
}

// orderedKeys are the keys in the order JavaScript enumerates them: array
// index keys ("0", "1", ...) first in numeric order, then the others in the
// order they were added.
func (o *JSObject) orderedKeys() []string {
	var indexes, others []string

	for _, key := range o.keys {
		if isArrayIndexKey(key) {
			indexes = append(indexes, key)
		} else {
			others = append(others, key)
		}
	}

	if len(indexes) == 0 {
		return others
	}

	slices.SortFunc(indexes, func(a, b string) int {
		x, _ := strconv.ParseUint(a, 10, 64)
		y, _ := strconv.ParseUint(b, 10, 64)

		switch {
		case x < y:
			return -1
		case x > y:
			return 1
		default:
			return 0
		}
	})

	return append(indexes, others...)
}

// isArrayIndexKey reports whether key is the canonical string of an integer
// from 0 to 2^32-2, which JavaScript orders before the other keys.
func isArrayIndexKey(key string) bool {
	if key == "" || len(key) > 10 || (len(key) > 1 && key[0] == '0') {
		return false
	}

	n, err := strconv.ParseUint(key, 10, 64)

	return err == nil && n < math.MaxUint32
}

// parseJSON is JSON.parse: it fails on anything but one JSON value.
func parseJSON(text string) (any, error) {
	dec := json.NewDecoder(strings.NewReader(text))
	dec.UseNumber()

	value, err := decodeJSONValue(dec)
	if err != nil {
		return nil, err
	}

	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return nil, errJSONTrailing
	}

	return value, nil
}

func decodeJSONValue(dec *json.Decoder) (any, error) {
	token, err := dec.Token()
	if err != nil {
		return nil, fmt.Errorf("parse JSON: %w", err)
	}

	switch t := token.(type) {
	case json.Delim:
		switch t {
		case '{':
			return decodeJSONObject(dec)
		case '[':
			return decodeJSONArray(dec)
		default:
			return nil, errJSONToken
		}
	case json.Number:
		// JSON.parse reads every number as a double; one too large to hold
		// becomes Infinity, as ParseFloat's range error value does.
		f, _ := strconv.ParseFloat(t.String(), 64)

		return f, nil
	default:
		return t, nil // string, bool or nil
	}
}

func decodeJSONObject(dec *json.Decoder) (any, error) {
	o := NewJSObject()

	for dec.More() {
		keyToken, err := dec.Token()
		if err != nil {
			return nil, fmt.Errorf("parse JSON object key: %w", err)
		}

		key, ok := keyToken.(string)
		if !ok {
			return nil, errJSONToken
		}

		value, err := decodeJSONValue(dec)
		if err != nil {
			return nil, err
		}

		// A repeated key keeps its first position and takes the last value.
		o.set(key, value)
	}

	if _, err := dec.Token(); err != nil {
		return nil, fmt.Errorf("parse JSON object end: %w", err)
	}

	return o, nil
}

func decodeJSONArray(dec *json.Decoder) (any, error) {
	items := []any{}

	for dec.More() {
		value, err := decodeJSONValue(dec)
		if err != nil {
			return nil, err
		}

		items = append(items, value)
	}

	if _, err := dec.Token(); err != nil {
		return nil, fmt.Errorf("parse JSON array end: %w", err)
	}

	return items, nil
}

// jsonStringify is JSON.stringify(value).
func jsonStringify(value any) string {
	var b bytes.Buffer
	writeJSON(&b, value, "", "")

	return b.String()
}

// jsonStringifyIndent is JSON.stringify(value, null, 2).
func jsonStringifyIndent(value any) string {
	var b bytes.Buffer
	writeJSON(&b, value, "  ", "")

	return b.String()
}

func writeJSON(b *bytes.Buffer, value any, indent, prefix string) { //nolint:cyclop // one case per JSON type
	switch v := value.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		b.WriteString(strconv.FormatBool(v))
	case float64:
		b.WriteString(jsNumberJSON(v))
	case int:
		b.WriteString(strconv.Itoa(v))
	case string:
		writeJSONString(b, v)
	case []string:
		items := make([]any, len(v))
		for i, s := range v {
			items[i] = s
		}

		writeJSONArray(b, items, indent, prefix)
	case []any:
		writeJSONArray(b, v, indent, prefix)
	case *JSObject:
		writeJSONObject(b, v, indent, prefix)
	default:
		// Only the types above are built here; anything else is a bug.
		panic(fmt.Sprintf("jsonStringify: unsupported type %T", value))
	}
}

func writeJSONArray(b *bytes.Buffer, items []any, indent, prefix string) {
	if len(items) == 0 {
		b.WriteString("[]")

		return
	}

	inner := prefix + indent

	b.WriteByte('[')

	for i, item := range items {
		if i > 0 {
			b.WriteByte(',')
		}

		if indent != "" {
			b.WriteString("\n" + inner)
		}

		writeJSON(b, item, indent, inner)
	}

	if indent != "" {
		b.WriteString("\n" + prefix)
	}

	b.WriteByte(']')
}

func writeJSONObject(b *bytes.Buffer, o *JSObject, indent, prefix string) {
	keys := o.orderedKeys()
	if len(keys) == 0 {
		b.WriteString("{}")

		return
	}

	inner := prefix + indent

	b.WriteByte('{')

	for i, key := range keys {
		if i > 0 {
			b.WriteByte(',')
		}

		if indent != "" {
			b.WriteString("\n" + inner)
		}

		writeJSONString(b, key)
		b.WriteByte(':')

		if indent != "" {
			b.WriteByte(' ')
		}

		writeJSON(b, o.values[key], indent, inner)
	}

	if indent != "" {
		b.WriteString("\n" + prefix)
	}

	b.WriteByte('}')
}

// writeJSONString quotes s as JSON.stringify does: \" and \\, the short
// escapes \b \f \n \r \t, \u00xx for the other control characters, and every
// other character as it is.
func writeJSONString(b *bytes.Buffer, s string) {
	const hex = "0123456789abcdef"

	b.WriteByte('"')

	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				b.WriteString(`\u00`)
				b.WriteByte(hex[r>>4])
				b.WriteByte(hex[r&0xf])
			} else {
				b.WriteRune(r)
			}
		}
	}

	b.WriteByte('"')
}

// jsNumberJSON prints a number as JSON.stringify does: NaN and the
// infinities as null, -0 as 0, and the rest as Number.prototype.toString.
func jsNumberJSON(f float64) string {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return "null"
	}

	return jsNumberString(f)
}

// jsNumberString is Number.prototype.toString for a finite number: the
// shortest digits that read back as f, in plain notation from 1e-6 up to
// 1e21 and in exponent notation (1e+21, 1.5e-7) outside that range.
func jsNumberString(f float64) string {
	if f == 0 {
		return "0"
	}

	abs := math.Abs(f)
	if abs >= 1e-6 && abs < 1e21 {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}

	s := strconv.FormatFloat(f, 'e', -1, 64)
	mantissa, exponent, _ := strings.Cut(s, "e")
	sign := exponent[0]
	digits := strings.TrimLeft(exponent[1:], "0")

	return mantissa + "e" + string(sign) + digits
}
