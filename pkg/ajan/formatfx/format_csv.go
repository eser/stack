// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"slices"
	"sort"
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

// CreateReader reads records with opts.Delimiter (a comma by default). The
// first record gives the header names unless opts.Headers has some.
func (f *csvFmt) CreateReader(opts *FormatOptions) FormatReader {
	reader := &csvReader{delimiter: ",", state: CSVReadState{}} //nolint:exhaustruct

	if opts != nil {
		if opts.Delimiter != 0 {
			reader.delimiter = string(opts.Delimiter)
		}

		if len(opts.Headers) > 0 {
			reader.state.Headers = slices.Clone(opts.Headers)
		}
	}

	return reader
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

// csvReader is the FormatReader of the CSV format, on ReadCSV. Its items are
// CSVRow values.
type csvReader struct {
	delimiter string
	state     CSVReadState
}

func (r *csvReader) Push(chunk string) ([]any, error) {
	return r.read(chunk, false)
}

func (r *csvReader) Flush() ([]any, error) {
	return r.read("", true)
}

func (r *csvReader) read(chunk string, final bool) ([]any, error) {
	rows, next, err := ReadCSV(r.state, chunk, r.delimiter, final)
	if err != nil {
		return nil, newDeserializationError("csv", "failed to deserialize CSV: "+err.Error(), err)
	}

	r.state = next

	items := make([]any, len(rows))
	for i, row := range rows {
		items[i] = row
	}

	return items, nil
}
