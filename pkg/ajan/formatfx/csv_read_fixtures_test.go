// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"testing"

	"github.com/eser/stack/pkg/ajan/formatfx"
)

// testdata/csv_read_cases.json was written from the answers of the TypeScript
// CSV reader of @eserstack/formats before it moved to Go. Its TypeScript tests
// run the same cases through the bridge.

type csvReadCall struct {
	Error *string           `json:"error"`
	Items []json.RawMessage `json:"items"`
}

type csvReadCase struct {
	Delimiter *string       `json:"delimiter"`
	Name      string        `json:"name"`
	Headers   []string      `json:"headers"`
	Chunks    []string      `json:"chunks"`
	Calls     []csvReadCall `json:"calls"`
}

func readCSVReadCases(t *testing.T) []csvReadCase {
	t.Helper()

	raw, err := os.ReadFile(filepath.Join("testdata", "csv_read_cases.json"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	var cases []csvReadCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("decode fixture: %v", err)
	}

	return cases
}

// field is one property of a JSON object.
type field struct {
	name  string
	value string
}

// objectFields reads the properties of a JSON object of strings in the order
// of the text.
func objectFields(t *testing.T, raw []byte) []field {
	t.Helper()

	dec := json.NewDecoder(bytes.NewReader(raw))
	if _, err := dec.Token(); err != nil {
		t.Fatalf("read object %s: %v", raw, err)
	}

	var fields []field

	for dec.More() {
		name, err := dec.Token()
		if err != nil {
			t.Fatalf("read key of %s: %v", raw, err)
		}

		var value string
		if err := dec.Decode(&value); err != nil {
			t.Fatalf("read value of %s: %v", raw, err)
		}

		fields = append(fields, field{name: name.(string), value: value}) //nolint:forcetypeassert
	}

	return fields
}

// isArrayIndex reports a key that a JavaScript object lists before all others,
// in ascending order: the canonical form of an integer below 2^32 - 1.
func isArrayIndex(name string) (uint64, bool) {
	n, err := strconv.ParseUint(name, 10, 32)
	if err != nil || n == 1<<32-1 || strconv.FormatUint(n, 10) != name {
		return 0, false
	}

	return n, true
}

// jsPropertyOrder orders fields as a JavaScript object lists its own keys:
// array indexes first, ascending, then the rest in insertion order. JSON.parse
// builds the TypeScript side's objects, so this is the order they have.
func jsPropertyOrder(fields []field) []field {
	ordered := slices.Clone(fields)
	slices.SortStableFunc(ordered, func(a, b field) int {
		ai, aIndex := isArrayIndex(a.name)
		bi, bIndex := isArrayIndex(b.name)

		switch {
		case aIndex && bIndex:
			return int(ai) - int(bi) //nolint:gosec
		case aIndex:
			return -1
		case bIndex:
			return 1
		default:
			return 0
		}
	})

	return ordered
}

func assertRows(t *testing.T, step int, got []formatfx.CSVRow, want []json.RawMessage) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("call %d: got %d rows, want %d: %+v", step, len(got), len(want), got)
	}

	for i, row := range got {
		raw, err := json.Marshal(row)
		if err != nil {
			t.Fatalf("call %d: marshal row %d: %v", step, i, err)
		}

		gotFields := jsPropertyOrder(objectFields(t, raw))
		wantFields := objectFields(t, want[i])

		if !slices.Equal(gotFields, wantFields) {
			t.Errorf("call %d row %d: got %+v, want %+v", step, i, gotFields, wantFields)
		}
	}
}

func TestReadCSVFixtures(t *testing.T) {
	t.Parallel()

	for _, tc := range readCSVReadCases(t) {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			delimiter := ","
			if tc.Delimiter != nil {
				delimiter = *tc.Delimiter
			}

			state := formatfx.CSVReadState{Headers: tc.Headers} //nolint:exhaustruct
			steps := append(slices.Clone(tc.Chunks), "")

			if len(tc.Calls) > len(steps) {
				t.Fatalf("the case has %d calls for %d steps", len(tc.Calls), len(steps))
			}

			for step, call := range tc.Calls {
				final := step == len(steps)-1

				rows, next, err := formatfx.ReadCSV(state, steps[step], delimiter, final)

				if call.Error != nil {
					if err == nil || err.Error() != *call.Error {
						t.Fatalf("call %d: got error %v, want %q", step, err, *call.Error)
					}

					return
				}

				if err != nil {
					t.Fatalf("call %d: %v", step, err)
				}

				assertRows(t, step, rows, call.Items)
				state = next
			}

			if state.Rest != "" {
				t.Errorf("rest after flush = %q, want empty", state.Rest)
			}
		})
	}
}

func TestReadCSVErrorTypes(t *testing.T) {
	t.Parallel()

	cases := []struct {
		check func(error) bool
		name  string
		text  string
		delim string
	}{
		{
			name:  "a bad delimiter is a CSVDelimiterError",
			text:  "a\n",
			delim: "",
			check: func(err error) bool { _, ok := errors.AsType[*formatfx.CSVDelimiterError](err); return ok },
		},
		{
			name:  "broken quoting is a CSVParseError numbered after the records already read",
			text:  "a\n\"b\"c\n",
			delim: ",",
			check: func(err error) bool {
				parseErr, ok := errors.AsType[*formatfx.CSVParseError](err)

				return ok && parseErr.Record == 5
			},
		},
		{
			name:  "a record of another width is a CSVFieldCountError",
			text:  "a,b\n1\n",
			delim: ",",
			check: func(err error) bool {
				countErr, ok := errors.AsType[*formatfx.CSVFieldCountError](err)

				return ok && countErr.Fields == 1 && countErr.HeaderFields == 2
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			state := formatfx.CSVReadState{Headers: nil, Rest: "", Records: 3}

			_, next, err := formatfx.ReadCSV(state, tc.text, tc.delim, true)
			if !tc.check(err) {
				t.Fatalf("unexpected error %v", err)
			}

			if next.Headers != nil || next.Rest != state.Rest || next.Records != state.Records {
				t.Errorf("state changed on error: %+v", next)
			}
		})
	}
}

func TestCSVReaderKeysRowsByHeader(t *testing.T) {
	t.Parallel()

	reader := formatfx.CSVFormat.CreateReader(&formatfx.FormatOptions{Delimiter: new(";")}) //nolint:exhaustruct

	pushed, err := reader.Push("b;a\n2;")
	if err != nil {
		t.Fatalf("Push: %v", err)
	}

	if len(pushed) != 0 {
		t.Fatalf("Push answered %v before the record ended", pushed)
	}

	flushed, err := reader.Flush()
	if err != nil {
		t.Fatalf("Flush: %v", err)
	}

	raw, err := json.Marshal(flushed)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	if string(raw) != `[{"b":"2","a":""}]` {
		t.Errorf("got %s", raw)
	}

	_, err = formatfx.CSVFormat.CreateReader(nil).Flush()
	if err != nil {
		t.Errorf("Flush of nothing: %v", err)
	}

	_, err = formatfx.CSVFormat.CreateReader(nil).Push("a\n\"x\"y\n")
	if !errors.Is(err, formatfx.ErrDeserialization) {
		t.Errorf("broken quoting: got %v, want ErrDeserialization", err)
	}
}
