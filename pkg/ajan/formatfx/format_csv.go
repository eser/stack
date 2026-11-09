// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"slices"
	"sort"
	"unicode/utf8"
)

// ErrCSVWriteDelimiter reports a CSV delimiter of more than one character
// given to the writer, which encoding/csv cannot write with. ReadCSV reads
// such a delimiter.
var ErrCSVWriteDelimiter = errors.New("CSV delimiter must be one character to write")

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

	w, buf, err := newCSVWriter(opts)
	if err != nil {
		return "", err
	}

	if err := w.Write(opts.Headers); err != nil {
		return "", newSerializationError("csv", "failed to write CSV headers: "+err.Error(), err)
	}

	w.Flush()

	return buf.String(), nil
}

func (f *csvFmt) WriteItem(data any, opts *FormatOptions) (string, error) {
	w, buf, err := newCSVWriter(opts)
	if err != nil {
		return "", err
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

// newCSVWriter answers a writer that separates fields with opts.Delimiter, a
// comma when it is nil. The delimiter must pass ReadCSV's check and be one
// character, the only kind encoding/csv writes with.
func newCSVWriter(opts *FormatOptions) (*csv.Writer, *bytes.Buffer, error) {
	buf := &bytes.Buffer{}
	w := csv.NewWriter(buf)

	if opts == nil || opts.Delimiter == nil {
		return w, buf, nil
	}

	delimiter := *opts.Delimiter
	if err := checkCSVDelimiter(delimiter); err != nil {
		return nil, nil, newSerializationError("csv", "failed to write CSV: "+err.Error(), err)
	}

	comma, size := utf8.DecodeRuneInString(delimiter)
	if size != len(delimiter) {
		msg := fmt.Sprintf("failed to write CSV: CSV delimiter %s must be one character", jsQuote(delimiter))

		return nil, nil, newSerializationError("csv", msg, ErrCSVWriteDelimiter)
	}

	w.Comma = comma

	return w, buf, nil
}

// CreateReader reads records with opts.Delimiter (a comma when it is nil);
// Push and Flush return ReadCSV's *CSVDelimiterError for one it refuses. The
// first record gives the header names unless opts.Headers has some.
func (f *csvFmt) CreateReader(opts *FormatOptions) FormatReader {
	reader := &csvReader{delimiter: ",", state: CSVReadState{}} //nolint:exhaustruct

	if opts != nil {
		if opts.Delimiter != nil {
			reader.delimiter = *opts.Delimiter
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
