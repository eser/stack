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
		// assert.Equal(t, []any{"c"}, m["test5"])
		// assert.Equal(t, float64(6), m["test6"])
		assert.Equal(t, "6", m["test6"])
	})
}
