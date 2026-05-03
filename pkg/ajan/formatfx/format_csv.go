// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"sort"
	"strings"
)

type csvFmt struct{}

// CSVFormat is the built-in CSV format.
var CSVFormat Format = &csvFmt{} //nolint:gochecknoglobals

func (f *csvFmt) Name() string         { return "csv" }
func (f *csvFmt) Extensions() []string { return []string{"csv"} }
func (f *csvFmt) Streamable() bool     { return true }

func (f *csvFmt) WriteStart(opts *FormatOptions) (string, error) {
	if opts == nil || len(opts.Headers) == 0 {
		return "", nil
	}

	var buf bytes.Buffer
	w := csv.NewWriter(&buf)

	if opts.Delimiter != 0 {
		w.Comma = opts.Delimiter
	}

	if err := w.Write(opts.Headers); err != nil {
		return "", newSerializationError("csv", "failed to write CSV headers: "+err.Error(), err)
	}

	w.Flush()

	return buf.String(), nil
}

func (f *csvFmt) WriteItem(data any, opts *FormatOptions) (string, error) {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)

	if opts != nil && opts.Delimiter != 0 {
		w.Comma = opts.Delimiter
	}

	// Auto-emit a sorted header row from map keys on the first item.
	if opts != nil && opts.IsFirst {
		if m, ok := data.(map[string]any); ok {
			headers := sortedMapKeys(m)
			if err := w.Write(headers); err != nil {
				return "", newSerializationError("csv", "failed to write CSV headers: "+err.Error(), err)
			}
		}
	}

	row := toCSVRow(data, opts)

	if err := w.Write(row); err != nil {
		return "", newSerializationError("csv", "failed to write CSV row: "+err.Error(), err)
	}

	w.Flush()

	return buf.String(), nil
}

func (f *csvFmt) WriteEnd(_ *FormatOptions) (string, error) { return "", nil }

func (f *csvFmt) CreateReader(opts *FormatOptions) FormatReader {
	return &csvReader{opts: opts}
}

// sortedMapKeys returns the keys of m sorted alphabetically.
// CSV header and data rows use the same order so they align correctly.
func sortedMapKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	return keys
}

// toCSVRow converts a value to a slice of strings for CSV encoding.
func toCSVRow(data any, opts *FormatOptions) []string {
	switch v := data.(type) {
	case []string:
		return v
	case map[string]any:
		if opts != nil && len(opts.Headers) > 0 {
			row := make([]string, len(opts.Headers))
			for i, h := range opts.Headers {
				if val, ok := v[h]; ok {
					row[i] = fmt.Sprintf("%v", val)
				}
			}

			return row
		}

		// Sort keys so the data row aligns with the header row emitted by WriteItem.
		keys := sortedMapKeys(v)
		row := make([]string, len(keys))

		for i, k := range keys {
			row[i] = fmt.Sprintf("%v", v[k])
		}

		return row
	case []any:
		row := make([]string, len(v))
		for i, val := range v {
			row[i] = fmt.Sprintf("%v", val)
		}

		return row
	default:
		return []string{fmt.Sprintf("%v", v)}
	}
}

type csvReader struct {
	opts    *FormatOptions
	buf     strings.Builder
	headers []string // set on first row, reused for subsequent calls
}

func (r *csvReader) Push(chunk string) ([]any, error) {
	r.buf.WriteString(chunk)

	return r.parseComplete()
}

func (r *csvReader) Flush() ([]any, error) {
	text := r.buf.String()
	r.buf.Reset()

	if strings.TrimSpace(text) == "" {
		return nil, nil
	}

	return r.parseText(text)
}

func (r *csvReader) parseComplete() ([]any, error) {
	text := r.buf.String()
	lastNewline := strings.LastIndexByte(text, '\n')

	if lastNewline < 0 {
		return nil, nil
	}

	complete := text[:lastNewline+1]
	remaining := text[lastNewline+1:]

	r.buf.Reset()
	r.buf.WriteString(remaining)

	return r.parseText(complete)
}

func (r *csvReader) parseText(text string) ([]any, error) {
	rd := csv.NewReader(strings.NewReader(text))

	if r.opts != nil && r.opts.Delimiter != 0 {
		rd.Comma = r.opts.Delimiter
	}

	records, err := rd.ReadAll()
	if err != nil {
		return nil, newDeserializationError("csv", "failed to deserialize CSV: "+err.Error(), err)
	}

	if len(records) == 0 {
		return nil, nil
	}

	// Resolve the header row to use for key mapping.
	// Priority: already-seen headers > caller-provided opts.Headers > auto-detect from first record.
	dataStart := 0
	if r.headers == nil {
		if r.opts != nil && len(r.opts.Headers) > 0 {
			// Caller provided headers: first record in text is a data row.
			r.headers = r.opts.Headers
		} else {
			// Auto-detect: treat first record as header row.
			r.headers = records[0]
			dataStart = 1
		}
	}

	items := make([]any, 0, len(records)-dataStart)

	for _, rec := range records[dataStart:] {
		row := make(map[string]string, len(r.headers))
		for i, h := range r.headers {
			if i < len(rec) {
				row[h] = rec[i]
			}
		}
		items = append(items, row)
	}

	return items, nil
}
