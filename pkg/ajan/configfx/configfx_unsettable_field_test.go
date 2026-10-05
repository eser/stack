package configfx_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/configfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type unexportedFieldConfig struct {
	Name string `conf:"name"`
	// Unexported on purpose: reflect cannot assign it.
	secret string `conf:"secret"` //nolint:unused // assigned through reflection only
}

type unexportedMapConfig struct {
	labels map[string]string `conf:"labels"` //nolint:unused // assigned through reflection only
}

type unexportedNestedConfig struct {
	Name  string   `conf:"name"`
	inner struct { //nolint:unused // assigned through reflection only
		Value string `conf:"value"`
	} `conf:"inner"`
}

type EmbeddedBase struct {
	Host string `conf:"host" default:"localhost"`
}

type embeddedPointerConfig struct {
	*EmbeddedBase

	Port int `conf:"port" default:"8080"`
}

type embeddedUnexportedBase struct {
	Region string `conf:"region"`
}

type embeddedUnexportedConfig struct {
	embeddedUnexportedBase

	Zone string `conf:"zone"`
}

// TestLoad_UnsettableFieldIsRejected pins the panic reflectSetField used to
// have: field.Set ran without a CanSet check, so a conf tag on an unexported
// field crashed the process inside Load instead of returning an error.
func TestLoad_UnsettableFieldIsRejected(t *testing.T) {
	t.Parallel()

	cases := []struct {
		target  func() any
		name    string
		json    string
		wantKey string
	}{
		{
			name:    "unexported field with a value",
			target:  func() any { return &unexportedFieldConfig{} },
			json:    `{"name": "app", "secret": "s3cr3t"}`,
			wantKey: `key="secret"`,
		},
		{
			name:    "unexported field without a value",
			target:  func() any { return &unexportedFieldConfig{} },
			json:    `{"name": "app"}`,
			wantKey: `key="secret"`,
		},
		{
			name:    "unexported map field",
			target:  func() any { return &unexportedMapConfig{} },
			json:    `{"labels__team": "core"}`,
			wantKey: `key="labels"`,
		},
		{
			name:    "unexported nested struct field",
			target:  func() any { return &unexportedNestedConfig{} },
			json:    `{"inner__value": "x"}`,
			wantKey: `key="inner"`,
		},
		{
			name:    "field behind a nil embedded pointer",
			target:  func() any { return &embeddedPointerConfig{} },
			json:    `{"host": "example.com"}`,
			wantKey: `key="host"`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			cl := configfx.NewConfigManager()

			var err error

			require.NotPanics(t, func() {
				err = cl.Load(tc.target(), cl.FromJSONString(tc.json))
			})
			require.ErrorIs(t, err, configfx.ErrUnsettableConfigField)
			assert.Contains(t, err.Error(), tc.wantKey)
		})
	}
}

type Celsius float64

type sensorConfig struct {
	Celsius

	Name string `conf:"name"`
}

type sensorMapConfig struct {
	Sensors map[string]sensorConfig `conf:"sensors"`
}

// TestLoad_MapValueMetaErrorIsReturned covers a struct map value whose
// metadata cannot be built (it embeds a non-struct type). The error used to be
// discarded, so the map entry loaded with every field left at zero.
func TestLoad_MapValueMetaErrorIsReturned(t *testing.T) {
	t.Parallel()

	cfg := sensorMapConfig{}
	cl := configfx.NewConfigManager()

	err := cl.Load(&cfg, cl.FromJSONString(`{"sensors__kitchen__name": "k1"}`))

	require.ErrorIs(t, err, configfx.ErrNotStruct)
	assert.Contains(t, err.Error(), `key="sensors__kitchen"`)
}

// TestLoad_TargetMustBeANonNilPointer covers the root of the same gap: a
// struct passed by value or a nil pointer has no field reflect can assign,
// and reflect.Value.Elem panicked on it before any field was reached.
func TestLoad_TargetMustBeANonNilPointer(t *testing.T) {
	t.Parallel()

	cases := []struct {
		target any
		name   string
	}{
		{name: "struct by value", target: unexportedFieldConfig{Name: "app"}},
		{name: "nil struct pointer", target: (*unexportedFieldConfig)(nil)},
		{name: "nil interface", target: nil},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			cl := configfx.NewConfigManager()

			var err error

			require.NotPanics(t, func() {
				err = cl.Load(tc.target, cl.FromJSONString(`{"name": "app"}`))
			})
			require.ErrorIs(t, err, configfx.ErrNotStruct)
			assert.Contains(t, err.Error(), "non-nil pointer")
		})
	}
}

// TestLoad_SettableEmbeddedFieldsStillLoad guards against over-correcting:
// exported fields reached through an allocated embedded pointer or an
// unexported embedded struct are settable and must keep loading.
func TestLoad_SettableEmbeddedFieldsStillLoad(t *testing.T) {
	t.Parallel()

	t.Run("allocated embedded pointer", func(t *testing.T) {
		t.Parallel()

		cfg := embeddedPointerConfig{EmbeddedBase: &EmbeddedBase{}}
		cl := configfx.NewConfigManager()

		err := cl.Load(&cfg, cl.FromJSONString(`{"host": "example.com"}`))

		require.NoError(t, err)
		assert.Equal(t, "example.com", cfg.Host)
		assert.Equal(t, 8080, cfg.Port)
	})

	t.Run("exported fields of an unexported embedded struct", func(t *testing.T) {
		t.Parallel()

		cfg := embeddedUnexportedConfig{}
		cl := configfx.NewConfigManager()

		err := cl.Load(&cfg, cl.FromJSONString(`{"region": "eu", "zone": "a"}`))

		require.NoError(t, err)
		assert.Equal(t, "eu", cfg.Region)
		assert.Equal(t, "a", cfg.Zone)
	})
}
