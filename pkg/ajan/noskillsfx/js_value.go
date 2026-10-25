// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"math"
	"slices"
	"unicode/utf16"
)

// The lifecycle commands work on state the way the TypeScript CLI does: as
// JSON objects that keep their key order, changed by spreading
// (`{ ...state, phase: "X" }`). These helpers read such objects as loosely as
// TypeScript code that trusts the file's shape, and build the spread copies.
// A key set to undefined in TypeScript is removed here; JSON.stringify drops
// it either way.

// MarshalJSON writes the object as JSON.stringify does, so an HTTP handler
// can return a compiled output as it is. encoding/json compacts the result,
// which leaves the key order alone.
func (o *JSObject) MarshalJSON() ([]byte, error) {
	if o == nil {
		return []byte("null"), nil
	}

	return []byte(jsonStringify(o)), nil
}

// Keys returns the object's keys in JavaScript's enumeration order.
func (o *JSObject) Keys() []string {
	if o == nil {
		return nil
	}

	return o.orderedKeys()
}

// Set adds or replaces a field, as an assignment does.
func (o *JSObject) Set(key string, value any) {
	o.set(key, value)
}

// with is `{ ...o, key: value, ... }`: a copy with the pairs set in order.
// A nil value in pairs is JSON null; use without to drop a key.
func (o *JSObject) with(pairs ...any) *JSObject {
	c := o.clone()

	for i := 0; i+1 < len(pairs); i += 2 {
		key, _ := pairs[i].(string)
		c.set(key, pairs[i+1])
	}

	return c
}

// without is `{ ...o, key: undefined }`: a copy without the keys.
func (o *JSObject) without(keys ...string) *JSObject {
	c := o.clone()

	for _, key := range keys {
		c.remove(key)
	}

	return c
}

// has reports whether the object holds key with a value other than
// undefined, which `o.key !== undefined` tests.
func (o *JSObject) has(key string) bool {
	_, ok := o.get(key)

	return ok
}

// obj is the field as an object, or nil when it is missing or not one.
func (o *JSObject) obj(key string) *JSObject {
	value, _ := o.get(key)
	child, _ := value.(*JSObject)

	return child
}

// objOrEmpty is the field as an object, or an empty object; spreading a
// missing object field in TypeScript gives an empty one.
func (o *JSObject) objOrEmpty(key string) *JSObject {
	if child := o.obj(key); child != nil {
		return child
	}

	return NewJSObject()
}

// arr is the field as an array, or nil when it is missing or not one.
func (o *JSObject) arr(key string) []any {
	value, _ := o.get(key)
	items, _ := value.([]any)

	return items
}

// str is the field when it holds a string, or "".
func (o *JSObject) str(key string) string {
	value, _ := o.get(key)
	s, _ := value.(string)

	return s
}

// strOK is the field's string and whether it holds one.
func (o *JSObject) strOK(key string) (string, bool) {
	value, _ := o.get(key)
	s, ok := value.(string)

	return s, ok
}

// num is the field when it holds a number, or 0.
func (o *JSObject) num(key string) float64 {
	value, _ := o.get(key)

	return numberOf(value)
}

// isTrue reports whether the field is the boolean true.
func (o *JSObject) isTrue(key string) bool {
	value, _ := o.get(key)

	return value == true
}

// isNull reports whether the field is missing or JSON null, which
// `o.key === null || o.key === undefined` tests.
func (o *JSObject) isNullish(key string) bool {
	value, ok := o.get(key)

	return !ok || value == nil
}

// numberOf reads a JSON number, whichever Go type holds it.
func numberOf(value any) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case int:
		return float64(v)
	default:
		return 0
	}
}

// objectsOf keeps the objects of a JSON array.
func objectsOf(items []any) []*JSObject {
	out := make([]*JSObject, 0, len(items))

	for _, item := range items {
		if o, ok := item.(*JSObject); ok {
			out = append(out, o)
		}
	}

	return out
}

// stringsOf keeps the strings of a JSON array.
func stringsOf(items []any) []string {
	out := make([]string, 0, len(items))

	for _, item := range items {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}

	return out
}

// anyOf is a JSON array of strings.
func anyOf(items []string) []any {
	out := make([]any, len(items))
	for i, item := range items {
		out[i] = item
	}

	return out
}

// anyOfObjects is a JSON array of objects.
func anyOfObjects(items []*JSObject) []any {
	out := make([]any, len(items))
	for i, item := range items {
		out[i] = item
	}

	return out
}

// appendAny is `[...items, more...]` as a new array.
func appendAny(items []any, more ...any) []any {
	out := make([]any, 0, len(items)+len(more))
	out = append(out, items...)

	return append(out, more...)
}

// jsInteger is a whole-number count as JSON prints it.
func jsInteger(n int) float64 {
	return float64(n)
}

// containsString is `items.includes(value)` for a string array.
func containsString(items []string, value string) bool {
	return slices.Contains(items, value)
}

// getOr is the field's value, or nil when it is missing.
func (o *JSObject) getOr(key string) any {
	value, _ := o.get(key)

	return value
}

// jsTruthy is JavaScript truthiness for a JSON value.
func jsTruthy(value any) bool {
	switch v := value.(type) {
	case nil:
		return false
	case bool:
		return v
	case float64:
		return v != 0 && !math.IsNaN(v)
	case int:
		return v != 0
	case string:
		return v != ""
	default:
		return true
	}
}

// utf16Units are the UTF-16 code units of s, which String.charCodeAt reads.
func utf16Units(s string) []uint16 {
	return utf16.Encode([]rune(s))
}

// JSONIndent is JSON.stringify(value, null, 2) for an object or an array.
func JSONIndent(value any) string {
	return jsonStringifyIndent(value)
}

// DisplayValue is a JSON value as a template literal prints it.
func DisplayValue(value any) string {
	return jsDisplay(value)
}
