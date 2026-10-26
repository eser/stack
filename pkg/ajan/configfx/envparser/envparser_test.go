package envparser_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/configfx/envparser"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTryParseFiles(t *testing.T) {
	t.Parallel()

	t.Run("should parse a .env file", func(t *testing.T) {
		t.Parallel()

		m := make(map[string]any)
		err := envparser.TryParseFiles(&m, true, "./testdata/.env")

		require.NoError(t, err)
		assert.Equal(t, "env", m["TEST"])
	})

	t.Run("should parse multiple .env files", func(t *testing.T) {
		t.Parallel()

		m := make(map[string]any)
		err := envparser.TryParseFiles(&m, true, "./testdata/.env", "./testdata/.env.development")

		require.NoError(t, err)
		assert.Equal(t, "env-development", m["TEST"])
	})
}
