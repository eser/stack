// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

// The CSV reader of @eserstack/formats, moved from TypeScript (TASK-267). It
// reads RFC 4180 text that arrives in chunks: LF or CRLF row endings, quoted
// fields across line breaks and across chunks, blank lines skipped. Its
// answers and messages match the TypeScript reader word for word, which the
// shared fixtures in testdata/csv_read_cases.json check on both sides.

const (
	csvQuote = '"'
	csvCR    = '\r'
	csvLF    = '\n'
)

// protoKey is the one header name a JavaScript object built by assignment
// does not keep: assigning a string to __proto__ changes nothing.
const protoKey = "__proto__"

// CSVReadState is what a CSV reader carries from one chunk to the next. The
// zero value starts a reader that takes its header names from the first
// record.
type CSVReadState struct {
	// Rest is the text of the record still open at the end of the last chunk.
	Rest string
	// Headers are the names that key each record: nil until the header row is
	// read, and a non-nil empty slice for a header of no fields.
	Headers []string
	// Records counts the records read so far, blank lines included; an error
	// names its record by this count.
	Records int
}

// CSVRow is one record keyed by the header names, in header order. A name
// that repeats keeps its first position and its last value, and __proto__ is
// left out, as in the object the TypeScript reader built by assignment.
type CSVRow struct {
	Names  []string
	Values []string
}

// Get returns the value under name and whether the row has it.
func (r CSVRow) Get(name string) (string, bool) {
	for i, n := range r.Names {
		if n == name {
			return r.Values[i], true
		}
	}

	return "", false
}

// MarshalJSON writes the row as a JSON object with its keys in order.
func (r CSVRow) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer

	buf.WriteByte('{')

	for i, name := range r.Names {
		if i > 0 {
			buf.WriteByte(',')
		}

		key, err := json.Marshal(name)
		if err != nil {
			return nil, fmt.Errorf("marshal CSV header %q: %w", name, err)
		}

		value, err := json.Marshal(r.Values[i])
		if err != nil {
			return nil, fmt.Errorf("marshal CSV value of %q: %w", name, err)
		}

		buf.Write(key)
		buf.WriteByte(':')
		buf.Write(value)
	}

	buf.WriteByte('}')

	return buf.Bytes(), nil
}

// CSVParseError reports CSV text that breaks the quoting rules of RFC 4180.
type CSVParseError struct {
	Reason string
	// Record is the 1-based number of the record that failed, blank lines
	// included.
	Record int
}

func (e *CSVParseError) Error() string {
	return fmt.Sprintf("CSV record %d: %s", e.Record, e.Reason)
}

// CSVDelimiterError reports a delimiter that cannot separate fields: it is
// empty or holds a quote, CR or LF.
type CSVDelimiterError struct {
	Delimiter string
}

func (e *CSVDelimiterError) Error() string {
	return fmt.Sprintf("CSV delimiter %s must be non-empty and hold no quote, CR or LF", jsQuote(e.Delimiter))
}

// CSVFieldCountError reports a record whose field count differs from the
// header's.
type CSVFieldCountError struct {
	Fields       int
	HeaderFields int
}

func (e *CSVFieldCountError) Error() string {
	return fmt.Sprintf("The record has %d fields, but the header has %d fields", e.Fields, e.HeaderFields)
}

// ReadCSV adds chunk to the text that state carries and returns the rows it
// completes, with the state for the next call. With final set, the input
// ends: the record left open is read too, and the next state carries no
// text. Until the header names are known, the first record that is not blank
// gives them, trimmed of JavaScript's whitespace.
//
// On an error the state is returned unchanged. The errors are
// *CSVDelimiterError, *CSVParseError and *CSVFieldCountError.
func ReadCSV(state CSVReadState, chunk, delimiter string, final bool) ([]CSVRow, CSVReadState, error) {
	if err := checkCSVDelimiter(delimiter); err != nil {
		return nil, state, err
	}

	text := state.Rest + chunk
	next := state
	records := make([][]string, 0)
	offset := 0

	for offset < len(text) {
		record, complete, err := parseCSVRecord(text, offset, delimiter, final, next.Records+1)
		if err != nil {
			return nil, state, err
		}

		if !complete {
			break
		}

		next.Records++
		offset = record.end

		if !record.blank {
			records = append(records, record.fields)
		}
	}

	// A record still open is read again from its start with the next chunk.
	next.Rest = text[offset:]

	rows := make([]CSVRow, 0, len(records))

	for _, fields := range records {
		if next.Headers == nil {
			headers := make([]string, len(fields))
			for i, name := range fields {
				headers[i] = strings.TrimFunc(name, isJSWhitespace)
			}

			next.Headers = headers

			continue
		}

		if len(fields) != len(next.Headers) {
			return nil, state, &CSVFieldCountError{Fields: len(fields), HeaderFields: len(next.Headers)}
		}

		rows = append(rows, newCSVRow(next.Headers, fields))
	}

	return rows, next, nil
}

// newCSVRow keys fields by headers as an assignment per header would.
func newCSVRow(headers, fields []string) CSVRow {
	row := CSVRow{Names: make([]string, 0, len(headers)), Values: make([]string, 0, len(headers))}
	positions := make(map[string]int, len(headers))

	for i, name := range headers {
		if name == protoKey {
			continue
		}

		if at, seen := positions[name]; seen {
			row.Values[at] = fields[i]

			continue
		}

		positions[name] = len(row.Names)
		row.Names = append(row.Names, name)
		row.Values = append(row.Values, fields[i])
	}

	return row
}

func checkCSVDelimiter(delimiter string) error {
	if delimiter == "" || strings.ContainsAny(delimiter, "\"\r\n") {
		return &CSVDelimiterError{Delimiter: delimiter}
	}

	return nil
}

// csvRecord is one record read from the text.
type csvRecord struct {
	fields []string
	// end is the offset after the record and its line ending.
	end int
	// blank is a record with no quotes and only whitespace.
	blank bool
}

// csvRecordParser reads one record that starts at start.
type csvRecordParser struct {
	text      string
	delimiter string
	fields    []string
	field     strings.Builder
	record    int
	final     bool
	quoted    bool
}

// parseCSVRecord reads the record that starts at start. It reports the record
// incomplete when the text ends before the record does and more input may
// follow (final false). Offsets are bytes: the delimiter, quote, CR and LF are
// matched as whole UTF-8 sequences, so the records match the ones the
// TypeScript reader found in UTF-16 units.
func parseCSVRecord(text string, start int, delimiter string, final bool, record int) (csvRecord, bool, error) {
	p := &csvRecordParser{ //nolint:exhaustruct
		text:      text,
		delimiter: delimiter,
		record:    record,
		final:     final,
	}

	return p.parse(start)
}

// partial reports that the text ends inside what may become a delimiter.
func (p *csvRecordParser) partial(from int) bool {
	return !p.final && len(p.text)-from < len(p.delimiter) &&
		strings.HasPrefix(p.delimiter, p.text[from:])
}

func (p *csvRecordParser) finish(end int) (csvRecord, bool, error) {
	p.fields = append(p.fields, p.field.String())
	blank := !p.quoted && strings.TrimFunc(strings.Join(p.fields, p.delimiter), isJSWhitespace) == ""

	return csvRecord{fields: p.fields, end: end, blank: blank}, true, nil
}

// endOfInput answers at the end of the text: the record ends there when the
// input is final, and stays open otherwise.
func (p *csvRecordParser) endOfInput(end int) (csvRecord, bool, error) {
	if p.final {
		return p.finish(end)
	}

	return csvRecord{}, false, nil //nolint:exhaustruct
}

func (p *csvRecordParser) fail(reason string) (csvRecord, bool, error) {
	return csvRecord{}, false, &CSVParseError{Reason: reason, Record: p.record} //nolint:exhaustruct
}

// lineEnd answers for a CR or LF at i: the record ends after it, or the text
// ends between CR and LF. The third result is false, and the others unset,
// for any other byte and for a CR that no LF follows.
func (p *csvRecordParser) lineEnd(i int) (csvRecord, bool, bool, error) {
	switch p.text[i] {
	case csvLF:
		record, complete, err := p.finish(i + 1)

		return record, complete, true, err
	case csvCR:
		if i+1 >= len(p.text) {
			record, complete, err := p.endOfInput(i + 1)

			return record, complete, true, err
		}

		if p.text[i+1] == csvLF {
			record, complete, err := p.finish(i + 2)

			return record, complete, true, err
		}
	}

	return csvRecord{}, false, false, nil //nolint:exhaustruct
}

func (p *csvRecordParser) parse(start int) (csvRecord, bool, error) {
	text := p.text
	i := start

	for {
		// At the start of a field.
		if i < len(text) && text[i] == csvQuote {
			p.quoted = true
			i++

			// Inside the quoted field, up to its closing quote.
			for {
				if i >= len(text) {
					if p.final {
						return p.fail("unterminated quoted field")
					}

					return csvRecord{}, false, nil //nolint:exhaustruct
				}

				if text[i] != csvQuote {
					p.field.WriteByte(text[i])
					i++

					continue
				}

				if i+1 >= len(text) && !p.final {
					// A doubled quote may be split across chunks.
					return csvRecord{}, false, nil //nolint:exhaustruct
				}

				if i+1 < len(text) && text[i+1] == csvQuote {
					p.field.WriteByte(csvQuote)
					i += 2

					continue
				}

				i++

				break
			}

			// After the closing quote: a delimiter, a line ending or the end.
			if i >= len(text) {
				return p.endOfInput(i)
			}

			if strings.HasPrefix(text[i:], p.delimiter) {
				p.fields = append(p.fields, p.field.String())
				p.field.Reset()
				i += len(p.delimiter)

				continue
			}

			if record, complete, ok, err := p.lineEnd(i); ok {
				return record, complete, err
			}

			if p.partial(i) {
				return csvRecord{}, false, nil //nolint:exhaustruct
			}

			return p.fail("text after a closing quote")
		}

		// Inside an unquoted field, up to a delimiter or a line ending.
		for {
			if i >= len(text) {
				return p.endOfInput(i)
			}

			if strings.HasPrefix(text[i:], p.delimiter) {
				break
			}

			if record, complete, ok, err := p.lineEnd(i); ok {
				return record, complete, err
			}

			if text[i] == csvQuote {
				return p.fail("a quote inside an unquoted field")
			}

			if p.partial(i) {
				return csvRecord{}, false, nil //nolint:exhaustruct
			}

			p.field.WriteByte(text[i])
			i++
		}

		p.fields = append(p.fields, p.field.String())
		p.field.Reset()
		i += len(p.delimiter)
	}
}

// isJSWhitespace reports the characters String.prototype.trim removes:
// ECMAScript's WhiteSpace and LineTerminator. It differs from unicode.IsSpace
// in U+FEFF (trimmed here) and U+0085 (kept here).
func isJSWhitespace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', '\u00a0', '\u1680', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff':
		return true
	}

	return r >= '\u2000' && r <= '\u200a'
}

// jsQuote writes s as JSON.stringify writes a string: quotes, backslashes and
// control characters escaped, everything else as it is.
func jsQuote(s string) string {
	var b strings.Builder

	b.WriteByte('"')

	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				fmt.Fprintf(&b, `\u%04x`, r)
			} else {
				b.WriteRune(r)
			}
		}
	}

	b.WriteByte('"')

	return b.String()
}
