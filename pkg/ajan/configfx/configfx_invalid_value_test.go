package configfx_test

import (
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/configfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestLoad_InvalidOverrideIsRejected pins the failure this package used to have
// in its most damaging form: an invalid override was not merely ignored, it BEAT
// the declared default and assigned the zero value, reporting success.
//
// Zero is not inert here. net/http reads a zero Read/WriteTimeout as "no
// timeout at all", so a typo in a deploy environment silently removed the
// timeouts it was meant to set, and nothing anywhere reported it.
func TestLoad_InvalidOverrideIsRejected(t *testing.T) {
	t.Parallel()

	type serverConfig struct {
		Port        int           `conf:"port"         default:"8080"`
		Debug       bool          `conf:"debug"        default:"false"`
		ReadTimeout time.Duration `conf:"read_timeout" default:"30s"`
	}

	for _, testCase := range []struct {
		name string
		json string
		key  string
	}{
		{name: "int", json: `{"port": "not-a-number"}`, key: `key="port"`},
		{name: "bool", json: `{"debug": "yes-please"}`, key: `key="debug"`},
		{name: "duration", json: `{"read_timeout": "30"}`, key: `key="read_timeout"`},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			cfg := serverConfig{} //nolint:exhaustruct
			cl := configfx.NewConfigManager()

			err := cl.Load(&cfg, cl.FromJSONString(testCase.json))

			require.Error(t, err)
			require.ErrorIs(t, err, configfx.ErrInvalidConfigValue)
			assert.Contains(t, err.Error(), testCase.key)
		})
	}
}

// TestLoad_ValidValuesStillLoad guards against over-correcting: rejecting bad
// input must not start rejecting good input, including the declared defaults.
func TestLoad_ValidValuesStillLoad(t *testing.T) {
	t.Parallel()

	type serverConfig struct {
		Port        int           `conf:"port"         default:"8080"`
		Debug       bool          `conf:"debug"        default:"false"`
		ReadTimeout time.Duration `conf:"read_timeout" default:"30s"`
	}

	cfg := serverConfig{} //nolint:exhaustruct
	cl := configfx.NewConfigManager()

	err := cl.Load(&cfg, cl.FromJSONString(`{"port": 9000, "debug": true}`))

	require.NoError(t, err)
	assert.Equal(t, 9000, cfg.Port)
	assert.True(t, cfg.Debug)
	// Untouched by the override, so it must come from the struct tag.
	assert.Equal(t, 30*time.Second, cfg.ReadTimeout)
}
