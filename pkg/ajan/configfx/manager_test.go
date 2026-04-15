package configfx_test

import (
	"maps"
	"reflect"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/configfx"
	"github.com/eser/stack/pkg/ajan/lib"
	"github.com/eser/stack/pkg/ajan/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type TestConfig struct {
	Host string `conf:"host" default:"localhost"`
}

type TestConfigNestedKV struct {
	Name string `conf:"name"`
}

type TestConfigNested struct {
	TestConfig

	Port     int    `conf:"port"      default:"8080"`
	MaxRetry uint16 `conf:"max_retry" default:"10"`

	Dictionary map[string]string    `conf:"dict"`
	Array      []TestConfigNestedKV `conf:"arr"`
}

func TestLoad(t *testing.T) { //nolint:funlen
	t.Parallel()

	t.Run("should load config", func(t *testing.T) {
		t.Parallel()

		config := TestConfigNested{} //nolint:exhaustruct

		cl := configfx.NewConfigManager()
		err := cl.Load(&config)

		require.NoError(t, err)
		assert.Equal(t, "localhost", config.Host)
		assert.Equal(t, 8080, config.Port)
		assert.Equal(t, uint16(10), config.MaxRetry)
	})

	t.Run("should load config from string", func(t *testing.T) {
		t.Parallel()

		config := TestConfigNested{} //nolint:exhaustruct

		cl := configfx.NewConfigManager()
		err := cl.Load(
			&config,
			cl.FromJSONFile("testdata/config.json"),
			cl.FromEnvFile("testdata/.env", true),
		)

		require.NoError(t, err)
		assert.Equal(t, "localhost", config.Host)
		assert.Equal(t, 8081, config.Port)
		assert.Equal(t, uint16(20), config.MaxRetry)
		assert.Equal(
			t,
			map[string]string{"key": "value", "key2": "value2", "key3": "value3"},
			config.Dictionary,
		)
		// Verify array loading works from JSON
		assert.Len(t, config.Array, 1)

		if len(config.Array) > 0 {
			assert.Equal(t, "eser", config.Array[0].Name)
		}
	})

	t.Run("should load nested config from uppercase keys", func(t *testing.T) {
		t.Parallel()

		config := TestConfigNested{} //nolint:exhaustruct

		// Simulating environment variables where keys are typically uppercase
		// The separator is "__" based on types.go
		envData := map[string]any{
			"HOST": "remotehost",
			"PORT": "9090",
			// Array testing via Env
			"ARR__0__NAME": "envitem",
			// Map testing via Env
			"DICT__ENVKEY": "envval",
		}

		mockResource := func(target *map[string]any) error {
			maps.Copy((*target), envData)

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, mockResource)

		require.NoError(t, err)
		assert.Equal(t, "remotehost", config.Host)
		assert.Equal(t, 9090, config.Port)

		// Verify Array from Env
		assert.Len(t, config.Array, 1)

		if len(config.Array) > 0 {
			assert.Equal(t, "envitem", config.Array[0].Name)
		}

		// Verify Map from Env (keys normalized to lowercase)
		val, ok := config.Dictionary["envkey"]
		assert.True(t, ok, "Map key should be envkey (normalized to lowercase)")
		assert.Equal(t, "envval", val)
	})
}

// Test structs mimicking real aifx.Config hierarchy.
type TestAITarget struct {
	Provider string `conf:"provider"`
	APIKey   string `conf:"api_key"`
	Model    string `conf:"model"`
}

type TestAIConfig struct {
	Targets map[string]TestAITarget `conf:"targets"`
}

type TestDeepConfig struct {
	AppName string       `conf:"name" default:"myapp"`
	AI      TestAIConfig `conf:"ai"`
}

func TestLoad_DeepNestedUppercaseKeys(t *testing.T) { //nolint:funlen
	t.Parallel()

	t.Run("should load struct-in-map-in-struct from ALL UPPERCASE env keys", func(t *testing.T) {
		t.Parallel()

		config := TestDeepConfig{} //nolint:exhaustruct

		envData := map[string]any{
			"NAME":                           "testapp",
			"AI__TARGETS__DEFAULT__PROVIDER": "anthropic",
			"AI__TARGETS__DEFAULT__API_KEY":  "sk-ant-xxx",
			"AI__TARGETS__DEFAULT__MODEL":    "claude-3",
		}

		mockResource := func(target *map[string]any) error {
			maps.Copy(*target, envData)

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, mockResource)

		require.NoError(t, err)
		assert.Equal(t, "testapp", config.AppName)

		// Verify the deeply nested struct-in-map values
		target, ok := config.AI.Targets["default"]
		require.True(t, ok, "Map key 'default' should exist")
		assert.Equal(t, "anthropic", target.Provider)
		assert.Equal(t, "sk-ant-xxx", target.APIKey)
		assert.Equal(t, "claude-3", target.Model)
	})

	t.Run("should load struct-in-map-in-struct from mixed case env keys", func(t *testing.T) {
		t.Parallel()

		config := TestDeepConfig{} //nolint:exhaustruct

		envData := map[string]any{
			"name":                           "testapp",
			"AI__targets__default__provider": "anthropic",
			"AI__targets__default__api_key":  "sk-ant-xxx",
			"AI__targets__default__model":    "claude-3",
		}

		mockResource := func(target *map[string]any) error {
			maps.Copy(*target, envData)

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, mockResource)

		require.NoError(t, err)
		assert.Equal(t, "testapp", config.AppName)

		target, ok := config.AI.Targets["default"]
		require.True(t, ok, "Map key 'default' should exist")
		assert.Equal(t, "anthropic", target.Provider)
		assert.Equal(t, "sk-ant-xxx", target.APIKey)
		assert.Equal(t, "claude-3", target.Model)
	})

	t.Run("should load multiple map entries from ALL UPPERCASE keys", func(t *testing.T) {
		t.Parallel()

		config := TestDeepConfig{} //nolint:exhaustruct

		envData := map[string]any{
			"AI__TARGETS__DEFAULT__PROVIDER":  "anthropic",
			"AI__TARGETS__DEFAULT__API_KEY":   "sk-ant-xxx",
			"AI__TARGETS__FALLBACK__PROVIDER": "openai",
			"AI__TARGETS__FALLBACK__API_KEY":  "sk-openai-xxx",
		}

		mockResource := func(target *map[string]any) error {
			maps.Copy(*target, envData)

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, mockResource)

		require.NoError(t, err)

		defaultTarget, targetFound := config.AI.Targets["default"]
		require.True(t, targetFound, "Map key 'default' should exist")
		assert.Equal(t, "anthropic", defaultTarget.Provider)
		assert.Equal(t, "sk-ant-xxx", defaultTarget.APIKey)

		fallbackTarget, targetFound := config.AI.Targets["fallback"]
		require.True(t, targetFound, "Map key 'fallback' should exist")
		assert.Equal(t, "openai", fallbackTarget.Provider)
		assert.Equal(t, "sk-openai-xxx", fallbackTarget.APIKey)
	})
}

func TestLoad_CaseInsensitiveEnvOverride(t *testing.T) { //nolint:funlen
	t.Parallel()

	t.Run("should override JSON config with ALL UPPERCASE env vars", func(t *testing.T) {
		t.Parallel()

		config := TestDeepConfig{} //nolint:exhaustruct

		// Simulates config.json loading (lowercase keys from JSON flattening)
		jsonResource := func(target *map[string]any) error {
			(*target)["ai__targets__default__provider"] = "anthropic"
			(*target)["ai__targets__default__model"] = "claude-3"

			return nil
		}

		// Simulates FromSystemEnv - env vars override with CaseInsensitiveSet
		envResource := func(target *map[string]any) error {
			// api_key only comes from env (not in config.json)
			lib.CaseInsensitiveSet(target, "AI__TARGETS__DEFAULT__API_KEY", "sk-ant-xxx")
			// Override model from env with different casing
			lib.CaseInsensitiveSet(target, "AI__TARGETS__DEFAULT__MODEL", "claude-4")

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, jsonResource, envResource)

		require.NoError(t, err)

		target, ok := config.AI.Targets["default"]
		require.True(t, ok, "Map key 'default' should exist")
		assert.Equal(t, "anthropic", target.Provider)
		assert.Equal(t, "sk-ant-xxx", target.APIKey)
		assert.Equal(t, "claude-4", target.Model)
	})

	t.Run(
		"should handle env-only config with ALL UPPERCASE keys via CaseInsensitiveSet",
		func(t *testing.T) {
			t.Parallel()

			config := TestDeepConfig{} //nolint:exhaustruct

			// No config.json - everything from env vars
			envResource := func(target *map[string]any) error {
				lib.CaseInsensitiveSet(target, "NAME", "envapp")
				lib.CaseInsensitiveSet(target, "AI__TARGETS__DEFAULT__PROVIDER", "openai")
				lib.CaseInsensitiveSet(target, "AI__TARGETS__DEFAULT__API_KEY", "sk-openai-xxx")
				lib.CaseInsensitiveSet(target, "AI__TARGETS__DEFAULT__MODEL", "gpt-4")
				lib.CaseInsensitiveSet(target, "AI__TARGETS__BACKUP__PROVIDER", "anthropic")
				lib.CaseInsensitiveSet(target, "AI__TARGETS__BACKUP__API_KEY", "sk-ant-xxx")

				return nil
			}

			cl := configfx.NewConfigManager()
			err := cl.Load(&config, envResource)

			require.NoError(t, err)
			assert.Equal(t, "envapp", config.AppName)

			defaultTarget, targetFound := config.AI.Targets["default"]
			require.True(t, targetFound)
			assert.Equal(t, "openai", defaultTarget.Provider)
			assert.Equal(t, "sk-openai-xxx", defaultTarget.APIKey)
			assert.Equal(t, "gpt-4", defaultTarget.Model)

			backupTarget, targetFound := config.AI.Targets["backup"]
			require.True(t, targetFound)
			assert.Equal(t, "anthropic", backupTarget.Provider)
			assert.Equal(t, "sk-ant-xxx", backupTarget.APIKey)
		},
	)
}

func TestLoad_RealSystemEnvUppercase(t *testing.T) {
	// Cannot use t.Parallel() because we modify os env vars
	t.Run("should load from real system env with ALL UPPERCASE keys", func(t *testing.T) {
		// Set uppercase env vars
		t.Setenv("AI__TARGETS__DEFAULT__PROVIDER", "anthropic")
		t.Setenv("AI__TARGETS__DEFAULT__API_KEY", "sk-ant-test-123")
		t.Setenv("AI__TARGETS__DEFAULT__MODEL", "claude-3")
		t.Setenv("NAME", "envapp")

		config := TestDeepConfig{} //nolint:exhaustruct

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, cl.FromSystemEnv(true))

		require.NoError(t, err)
		assert.Equal(t, "envapp", config.AppName)

		target, ok := config.AI.Targets["default"]
		require.True(t, ok, "Map key 'default' should exist")
		assert.Equal(t, "anthropic", target.Provider)
		assert.Equal(t, "sk-ant-test-123", target.APIKey)
		assert.Equal(t, "claude-3", target.Model)
	})

	t.Run("should load from JSON then override with UPPERCASE system env", func(t *testing.T) {
		// JSON provides base config, env overrides api_key
		t.Setenv("AI__TARGETS__DEFAULT__API_KEY", "sk-from-env")

		config := TestDeepConfig{} //nolint:exhaustruct

		jsonResource := func(target *map[string]any) error {
			(*target)["name"] = "jsonapp"
			(*target)["ai__targets__default__provider"] = "anthropic"
			(*target)["ai__targets__default__model"] = "claude-3"

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, jsonResource, cl.FromSystemEnv(true))

		require.NoError(t, err)
		assert.Equal(t, "jsonapp", config.AppName)

		target, ok := config.AI.Targets["default"]
		require.True(t, ok, "Map key 'default' should exist")
		assert.Equal(t, "anthropic", target.Provider)
		assert.Equal(t, "sk-from-env", target.APIKey)
		assert.Equal(t, "claude-3", target.Model)
	})
}

// Test with actual aifx types to match real production usage.
type TestRealAITarget struct {
	Properties     map[string]string `conf:"properties"`
	Provider       string            `conf:"provider"`
	APIKey         string            `conf:"api_key"`
	Model          string            `conf:"model"`
	BaseURL        string            `conf:"base_url"`
	ProjectID      string            `conf:"project_id"`
	Location       string            `conf:"location"`
	MaxTokens      int               `conf:"max_tokens"      default:"1024"`
	Temperature    float64           `conf:"temperature"     default:"0.7"`
	RequestTimeout time.Duration     `conf:"request_timeout" default:"60s"`
}

type TestRealAIConfig struct {
	Targets map[string]TestRealAITarget `conf:"targets"`
}

type TestRealBaseConfig struct {
	AppName string           `conf:"name" default:"eser-go-svc"`
	AppEnv  string           `conf:"env"  default:"development"`
	AI      TestRealAIConfig `conf:"ai"`
}

func TestLoad_RealBaseConfigUppercase(t *testing.T) {
	t.Run(
		"should load full BaseConfig-like struct from ALL UPPERCASE env vars",
		func(t *testing.T) {
			t.Setenv("AI__TARGETS__DEFAULT__PROVIDER", "anthropic")
			t.Setenv("AI__TARGETS__DEFAULT__API_KEY", "sk-ant-test-123")
			t.Setenv("AI__TARGETS__DEFAULT__MODEL", "claude-sonnet-4-20250514")
			t.Setenv("AI__TARGETS__DEFAULT__MAX_TOKENS", "2048")
			t.Setenv("AI__TARGETS__DEFAULT__TEMPERATURE", "0.5")
			t.Setenv("AI__TARGETS__DEFAULT__REQUEST_TIMEOUT", "30s")
			t.Setenv("AI__TARGETS__DEFAULT__PROPERTIES__SERVICE_ACCOUNT", "base64data")
			t.Setenv("AI__TARGETS__VERTEXAI__PROVIDER", "vertexai")
			t.Setenv("AI__TARGETS__VERTEXAI__PROJECT_ID", "my-project")
			t.Setenv("AI__TARGETS__VERTEXAI__LOCATION", "us-central1")

			config := TestRealBaseConfig{} //nolint:exhaustruct

			cl := configfx.NewConfigManager()
			err := cl.Load(&config, cl.FromSystemEnv(true))

			require.NoError(t, err)
			assert.Equal(t, "eser-go-svc", config.AppName) // default
			assert.Equal(t, "development", config.AppEnv)  // default

			// Verify default target
			defaultTarget, targetFound := config.AI.Targets["default"]
			require.True(t, targetFound, "Map key 'default' should exist")
			assert.Equal(t, "anthropic", defaultTarget.Provider)
			assert.Equal(t, "sk-ant-test-123", defaultTarget.APIKey)
			assert.Equal(t, "claude-sonnet-4-20250514", defaultTarget.Model)
			assert.Equal(t, 2048, defaultTarget.MaxTokens)
			assert.InDelta(t, 0.5, defaultTarget.Temperature, 0.001)
			assert.Equal(t, 30*time.Second, defaultTarget.RequestTimeout)

			// Verify properties map
			propVal, propOk := defaultTarget.Properties["service_account"]
			assert.True(t, propOk, "Properties should have 'service_account' key (lowercase)")
			assert.Equal(t, "base64data", propVal)

			// Verify vertexai target
			vertexTarget, targetFound := config.AI.Targets["vertexai"]
			require.True(t, targetFound, "Map key 'vertexai' should exist")
			assert.Equal(t, "vertexai", vertexTarget.Provider)
			assert.Equal(t, "my-project", vertexTarget.ProjectID)
			assert.Equal(t, "us-central1", vertexTarget.Location)
		},
	)
}

func TestLoadMeta(t *testing.T) { //nolint:funlen
	t.Parallel()

	t.Run("should get config meta", func(t *testing.T) {
		t.Parallel()

		config := TestConfig{} //nolint:exhaustruct

		cl := configfx.NewConfigManager()
		meta, err := cl.LoadMeta(&config)

		expected := []configfx.ConfigItemMeta{
			{
				Name:            "host",
				Field:           meta.Children[0].Field,
				Type:            reflect.TypeFor[string](),
				IsRequired:      false,
				HasDefaultValue: true,
				DefaultValue:    "localhost",

				Children: nil,
			},
		}

		require.NoError(t, err)
		assert.Equal(t, "root", meta.Name)
		assert.Nil(t, meta.Type)

		assert.ElementsMatch(t, expected, meta.Children)
	})

	t.Run("should get config meta from nested definition", func(t *testing.T) {
		t.Parallel()

		config := TestConfigNested{} //nolint:exhaustruct

		cl := configfx.NewConfigManager()
		meta, err := cl.LoadMeta(&config)

		expected := []configfx.ConfigItemMeta{
			{
				Name:            "host",
				Field:           meta.Children[0].Field,
				Type:            reflect.TypeFor[string](),
				IsRequired:      false,
				HasDefaultValue: true,
				DefaultValue:    "localhost",

				Children: nil,
			},
			{
				Name:            "port",
				Field:           meta.Children[1].Field,
				Type:            reflect.TypeFor[int](),
				IsRequired:      false,
				HasDefaultValue: true,
				DefaultValue:    "8080",

				Children: nil,
			},
			{
				Name:            "max_retry",
				Field:           meta.Children[2].Field,
				Type:            reflect.TypeFor[uint16](),
				IsRequired:      false,
				HasDefaultValue: true,
				DefaultValue:    "10",

				Children: nil,
			},
			{
				Name:            "dict",
				Field:           meta.Children[3].Field,
				Type:            reflect.TypeFor[map[string]string](),
				IsRequired:      false,
				HasDefaultValue: false,
				DefaultValue:    "",

				Children: nil,
			},
			{
				Name:            "arr",
				Field:           meta.Children[4].Field,
				Type:            reflect.TypeFor[[]TestConfigNestedKV](),
				IsRequired:      false,
				HasDefaultValue: false,
				DefaultValue:    "",

				Children: meta.Children[4].Children,
			},
		}

		require.NoError(t, err)
		assert.Equal(t, "root", meta.Name)
		assert.Nil(t, meta.Type)

		// Expecting 1 child for TestConfigNestedKV: Name
		assert.Len(t, meta.Children[4].Children, 1)
		assert.Equal(t, "name", meta.Children[4].Children[0].Name)

		assert.ElementsMatch(t, expected, meta.Children)
	})
}

// Test structs for MetricInt and MetricFloat parsing.
type TestConfigWithMetrics struct {
	MaxTokens          types.MetricInt   `conf:"max_tokens"`
	MaxTokensPerMinute types.MetricInt   `conf:"max_tokens_per_minute"`
	MaxSize            types.MetricInt   `conf:"max_size"`
	RateMultiplier     types.MetricFloat `conf:"rate_multiplier"`
	Timeout            time.Duration     `conf:"timeout"               default:"30s"`
}

type TestConfigResourceLimits struct {
	MaxInputToken           types.MetricInt `conf:"max_input_token"`
	MaxInputTokensPerMinute types.MetricInt `conf:"max_input_tokens_per_minute"`
	MaxSizePerFile          types.MetricInt `conf:"max_size_per_file"`
	MaxRequestsPerFile      types.MetricInt `conf:"max_requests_per_file"`
	MaxFilesPerResource     types.MetricInt `conf:"max_files_per_resource"`
}

type TestConfigWithNestedLimits struct {
	Name   string                   `conf:"name"`
	Limits TestConfigResourceLimits `conf:"limits"`
}

func TestLoad_MetricInt(t *testing.T) { //nolint:funlen
	t.Parallel()

	t.Run("should parse MetricInt with K suffix", func(t *testing.T) {
		t.Parallel()

		config := TestConfigWithMetrics{} //nolint:exhaustruct

		envData := map[string]any{
			"MAX_TOKENS":            "100K",
			"MAX_TOKENS_PER_MINUTE": "3400K",
			"MAX_SIZE":              "50M",
		}

		mockResource := func(target *map[string]any) error {
			maps.Copy(*target, envData)

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, mockResource)

		require.NoError(t, err)
		assert.Equal(t, types.MetricInt(100_000), config.MaxTokens)
		assert.Equal(t, types.MetricInt(3_400_000), config.MaxTokensPerMinute)
		assert.Equal(t, types.MetricInt(50_000_000), config.MaxSize)
	})

	t.Run("should parse MetricInt with M suffix", func(t *testing.T) {
		t.Parallel()

		config := TestConfigWithMetrics{} //nolint:exhaustruct

		envData := map[string]any{
			"MAX_TOKENS": "1M",
			"MAX_SIZE":   "200M",
		}

		mockResource := func(target *map[string]any) error {
			maps.Copy(*target, envData)

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, mockResource)

		require.NoError(t, err)
		assert.Equal(t, types.MetricInt(1_000_000), config.MaxTokens)
		assert.Equal(t, types.MetricInt(200_000_000), config.MaxSize)
	})

	t.Run("should parse MetricInt with B suffix", func(t *testing.T) {
		t.Parallel()

		config := TestConfigWithMetrics{} //nolint:exhaustruct

		envData := map[string]any{
			"MAX_TOKENS": "1B",
		}

		mockResource := func(target *map[string]any) error {
			maps.Copy(*target, envData)

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, mockResource)

		require.NoError(t, err)
		assert.Equal(t, types.MetricInt(1_000_000_000), config.MaxTokens)
	})

	t.Run("should parse plain numeric MetricInt", func(t *testing.T) {
		t.Parallel()

		config := TestConfigWithMetrics{} //nolint:exhaustruct

		envData := map[string]any{
			"MAX_TOKENS": "50000",
		}

		mockResource := func(target *map[string]any) error {
			maps.Copy(*target, envData)

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, mockResource)

		require.NoError(t, err)
		assert.Equal(t, types.MetricInt(50000), config.MaxTokens)
	})

	t.Run("should parse decimal with suffix", func(t *testing.T) {
		t.Parallel()

		config := TestConfigWithMetrics{} //nolint:exhaustruct

		envData := map[string]any{
			"MAX_TOKENS": "1.5M",
		}

		mockResource := func(target *map[string]any) error {
			maps.Copy(*target, envData)

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, mockResource)

		require.NoError(t, err)
		assert.Equal(t, types.MetricInt(1_500_000), config.MaxTokens)
	})
}

func TestLoad_MetricFloat(t *testing.T) {
	t.Parallel()

	t.Run("should parse MetricFloat with suffix", func(t *testing.T) {
		t.Parallel()

		config := TestConfigWithMetrics{} //nolint:exhaustruct

		envData := map[string]any{
			"RATE_MULTIPLIER": "1.5K",
		}

		mockResource := func(target *map[string]any) error {
			maps.Copy(*target, envData)

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, mockResource)

		require.NoError(t, err)
		assert.InDelta(t, float64(1500), float64(config.RateMultiplier), 0.001)
	})

	t.Run("should parse plain numeric MetricFloat", func(t *testing.T) {
		t.Parallel()

		config := TestConfigWithMetrics{} //nolint:exhaustruct

		envData := map[string]any{
			"RATE_MULTIPLIER": "2.5",
		}

		mockResource := func(target *map[string]any) error {
			maps.Copy(*target, envData)

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, mockResource)

		require.NoError(t, err)
		assert.InDelta(t, float64(2.5), float64(config.RateMultiplier), 0.001)
	})
}

func TestLoad_NestedMetricInt(t *testing.T) {
	t.Parallel()

	t.Run("should parse nested struct with MetricInt fields", func(t *testing.T) {
		t.Parallel()

		config := TestConfigWithNestedLimits{} //nolint:exhaustruct

		envData := map[string]any{
			"NAME":                                "test-resource",
			"LIMITS__MAX_INPUT_TOKEN":             "1M",
			"LIMITS__MAX_INPUT_TOKENS_PER_MINUTE": "3400K",
			"LIMITS__MAX_SIZE_PER_FILE":           "50M",
			"LIMITS__MAX_REQUESTS_PER_FILE":       "100K",
			"LIMITS__MAX_FILES_PER_RESOURCE":      "500",
		}

		mockResource := func(target *map[string]any) error {
			maps.Copy(*target, envData)

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, mockResource)

		require.NoError(t, err)
		assert.Equal(t, "test-resource", config.Name)
		assert.Equal(t, types.MetricInt(1_000_000), config.Limits.MaxInputToken)
		assert.Equal(t, types.MetricInt(3_400_000), config.Limits.MaxInputTokensPerMinute)
		assert.Equal(t, types.MetricInt(50_000_000), config.Limits.MaxSizePerFile)
		assert.Equal(t, types.MetricInt(100_000), config.Limits.MaxRequestsPerFile)
		assert.Equal(t, types.MetricInt(500), config.Limits.MaxFilesPerResource)
	})
}

func TestLoad_TimeDuration(t *testing.T) {
	t.Parallel()

	t.Run("should parse time.Duration from string", func(t *testing.T) {
		t.Parallel()

		config := TestConfigWithMetrics{} //nolint:exhaustruct

		envData := map[string]any{
			"TIMEOUT": "5m",
		}

		mockResource := func(target *map[string]any) error {
			maps.Copy(*target, envData)

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, mockResource)

		require.NoError(t, err)
		assert.Equal(t, 5*time.Minute, config.Timeout)
	})

	t.Run("should use default time.Duration when not specified", func(t *testing.T) {
		t.Parallel()

		config := TestConfigWithMetrics{} //nolint:exhaustruct

		envData := map[string]any{}

		mockResource := func(target *map[string]any) error {
			maps.Copy(*target, envData)

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, mockResource)

		require.NoError(t, err)
		assert.Equal(t, 30*time.Second, config.Timeout)
	})
}

func TestLoad_MixedMetrics(t *testing.T) {
	t.Parallel()

	t.Run("should parse mixed metric values in real-world config scenario", func(t *testing.T) {
		t.Parallel()

		config := TestConfigWithMetrics{} //nolint:exhaustruct

		// Simulating config.json-like values
		envData := map[string]any{
			"MAX_TOKENS":            "1M",
			"MAX_TOKENS_PER_MINUTE": "3400K",
			"MAX_SIZE":              "50M",
			"RATE_MULTIPLIER":       "2.0",
			"TIMEOUT":               "1m",
		}

		mockResource := func(target *map[string]any) error {
			maps.Copy(*target, envData)

			return nil
		}

		cl := configfx.NewConfigManager()
		err := cl.Load(&config, mockResource)

		require.NoError(t, err)
		assert.Equal(t, types.MetricInt(1_000_000), config.MaxTokens)
		assert.Equal(t, types.MetricInt(3_400_000), config.MaxTokensPerMinute)
		assert.Equal(t, types.MetricInt(50_000_000), config.MaxSize)
		assert.InDelta(t, float64(2.0), float64(config.RateMultiplier), 0.001)
		assert.Equal(t, 1*time.Minute, config.Timeout)
	})
}

func TestLoadMeta_MetricTypes(t *testing.T) {
	t.Parallel()

	t.Run("should get config meta for MetricInt fields", func(t *testing.T) {
		t.Parallel()

		config := TestConfigWithMetrics{} //nolint:exhaustruct

		cl := configfx.NewConfigManager()
		meta, err := cl.LoadMeta(&config)

		require.NoError(t, err)
		assert.Equal(t, "root", meta.Name)

		// Find the max_tokens field
		var maxTokensMeta *configfx.ConfigItemMeta

		for i := range meta.Children {
			if meta.Children[i].Name == "max_tokens" {
				maxTokensMeta = &meta.Children[i]

				break
			}
		}

		require.NotNil(t, maxTokensMeta)
		assert.Equal(t, reflect.TypeFor[types.MetricInt](), maxTokensMeta.Type)
	})

	t.Run("should get config meta for MetricFloat fields", func(t *testing.T) {
		t.Parallel()

		config := TestConfigWithMetrics{} //nolint:exhaustruct

		cl := configfx.NewConfigManager()
		meta, err := cl.LoadMeta(&config)

		require.NoError(t, err)

		// Find the rate_multiplier field
		var rateMultiplierMeta *configfx.ConfigItemMeta

		for i := range meta.Children {
			if meta.Children[i].Name == "rate_multiplier" {
				rateMultiplierMeta = &meta.Children[i]

				break
			}
		}

		require.NotNil(t, rateMultiplierMeta)
		assert.Equal(t, reflect.TypeFor[types.MetricFloat](), rateMultiplierMeta.Type)
	})
}
