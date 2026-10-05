// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx

import (
	"bytes"
	"errors"
	"math"
	"strings"

	"github.com/BurntSushi/toml"
)

// maxExactFloatInt is 2^53: every whole number up to this magnitude has an
// exact float64 form. JavaScript's Number.MAX_SAFE_INTEGER is 2^53 - 1.
const maxExactFloatInt = 1 << 53

// ErrTOMLRootNotObject is returned when a non-map value is passed as the TOML root.
// TOML documents must have a table (map or struct) as their root.
var ErrTOMLRootNotObject = errors.New("toml: root value must be a table (struct or map)")

type tomlFmt struct{}

// TOMLFormat is the built-in TOML format.
var TOMLFormat Format = &tomlFmt{} //nolint:gochecknoglobals

func (f *tomlFmt) Name() string         { return "toml" }
func (f *tomlFmt) Extensions() []string { return []string{"toml"} }
func (f *tomlFmt) Streamable() bool     { return false }

func (f *tomlFmt) WriteStart(_ *FormatOptions) (string, error) { return "", nil }

// WriteItem writes data as one TOML table. Whole-number float64 values within
// +-2^53 are written as integers, because data decoded from JSON holds every
// number as a float64. A list entry ends with a "+++" line so the reader can
// split the tables again; a whole document (opts.Document) does not.
func (f *tomlFmt) WriteItem(data any, opts *FormatOptions) (string, error) {
	// TOML root must be a table. Reject primitives and slices up front.
	table, ok := data.(map[string]any)
	if !ok {
		return "", newSerializationError("toml", ErrTOMLRootNotObject.Error(), ErrTOMLRootNotObject)
	}

	var buf bytes.Buffer
	enc := toml.NewEncoder(&buf)
	// Keys of a nested table start at column 0, as the TypeScript format
	// writes them.
	enc.Indent = ""

	if err := enc.Encode(wholeFloatsToInts(table)); err != nil {
		return "", newSerializationError("toml", "failed to serialize TOML: "+err.Error(), err)
	}

	if opts != nil && opts.Document {
		return buf.String(), nil
	}

	// The bridge and the TypeScript serializer trim the final +++.
	return buf.String() + "+++\n", nil
}

// wholeFloatsToInts returns a copy of value in which every float64 that is a
// whole number within +-2^53 is an int64, inside maps and slices at any depth.
// Other values are returned as they are; value itself is not changed.
func wholeFloatsToInts(value any) any {
	switch v := value.(type) {
	case float64:
		if v == math.Trunc(v) && math.Abs(v) <= maxExactFloatInt {
			return int64(v)
		}

		return v
	case map[string]any:
		converted := make(map[string]any, len(v))
		for key, item := range v {
			converted[key] = wholeFloatsToInts(item)
		}

		return converted
	case []any:
		converted := make([]any, len(v))
		for i, item := range v {
			converted[i] = wholeFloatsToInts(item)
		}

		return converted
	default:
		return value
	}
}

func (f *tomlFmt) WriteEnd(_ *FormatOptions) (string, error) { return "", nil }

func (f *tomlFmt) CreateReader(_ *FormatOptions) FormatReader {
	return &tomlReader{}
}

type tomlReader struct {
	buf strings.Builder
}

func (r *tomlReader) Push(chunk string) ([]any, error) {
	r.buf.WriteString(chunk)

	return nil, nil
}

func (r *tomlReader) Flush() ([]any, error) {
	text := strings.TrimSpace(r.buf.String())
	r.buf.Reset()

	if text == "" {
		return nil, nil
	}

	// Split on +++ document separator (WriteItem appends +++; bridge trims trailing one).
	// Appending "\n" before split normalises input that may lack a final newline.
	parts := strings.Split(text+"\n", "+++\n")

	var items []any

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		var result map[string]any
		if _, err := toml.Decode(part, &result); err != nil {
			return nil, newDeserializationError("toml", "failed to deserialize TOML: "+err.Error(), err)
		}

		items = append(items, result)
	}

	return items, nil
}
