package envparser_test

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/eser/stack/pkg/ajan/configfx/envparser"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The .env dialect shared with @std/dotenv (TASK-319): testdata/dialect.env
// gives the values in testdata/dialect.json here and through @std/dotenv in
// pkg/@eserstack/config/dotenv/dialect.test.ts.
func TestParseBytes_SharedDialect(t *testing.T) {
	t.Parallel()

	text, err := os.ReadFile("testdata/dialect.env")
	require.NoError(t, err)

	raw, err := os.ReadFile("testdata/dialect.json")
	require.NoError(t, err)

	var want map[string]string
	require.NoError(t, json.Unmarshal(raw, &want))

	got := make(map[string]any)
	require.NoError(t, envparser.ParseBytes(text, false, &got))

	gotText := make(map[string]string, len(got))
	for key, value := range got {
		gotText[key], _ = value.(string)
	}

	assert.Equal(t, want, gotText)
}

// The differences kept on purpose, documented in the configfx README.
func TestParseBytes_GoDialectExtensions(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name, input, key, want string
	}{
		{"dotted keys map nested config", "server.port=8080\n", "server.port", "8080"},
		{"a colon separates too", "KEY: value\n", "KEY", "value"},
		{"a # without a space before it stays in the value", "URL=http://x/#top\n", "URL", "http://x/#top"},
		{"an undefined name without a default is empty", "A=${ESER_DIALECT_UNSET_VARIABLE}\n", "A", ""},
		{"a self reference stops", "A=$A\n", "A", "$A"},
		{"export only as a word", "exported=1\n", "exported", "1"},
	}

	for _, tc := range cases {
		got := make(map[string]any)
		require.NoError(t, envparser.ParseBytes([]byte(tc.input), false, &got), tc.name)
		assert.Equal(t, tc.want, got[tc.key], tc.name)
	}
}
