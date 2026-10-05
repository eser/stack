package jsonparser_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/configfx/jsonparser"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTryParseFiles(t *testing.T) {
	t.Parallel()

	t.Run("should parse a json config file", func(t *testing.T) {
		t.Parallel()

		m := make(map[string]any) //nolint:varnamelen
		err := jsonparser.TryParseFiles(&m, "./testdata/config.json")

		require.NoError(t, err)
		assert.Equal(t, "env", m["test"])
		assert.Equal(t, "env!", m["test2__test3"])
		assert.Empty(t, m["test4"])
		assert.Empty(t, m["test5__a"])
		assert.Empty(t, m["test5__b"])
		assert.NotContains(t, m, "test5__c")
		// assert.Equal(t, []any{"a", "b"}, m["test5"])
		// assert.Equal(t, float64(6), m["test6"])
		assert.Equal(t, "6", m["test6"])
	})

	t.Run("should parse multiple json config files", func(t *testing.T) {
		t.Parallel()

		m := make(map[string]any) //nolint:varnamelen
		err := jsonparser.TryParseFiles(
			&m,
			"./testdata/config.json",
			"./testdata/config.development.json",
		)

		require.NoError(t, err)
		assert.Equal(t, "env-development", m["test"])
		assert.Equal(t, "env!!", m["test2__test3"])
		assert.Empty(t, m["test4"])
		assert.Empty(t, m["test5__a"])
		assert.Empty(t, m["test5__b"])
		assert.Empty(t, m["test5__c"])
		// The second file's array merges into the first by index.
		assert.Equal(t, "c", m["test5__0"])
		assert.Equal(t, "b", m["test5__1"])
		// assert.Equal(t, []any{"c"}, m["test5"])
		// assert.Equal(t, float64(6), m["test6"])
		assert.Equal(t, "6", m["test6"])
	})
}

// TestParseBytes checks how values are flattened: numbers keep their text,
// arrays become indexed keys, and null and empty arrays mark the key.
func TestParseBytes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		initial  map[string]any
		json     string
		expected map[string]any
	}{
		{
			name:     "numbers keep the text they were written with",
			initial:  map[string]any{},
			json:     `{"bytes": 1048576, "ratio": 0.000001, "count": 6}`,
			expected: map[string]any{"bytes": "1048576", "ratio": "0.000001", "count": "6"},
		},
		{
			name:     "arrays become indexed keys and null items leave gaps",
			initial:  map[string]any{},
			json:     `{"paths": ["/a", null, "/c"], "items": [{"name": "x"}]}`,
			expected: map[string]any{"paths__0": "/a", "paths__2": "/c", "items__0__name": "x"},
		},
		{
			name:     "an empty array sets an empty value",
			initial:  map[string]any{},
			json:     `{"paths": []}`,
			expected: map[string]any{"paths": ""},
		},
		{
			name:     "an array removes an earlier value at its own key and merges items by index",
			initial:  map[string]any{"PATHS": "/env", "paths__1": "/old"},
			json:     `{"paths": ["/new"]}`,
			expected: map[string]any{"paths__0": "/new", "paths__1": "/old"},
		},
		{
			name:     "null removes the key and every key under it",
			initial:  map[string]any{"name": "app", "db__host": "h", "db__port": "1", "dbx": "kept"},
			json:     `{"name": null, "db": null}`,
			expected: map[string]any{"dbx": "kept"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			out := tt.initial

			require.NoError(t, jsonparser.ParseBytes([]byte(tt.json), &out))
			assert.Equal(t, tt.expected, out)
		})
	}
}

// TestParseBytes_RejectsInvalidInput checks that malformed JSON and data
// after the top-level object are errors.
func TestParseBytes_RejectsInvalidInput(t *testing.T) {
	t.Parallel()

	for _, input := range []string{`{"name": "app"`, `{"a": 1} {"b": 2}`, `{"a": 1} trailing`, `["not", "an", "object"]`} {
		t.Run(input, func(t *testing.T) {
			t.Parallel()

			out := map[string]any{}

			err := jsonparser.ParseBytes([]byte(input), &out)
			require.ErrorIs(t, err, jsonparser.ErrParsingError)
		})
	}
}
