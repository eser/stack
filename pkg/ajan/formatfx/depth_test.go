// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/formatfx"
)

// deserialize decodes text with the named format's reader, as the bridge does,
// and reports the decode error.
func deserialize(text, format string) error {
	formatfx.RegisterBuiltinFormats()

	f, err := formatfx.GetFormat(format)
	if err != nil {
		return err
	}

	reader := f.CreateReader(nil)
	if _, err := reader.Push(text); err != nil {
		return err
	}

	_, err = reader.Flush()

	return err
}

func nestedJSON(levels int) string {
	return strings.Repeat("[", levels) + "1" + strings.Repeat("]", levels)
}

func nestedTOML(levels int) string {
	return "v = " + nestedJSON(levels) + "\n"
}

func nestedYAMLBlock(levels int) string {
	var b strings.Builder
	for i := range levels {
		b.WriteString(strings.Repeat(" ", i) + "k:\n")
	}
	b.WriteString(strings.Repeat(" ", levels) + "v: 1\n")

	return b.String()
}

func TestDecodeRejectsNestingOverTheLimit(t *testing.T) {
	t.Parallel()

	limit := formatfx.MaxNestingDepth

	cases := []struct {
		format string
		under  string
		over   string
	}{
		{"json", nestedJSON(limit), nestedJSON(limit + 1)},
		{"jsonl", nestedJSON(limit), nestedJSON(limit + 1)},
		// The top-level table is a level of its own.
		{"toml", nestedTOML(limit - 1), nestedTOML(limit + 1)},
		{"yaml", nestedJSON(limit), nestedJSON(limit + 1)},
		// Block mappings: one key per level, then the leaf mapping.
		{"yaml", nestedYAMLBlock(limit - 1), nestedYAMLBlock(limit)},
	}

	for _, tc := range cases {
		t.Run(tc.format, func(t *testing.T) {
			t.Parallel()

			if err := deserialize(tc.under, tc.format); err != nil {
				t.Fatalf("%d levels should decode: %v", limit, err)
			}

			err := deserialize(tc.over, tc.format)
			if !errors.Is(err, formatfx.ErrNestingTooDeep) {
				t.Fatalf("one level over the limit: expected ErrNestingTooDeep, got %v", err)
			}

			if !strings.Contains(err.Error(), "more than 1000 levels") {
				t.Errorf("the error should name the limit: %v", err)
			}
		})
	}
}

func TestCheckJSONDepthIgnoresBracketsInStrings(t *testing.T) {
	t.Parallel()

	text := `{"a": "` + strings.Repeat("[", 5000) + `\"]"}`
	if err := formatfx.CheckJSONDepth(text); err != nil {
		t.Errorf("brackets inside a string must not count: %v", err)
	}
}
