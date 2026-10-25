// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx

import (
	"bytes"
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

// WriteStart opens the array. A whole document (opts.Document) has no array
// to open.
func (f *jsonFmt) WriteStart(opts *FormatOptions) (string, error) {
	if opts != nil && opts.Document {
		return "", nil
	}

	return "[", nil
}

// WriteItem writes data as JSON.stringify does: a whole document
// (opts.Document) on its own followed by a newline, and an array element with
// "," before every element but the first. With opts.Pretty, each element
// starts on a new line, indented one level.
func (f *jsonFmt) WriteItem(data any, opts *FormatOptions) (string, error) {
	if opts == nil {
		opts = &FormatOptions{} //nolint:exhaustruct
	}

	indent := jsonIndent(opts)

	if opts.Document {
		raw, err := encodeJSON(data, "", indent)
		if err != nil {
			return "", newSerializationError("json", "failed to serialize JSON: "+err.Error(), err)
		}

		return raw + "\n", nil
	}

	// Every line after the first gets the element's own indentation as prefix,
	// so a pretty element sits one level inside the array.
	raw, err := encodeJSON(data, indent, indent)
	if err != nil {
		return "", newSerializationError("json", "failed to serialize JSON: "+err.Error(), err)
	}

	separator := ","
	if opts.IsFirst {
		separator = ""
	}

	if indent == "" {
		return separator + raw, nil
	}

	return separator + "\n" + indent + raw, nil
}

// WriteEnd closes the array, with "]" on its own line when opts.Pretty is
// set. A whole document (opts.Document) has no array to close.
func (f *jsonFmt) WriteEnd(opts *FormatOptions) (string, error) {
	switch {
	case opts == nil:
		return "]\n", nil
	case opts.Document:
		return "", nil
	case opts.Pretty:
		return "\n]\n", nil
	default:
		return "]\n", nil
	}
}

func (f *jsonFmt) CreateReader(_ *FormatOptions) FormatReader {
	return &jsonReader{}
}

// jsonIndent returns one level of indentation for pretty output, or "" for
// compact output.
func jsonIndent(opts *FormatOptions) string {
	if !opts.Pretty {
		return ""
	}

	width := opts.Indent
	if width <= 0 {
		width = defaultJSONIndent
	}

	return strings.Repeat(" ", width)
}

// encodeJSON marshals data without the trailing newline json.Encoder adds.
// It leaves "<", ">" and "&" unescaped, as JSON.stringify does. A non-empty
// indent lays the value out over several lines, each after the first starting
// with prefix. Callers wrap the error in a SerializationError.
func encodeJSON(data any, prefix, indent string) (string, error) {
	var buf bytes.Buffer

	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)

	if indent != "" {
		enc.SetIndent(prefix, indent)
	}

	if err := enc.Encode(data); err != nil {
		return "", err
	}

	return strings.TrimSuffix(buf.String(), "\n"), nil
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

	if err := CheckJSONDepth(text); err != nil {
		return nil, newDeserializationError("json", "failed to deserialize JSON: "+err.Error(), err)
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
