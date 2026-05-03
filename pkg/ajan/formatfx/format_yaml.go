// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx

import (
	"errors"
	"io"
	"strings"

	"gopkg.in/yaml.v3"
)

type yamlFmt struct{}

// YAMLFormat is the built-in YAML format.
var YAMLFormat Format = &yamlFmt{} //nolint:gochecknoglobals

func (f *yamlFmt) Name() string         { return "yaml" }
func (f *yamlFmt) Extensions() []string { return []string{"yaml", "yml"} }
func (f *yamlFmt) Streamable() bool     { return true }

func (f *yamlFmt) WriteStart(_ *FormatOptions) (string, error) { return "", nil }

func (f *yamlFmt) WriteItem(data any, _ *FormatOptions) (string, error) {
	// Wrap each item in a one-element slice so consecutive WriteItem calls
	// produce adjacent YAML sequence entries that the reader reassembles.
	wrapped := []any{data}
	raw, err := yaml.Marshal(wrapped)
	if err != nil {
		return "", newSerializationError("yaml", "failed to serialize YAML: "+err.Error(), err)
	}

	return string(raw), nil
}

func (f *yamlFmt) WriteEnd(_ *FormatOptions) (string, error) { return "", nil }

func (f *yamlFmt) CreateReader(_ *FormatOptions) FormatReader {
	return &yamlReader{}
}

type yamlReader struct {
	buf strings.Builder
}

func (r *yamlReader) Push(chunk string) ([]any, error) {
	r.buf.WriteString(chunk)

	return nil, nil
}

func (r *yamlReader) Flush() ([]any, error) {
	text := strings.TrimSpace(r.buf.String())
	r.buf.Reset()

	if text == "" {
		return nil, nil
	}

	decoder := yaml.NewDecoder(strings.NewReader(text))

	var items []any

	for {
		var item any
		if err := decoder.Decode(&item); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}

			return nil, newDeserializationError("yaml", "failed to deserialize YAML: "+err.Error(), err)
		}

		// Expand top-level sequences produced by WriteItem's wrapping strategy.
		if seq, ok := item.([]any); ok {
			items = append(items, seq...)
		} else if item != nil {
			items = append(items, item)
		}
	}

	return items, nil
}
