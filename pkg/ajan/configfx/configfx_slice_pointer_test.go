// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package configfx_test

import (
	"log/slog"
	"maps"
	"net/netip"
	"strconv"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/configfx"
	"github.com/eser/stack/pkg/ajan/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fromMap returns a resource that copies values into the target, as the
// environment sources do.
func fromMap(values map[string]any) configfx.ConfigResource {
	return func(target *map[string]any) error {
		maps.Copy(*target, values)

		return nil
	}
}

type sliceConfig struct {
	Paths []string `conf:"paths" default:"/a,/b"`
	Ports []int    `conf:"ports" default:"80,443"`
	Hosts []string `conf:"hosts"`
}

// TestLoad_SliceSources checks every source a slice loads from: the default
// tag, a comma-separated value, indexed keys, and the order between them.
func TestLoad_SliceSources(t *testing.T) {
	t.Parallel()

	cl := configfx.NewConfigManager()

	tests := []struct {
		name      string
		resources []configfx.ConfigResource
		paths     []string
		ports     []int
		hosts     []string
	}{
		{
			name:      "default tags apply when nothing is set",
			resources: nil,
			paths:     []string{"/a", "/b"},
			ports:     []int{80, 443},
			hosts:     nil,
		},
		{
			name:      "a comma-separated JSON string loads",
			resources: []configfx.ConfigResource{cl.FromJSONString(`{"paths": "/x, /y", "hosts": "db"}`)},
			paths:     []string{"/x", "/y"},
			ports:     []int{80, 443},
			hosts:     []string{"db"},
		},
		{
			name:      "a comma-separated environment value loads",
			resources: []configfx.ConfigResource{fromMap(map[string]any{"PATHS": "/x,/y", "PORTS": "8080"})},
			paths:     []string{"/x", "/y"},
			ports:     []int{8080},
			hosts:     nil,
		},
		{
			name:      "a JSON array loads through indexed keys",
			resources: []configfx.ConfigResource{cl.FromJSONString(`{"paths": ["/j"], "ports": [1, 2]}`)},
			paths:     []string{"/j"},
			ports:     []int{1, 2},
			hosts:     nil,
		},
		{
			name: "the value at the key wins over indexed keys",
			resources: []configfx.ConfigResource{
				cl.FromJSONString(`{"paths": ["/file"]}`),
				fromMap(map[string]any{"PATHS": "/env"}),
			},
			paths: []string{"/env"},
			ports: []int{80, 443},
			hosts: nil,
		},
		{
			name:      "an empty value clears the default",
			resources: []configfx.ConfigResource{fromMap(map[string]any{"PATHS": ""})},
			paths:     []string{},
			ports:     []int{80, 443},
			hosts:     nil,
		},
		{
			name:      "an empty JSON array clears the default",
			resources: []configfx.ConfigResource{cl.FromJSONString(`{"paths": []}`)},
			paths:     []string{},
			ports:     []int{80, 443},
			hosts:     nil,
		},
		{
			name: "a later non-empty array replaces an earlier empty one",
			resources: []configfx.ConfigResource{
				cl.FromJSONString(`{"paths": []}`),
				cl.FromJSONString(`{"paths": ["/later"]}`),
			},
			paths: []string{"/later"},
			ports: []int{80, 443},
			hosts: nil,
		},
		{
			name:      "items are trimmed and empty items dropped",
			resources: []configfx.ConfigResource{fromMap(map[string]any{"PATHS": " /a , ,/b,"})},
			paths:     []string{"/a", "/b"},
			ports:     []int{80, 443},
			hosts:     nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			cfg := sliceConfig{}

			require.NoError(t, cl.Load(&cfg, tt.resources...))
			assert.Equal(t, tt.paths, cfg.Paths)
			assert.Equal(t, tt.ports, cfg.Ports)
			assert.Equal(t, tt.hosts, cfg.Hosts)
		})
	}
}

// TestLoad_IndexedSliceLength checks that the highest index sets the length,
// a missing index leaves a zero item, and the last index under the bound loads.
func TestLoad_IndexedSliceLength(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		values    map[string]any
		length    int
		lastValue string
	}{
		{
			name:      "a missing index leaves a zero item",
			values:    map[string]any{"HOSTS__0": "a", "HOSTS__2": "c"},
			length:    3,
			lastValue: "c",
		},
		{
			name:      "the last index under the bound loads",
			values:    map[string]any{"HOSTS__" + strconv.Itoa(configfx.MaxIndexedSliceLength-1): "z"},
			length:    configfx.MaxIndexedSliceLength,
			lastValue: "z",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			cfg := sliceConfig{}
			cl := configfx.NewConfigManager()

			require.NoError(t, cl.Load(&cfg, fromMap(tt.values)))
			require.Len(t, cfg.Hosts, tt.length)
			assert.Empty(t, cfg.Hosts[1])
			assert.Equal(t, tt.lastValue, cfg.Hosts[tt.length-1])
		})
	}
}

type sliceItem struct {
	Name string `conf:"name"`
}

// TestLoad_SliceErrors checks that a slice value that cannot load is reported
// with its key instead of leaving the field empty.
func TestLoad_SliceErrors(t *testing.T) {
	t.Parallel()

	type badDefault struct {
		Ports []int `conf:"ports" default:"80,http"`
	}

	type structList struct {
		Items []sliceItem `conf:"items"`
	}

	type requiredList struct {
		Hosts []string `conf:"hosts" required:""`
	}

	tests := []struct {
		name     string
		target   any
		values   map[string]any
		sentinel error
		contains []string
	}{
		{
			name:     "an item that does not parse",
			target:   &sliceConfig{},
			values:   map[string]any{"PORTS": "80,http"},
			sentinel: configfx.ErrInvalidConfigValue,
			contains: []string{`key="ports"`, "index=1", `value="http"`},
		},
		{
			name:     "a default tag that does not parse",
			target:   &badDefault{},
			values:   map[string]any{},
			sentinel: configfx.ErrInvalidConfigValue,
			contains: []string{`key="ports"`, "source=default"},
		},
		{
			name:     "a comma-separated value for a list of structs",
			target:   &structList{},
			values:   map[string]any{"ITEMS": "a,b"},
			sentinel: configfx.ErrInvalidConfigValue,
			contains: []string{`key="items"`, "indexed keys"},
		},
		{
			name:     "a required list with no value",
			target:   &requiredList{},
			values:   map[string]any{},
			sentinel: configfx.ErrMissingRequiredConfigValue,
			contains: []string{`key="hosts"`},
		},
		{
			name:     "an index past the length bound",
			target:   &sliceConfig{},
			values:   map[string]any{"PATHS__0": "/a", "PATHS__1000000000": "/typo"},
			sentinel: configfx.ErrInvalidConfigValue,
			contains: []string{`key="PATHS__1000000000"`, "index=1000000000", "at most 10000 items"},
		},
		{
			name:     "an index past the length bound in a list of structs",
			target:   &structList{},
			values:   map[string]any{"ITEMS__10000__NAME": "x"},
			sentinel: configfx.ErrInvalidConfigValue,
			contains: []string{`key="ITEMS__10000__NAME"`, "use indices 0 to 9999"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			cl := configfx.NewConfigManager()
			err := cl.Load(tt.target, fromMap(tt.values))

			require.ErrorIs(t, err, tt.sentinel)

			for _, part := range tt.contains {
				assert.Contains(t, err.Error(), part)
			}
		})
	}
}

type pointerConfig struct {
	Port    *int             `conf:"port"`
	Name    *string          `conf:"name"    default:"app"`
	Timeout *time.Duration   `conf:"timeout"`
	Limit   *types.MetricInt `conf:"limit"`
}

// TestLoad_PointerFields checks that a pointer field gets a new value from a
// source or its default, and stays nil without either.
func TestLoad_PointerFields(t *testing.T) {
	t.Parallel()

	cl := configfx.NewConfigManager()

	t.Run("values and defaults are set through new pointers", func(t *testing.T) {
		t.Parallel()

		cfg := pointerConfig{}

		err := cl.Load(&cfg, fromMap(map[string]any{"PORT": "9000", "TIMEOUT": "5s", "LIMIT": "2K"}))
		require.NoError(t, err)

		require.NotNil(t, cfg.Port)
		assert.Equal(t, 9000, *cfg.Port)
		require.NotNil(t, cfg.Name)
		assert.Equal(t, "app", *cfg.Name)
		require.NotNil(t, cfg.Timeout)
		assert.Equal(t, 5*time.Second, *cfg.Timeout)
		require.NotNil(t, cfg.Limit)
		assert.Equal(t, types.MetricInt(2000), *cfg.Limit)
	})

	t.Run("a pointer without a value or a default stays nil", func(t *testing.T) {
		t.Parallel()

		cfg := pointerConfig{}

		require.NoError(t, cl.Load(&cfg))
		assert.Nil(t, cfg.Port)
		assert.Nil(t, cfg.Timeout)
		assert.Nil(t, cfg.Limit)
	})

	t.Run("a pointer value that does not parse is an error", func(t *testing.T) {
		t.Parallel()

		cfg := pointerConfig{}

		err := cl.Load(&cfg, fromMap(map[string]any{"PORT": "eighty"}))
		require.ErrorIs(t, err, configfx.ErrInvalidConfigValue)
		assert.Contains(t, err.Error(), `key="port"`)
		assert.Nil(t, cfg.Port)
	})
}

type databaseSection struct {
	Host string `conf:"host" default:"localhost"`
	Port int    `conf:"port"`
}

// TestLoad_PointerToStructSection checks that a pointer to a struct is filled
// when a key under it is set, and stays nil when the section is absent.
func TestLoad_PointerToStructSection(t *testing.T) {
	t.Parallel()

	type optionalSection struct {
		DB *databaseSection `conf:"db"`
	}

	type requiredSection struct {
		DB *databaseSection `conf:"db" required:""`
	}

	cl := configfx.NewConfigManager()

	t.Run("an absent section stays nil", func(t *testing.T) {
		t.Parallel()

		cfg := optionalSection{}

		require.NoError(t, cl.Load(&cfg, fromMap(map[string]any{"OTHER": "x"})))
		assert.Nil(t, cfg.DB)
	})

	t.Run("a key under the section allocates it and applies its defaults", func(t *testing.T) {
		t.Parallel()

		cfg := optionalSection{}

		require.NoError(t, cl.Load(&cfg, fromMap(map[string]any{"DB__PORT": "5432"})))
		require.NotNil(t, cfg.DB)
		assert.Equal(t, databaseSection{Host: "localhost", Port: 5432}, *cfg.DB)
	})

	t.Run("a section from a JSON object loads", func(t *testing.T) {
		t.Parallel()

		cfg := optionalSection{}

		require.NoError(t, cl.Load(&cfg, cl.FromJSONString(`{"db": {"host": "db.internal", "port": 6432}}`)))
		require.NotNil(t, cfg.DB)
		assert.Equal(t, databaseSection{Host: "db.internal", Port: 6432}, *cfg.DB)
	})

	t.Run("a section allocated before Load is loaded in place", func(t *testing.T) {
		t.Parallel()

		section := &databaseSection{}
		cfg := optionalSection{DB: section}

		require.NoError(t, cl.Load(&cfg))
		assert.Same(t, section, cfg.DB)
		assert.Equal(t, "localhost", cfg.DB.Host)
	})

	t.Run("a required section that is absent is an error", func(t *testing.T) {
		t.Parallel()

		cfg := requiredSection{}

		err := cl.Load(&cfg)
		require.ErrorIs(t, err, configfx.ErrMissingRequiredConfigValue)
		assert.Contains(t, err.Error(), `key="db"`)
	})
}

// TestLoad_TextUnmarshalerFields checks that a type implementing
// encoding.TextUnmarshaler parses its own value, also as a slice item, behind
// a pointer, and when it is a struct such as time.Time.
func TestLoad_TextUnmarshalerFields(t *testing.T) {
	t.Parallel()

	type textConfig struct {
		Level   slog.Level     `conf:"level"   default:"warn"`
		Started time.Time      `conf:"started"`
		Addr    netip.Addr     `conf:"addr"`
		Allowed []netip.Prefix `conf:"allowed" default:"10.0.0.0/8, 192.168.0.0/16"`
		Stopped *time.Time     `conf:"stopped"`
	}

	cl := configfx.NewConfigManager()

	t.Run("values parse through UnmarshalText", func(t *testing.T) {
		t.Parallel()

		cfg := textConfig{}

		err := cl.Load(&cfg, fromMap(map[string]any{
			"STARTED": "2026-01-02T03:04:05Z",
			"ADDR":    "10.1.2.3",
			"STOPPED": "2026-01-03T00:00:00Z",
		}))
		require.NoError(t, err)

		assert.Equal(t, slog.LevelWarn, cfg.Level)
		assert.Equal(t, time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC), cfg.Started)
		assert.Equal(t, netip.MustParseAddr("10.1.2.3"), cfg.Addr)
		assert.Equal(t, []netip.Prefix{
			netip.MustParsePrefix("10.0.0.0/8"),
			netip.MustParsePrefix("192.168.0.0/16"),
		}, cfg.Allowed)
		require.NotNil(t, cfg.Stopped)
		assert.Equal(t, time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC), *cfg.Stopped)
	})

	t.Run("a value UnmarshalText rejects is an error", func(t *testing.T) {
		t.Parallel()

		cfg := textConfig{}

		err := cl.Load(&cfg, fromMap(map[string]any{"ADDR": "not-an-ip"}))
		require.ErrorIs(t, err, configfx.ErrInvalidConfigValue)
		assert.Contains(t, err.Error(), `key="addr"`)
	})
}

// TestLoad_NamedTypesAndMapValues checks that named types load like their
// underlying kind and that map values of any scalar type are parsed.
func TestLoad_NamedTypesAndMapValues(t *testing.T) {
	t.Parallel()

	type mode string

	type retries int

	type namedConfig struct {
		Mode       mode              `conf:"mode"       default:"fast"`
		Retries    retries           `conf:"retries"`
		Limits     map[string]int    `conf:"limits"`
		Properties map[string]any    `conf:"properties"`
		Labels     map[string]string `conf:"labels"`
	}

	cfg := namedConfig{}
	cl := configfx.NewConfigManager()

	err := cl.Load(&cfg, fromMap(map[string]any{
		"RETRIES":             "3",
		"LIMITS__MAX_USERS":   "1000",
		"PROPERTIES__BINPATH": "/usr/local/bin/tool",
		"LABELS__TEAM":        "core",
	}))
	require.NoError(t, err)

	assert.Equal(t, mode("fast"), cfg.Mode)
	assert.Equal(t, retries(3), cfg.Retries)
	assert.Equal(t, map[string]int{"max_users": 1000}, cfg.Limits)
	assert.Equal(t, map[string]any{"binpath": "/usr/local/bin/tool"}, cfg.Properties)
	assert.Equal(t, map[string]string{"team": "core"}, cfg.Labels)
}

// TestLoad_UnsupportedTypeIsRejected checks that a value for a type configfx
// cannot parse is an error instead of being dropped, and that such a field
// without a value is left alone.
func TestLoad_UnsupportedTypeIsRejected(t *testing.T) {
	t.Parallel()

	type complexConfig struct {
		Value complex128 `conf:"value"`
	}

	type nestedListConfig struct {
		Matrix [][]int `conf:"matrix"`
	}

	type intKeyConfig struct {
		Names map[int]string `conf:"names"`
	}

	tests := []struct {
		name     string
		target   any
		values   map[string]any
		contains string
	}{
		{name: "a complex number", target: &complexConfig{}, values: map[string]any{"VALUE": "1+2i"}, contains: `key="value"`},
		{name: "a list of lists", target: &nestedListConfig{}, values: map[string]any{"MATRIX": "1,2"}, contains: `key="matrix"`},
		{name: "a map with int keys", target: &intKeyConfig{}, values: map[string]any{}, contains: `key="names"`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			cl := configfx.NewConfigManager()
			err := cl.Load(tt.target, fromMap(tt.values))

			require.ErrorIs(t, err, configfx.ErrUnsupportedConfigType)
			assert.Contains(t, err.Error(), tt.contains)
		})
	}

	t.Run("an unsupported field without a value is left alone", func(t *testing.T) {
		t.Parallel()

		cfg := complexConfig{}
		cl := configfx.NewConfigManager()

		require.NoError(t, cl.Load(&cfg))
		assert.Zero(t, cfg.Value)
	})
}

// TestLoad_JSONValues checks how JSON values reach the fields: large numbers
// keep their digits, and null falls back to the default.
func TestLoad_JSONValues(t *testing.T) {
	t.Parallel()

	type jsonConfig struct {
		MaxHeaderBytes int     `conf:"max_header_bytes"`
		Ratio          float64 `conf:"ratio"`
		Name           string  `conf:"name"             default:"app"`
	}

	cl := configfx.NewConfigManager()

	t.Run("numbers of a million and more load into int fields", func(t *testing.T) {
		t.Parallel()

		cfg := jsonConfig{}

		require.NoError(t, cl.Load(&cfg, cl.FromJSONString(`{"max_header_bytes": 1048576, "ratio": 0.000001}`)))
		assert.Equal(t, 1048576, cfg.MaxHeaderBytes)
		assert.InDelta(t, 0.000001, cfg.Ratio, 1e-12)
	})

	t.Run("a later null removes an earlier value", func(t *testing.T) {
		t.Parallel()

		cfg := jsonConfig{}

		err := cl.Load(&cfg, cl.FromJSONString(`{"name": "first"}`), cl.FromJSONString(`{"name": null}`))
		require.NoError(t, err)
		assert.Equal(t, "app", cfg.Name)
	})

	t.Run("data after the top-level object is an error", func(t *testing.T) {
		t.Parallel()

		cfg := jsonConfig{}

		err := cl.Load(&cfg, cl.FromJSONString(`{"name": "a"} {"name": "b"}`))
		require.ErrorIs(t, err, configfx.ErrFailedToParseJSONString)
	})
}
