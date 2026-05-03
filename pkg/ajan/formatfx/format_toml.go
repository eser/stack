// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx

import (
	"bytes"
	"errors"
	"strings"

	"github.com/BurntSushi/toml"
)

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

func (f *tomlFmt) WriteItem(data any, _ *FormatOptions) (string, error) {
	// TOML root must be a table. Reject primitives and slices up front.
	if _, ok := data.(map[string]any); !ok {
		return "", newSerializationError("toml", ErrTOMLRootNotObject.Error(), ErrTOMLRootNotObject)
	}

	var buf bytes.Buffer
	enc := toml.NewEncoder(&buf)

	if err := enc.Encode(data); err != nil {
		return "", newSerializationError("toml", "failed to serialize TOML: "+err.Error(), err)
	}

	// Append +++ separator so multiple WriteItem calls produce splits the reader
	// can reassemble. The bridge trims the final +++ before decode.
	return buf.String() + "+++\n", nil
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
