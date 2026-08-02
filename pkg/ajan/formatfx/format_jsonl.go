// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx

import (
	"bufio"
	"encoding/json"
	"strings"
)

type jsonlFmt struct{}

// JSONLFormat is the built-in JSONL (newline-delimited JSON) format.
var JSONLFormat Format = &jsonlFmt{} //nolint:gochecknoglobals

func (f *jsonlFmt) Name() string         { return "jsonl" }
func (f *jsonlFmt) Extensions() []string { return []string{"jsonl", "ndjson"} }
func (f *jsonlFmt) Streamable() bool     { return true }

func (f *jsonlFmt) WriteStart(_ *FormatOptions) (string, error) { return "", nil }

func (f *jsonlFmt) WriteItem(data any, _ *FormatOptions) (string, error) {
	raw, err := json.Marshal(data)
	if err != nil {
		return "", newSerializationError("jsonl", "failed to serialize JSONL item: "+err.Error(), err)
	}

	return string(raw) + "\n", nil
}

func (f *jsonlFmt) WriteEnd(_ *FormatOptions) (string, error) { return "", nil }

func (f *jsonlFmt) CreateReader(_ *FormatOptions) FormatReader {
	return &jsonlReader{}
}

type jsonlReader struct {
	buf strings.Builder
}

func (r *jsonlReader) Push(chunk string) ([]any, error) {
	r.buf.WriteString(chunk)

	var items []any

	scanner := bufio.NewScanner(strings.NewReader(r.buf.String()))

	var remaining strings.Builder

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var item any
		if err := json.Unmarshal([]byte(line), &item); err != nil {
			// Incomplete line — keep in buffer for next Push
			remaining.WriteString(scanner.Text() + "\n")

			continue
		}

		items = append(items, item)
	}

	r.buf.Reset()
	r.buf.WriteString(remaining.String())

	return items, nil
}

func (r *jsonlReader) Flush() ([]any, error) {
	text := strings.TrimSpace(r.buf.String())
	r.buf.Reset()

	if text == "" {
		return nil, nil
	}

	var item any
	if err := json.Unmarshal([]byte(text), &item); err != nil {
		return nil, newDeserializationError("jsonl", "failed to deserialize JSONL: "+err.Error(), err)
	}

	return []any{item}, nil
}
