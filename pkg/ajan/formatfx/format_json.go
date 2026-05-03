// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx

import (
	"encoding/json"
	"strings"
)

const defaultJSONIndent = 2

type jsonFmt struct{}

// JSONFormat is the built-in JSON format.
var JSONFormat Format = &jsonFmt{} //nolint:gochecknoglobals

func (f *jsonFmt) Name() string         { return "json" }
func (f *jsonFmt) Extensions() []string { return []string{"json"} }
func (f *jsonFmt) Streamable() bool     { return false }

func (f *jsonFmt) WriteStart(opts *FormatOptions) (string, error) {
	if opts != nil && opts.Pretty {
		return "[\n", nil
	}

	return "[", nil
}

func (f *jsonFmt) WriteItem(data any, opts *FormatOptions) (string, error) {
	var (
		raw []byte
		err error
	)

	if opts != nil && opts.Pretty {
		indent := opts.Indent
		if indent == 0 {
			indent = defaultJSONIndent
		}

		raw, err = json.MarshalIndent(data, "", strings.Repeat(" ", indent))
	} else {
		raw, err = json.Marshal(data)
	}

	if err != nil {
		return "", newSerializationError("json", "failed to serialize JSON: "+err.Error(), err)
	}

	if opts == nil || opts.IsFirst {
		return string(raw) + "\n", nil
	}

	if opts.Pretty {
		return ",\n" + string(raw) + "\n", nil
	}

	return "," + string(raw) + "\n", nil
}

func (f *jsonFmt) WriteEnd(opts *FormatOptions) (string, error) {
	if opts != nil && opts.Pretty {
		return "\n]\n", nil
	}

	return "]\n", nil
}

func (f *jsonFmt) CreateReader(_ *FormatOptions) FormatReader {
	return &jsonReader{}
}

type jsonReader struct {
	buf strings.Builder
}

func (r *jsonReader) Push(chunk string) ([]any, error) {
	r.buf.WriteString(chunk)

	return nil, nil
}

func (r *jsonReader) Flush() ([]any, error) {
	text := strings.TrimSpace(r.buf.String())
	r.buf.Reset()

	if text == "" {
		return nil, nil
	}

	var result any
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, newDeserializationError("json", "failed to deserialize JSON: "+err.Error(), err)
	}

	if arr, ok := result.([]any); ok {
		return arr, nil
	}

	return []any{result}, nil
}
