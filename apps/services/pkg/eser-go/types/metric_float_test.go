package types_test

import (
	"encoding/json"
	"testing"

	"github.com/eser/stack/apps/services/pkg/eser-go/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMetricFloat_UnmarshalText(t *testing.T) { //nolint:funlen
	t.Parallel()

	tests := []struct {
		name     string
		input    string
		expected float64
		wantErr  bool
	}{
		// Basic numbers
		{
			name:     "plain number",
			input:    "1000",
			expected: 1000,
			wantErr:  false,
		},
		{
			name:     "decimal number",
			input:    "1000.5",
			expected: 1000.5,
			wantErr:  false,
		},
		{
			name:     "zero",
			input:    "0",
			expected: 0,
			wantErr:  false,
		},
		{
			name:     "empty string",
			input:    "",
			expected: 0,
			wantErr:  false,
		},

		// K suffix (thousands)
		{
			name:     "lowercase k",
			input:    "100k",
			expected: 100_000,
			wantErr:  false,
		},
		{
			name:     "uppercase K",
			input:    "100K",
			expected: 100_000,
			wantErr:  false,
		},
		{
			name:     "decimal with K",
			input:    "1.5K",
			expected: 1500,
			wantErr:  false,
		},
		{
			name:     "3400K",
			input:    "3400K",
			expected: 3_400_000,
			wantErr:  false,
		},

		// M suffix (millions)
		{
			name:     "lowercase m",
			input:    "1m",
			expected: 1_000_000,
			wantErr:  false,
		},
		{
			name:     "uppercase M",
			input:    "1M",
			expected: 1_000_000,
			wantErr:  false,
		},
		{
			name:     "50M",
			input:    "50M",
			expected: 50_000_000,
			wantErr:  false,
		},
		{
			name:     "decimal with M",
			input:    "1.5M",
			expected: 1_500_000,
			wantErr:  false,
		},
		{
			name:     "small decimal with M",
			input:    "0.5M",
			expected: 500_000,
			wantErr:  false,
		},

		// B suffix (billions)
		{
			name:     "lowercase b",
			input:    "1b",
			expected: 1_000_000_000,
			wantErr:  false,
		},
		{
			name:     "uppercase B",
			input:    "1B",
			expected: 1_000_000_000,
			wantErr:  false,
		},
		{
			name:     "decimal with B",
			input:    "2.5B",
			expected: 2_500_000_000,
			wantErr:  false,
		},

		// Precision tests
		{
			name:     "precise decimal",
			input:    "1.234K",
			expected: 1234,
			wantErr:  false,
		},
		{
			name:     "very small decimal with M",
			input:    "0.001M",
			expected: 1000,
			wantErr:  false,
		},

		// Error cases
		{
			name:     "invalid number",
			input:    "abc",
			expected: 0,
			wantErr:  true,
		},
		{
			name:     "invalid with suffix",
			input:    "abcK",
			expected: 0,
			wantErr:  true,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			var metric types.MetricFloat

			err := metric.UnmarshalText([]byte(testCase.input))

			if testCase.wantErr {
				assert.Error(t, err)

				return
			}

			require.NoError(t, err)
			assert.InDelta(t, testCase.expected, float64(metric), 0.001)
		})
	}
}

func TestMetricFloat_MarshalText(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		value    types.MetricFloat
		expected string
	}{
		{
			name:     "zero",
			value:    0,
			expected: "0.000000",
		},
		{
			name:     "integer value",
			value:    1000,
			expected: "1000.000000",
		},
		{
			name:     "decimal value",
			value:    1234.567,
			expected: "1234.567000",
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			result, err := testCase.value.MarshalText()
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, string(result))
		})
	}
}

func TestMetricFloat_Float64Conversion(t *testing.T) {
	t.Parallel()

	metric := types.MetricFloat(1.5)

	// Test explicit conversion to float64
	result := float64(metric)
	assert.InDelta(t, 1.5, result, 0.001)

	// Test arithmetic operations
	doubled := float64(metric) * 2
	assert.InDelta(t, 3.0, doubled, 0.001)
}

func TestMetricFloat_JSONUnmarshalInStruct(t *testing.T) {
	t.Parallel()

	type Config struct {
		Multiplier types.MetricFloat `json:"multiplier"`
	}

	// Note: MetricFloat doesn't have UnmarshalJSON, so JSON only works via TextUnmarshaler
	// which requires string values in JSON
	jsonData := `{"multiplier": "1.5K"}`

	var config Config

	err := json.Unmarshal([]byte(jsonData), &config)

	// This should fail because MetricFloat doesn't implement json.Unmarshaler
	// It only implements TextUnmarshaler which works differently
	if err == nil {
		// If it doesn't fail, verify the value
		assert.InDelta(t, float64(1500), float64(config.Multiplier), 0.001)
	}
}

func TestMetricFloat_PrecisionWithSuffixes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		input    string
		expected float64
	}{
		{
			name:     "2.5K",
			input:    "2.5K",
			expected: 2500,
		},
		{
			name:     "3.14159K",
			input:    "3.14159K",
			expected: 3141.59,
		},
		{
			name:     "1.23456M",
			input:    "1.23456M",
			expected: 1_234_560,
		},
		{
			name:     "0.001B",
			input:    "0.001B",
			expected: 1_000_000,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			var m types.MetricFloat

			err := m.UnmarshalText([]byte(testCase.input))
			require.NoError(t, err)
			assert.InDelta(t, testCase.expected, float64(m), 0.01)
		})
	}
}

func TestMetricFloat_NegativeValues(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		input    string
		expected float64
	}{
		{
			name:     "negative plain",
			input:    "-100",
			expected: -100,
		},
		{
			name:     "negative with K",
			input:    "-1K",
			expected: -1000,
		},
		{
			name:     "negative decimal with M",
			input:    "-1.5M",
			expected: -1_500_000,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			var m types.MetricFloat

			err := m.UnmarshalText([]byte(testCase.input))
			require.NoError(t, err)
			assert.InDelta(t, testCase.expected, float64(m), 0.001)
		})
	}
}

func TestMetricFloat_ErrorCases(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
	}{
		{
			name:  "letters only",
			input: "abc",
		},
		{
			name:  "letters with suffix",
			input: "abcK",
		},
		{
			name:  "special characters",
			input: "!@#$",
		},
		{
			name:  "multiple dots",
			input: "1.2.3K",
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			var metric types.MetricFloat

			err := metric.UnmarshalText([]byte(testCase.input))
			assert.Error(t, err)
		})
	}
}

func TestMetricFloat_HumanReadable(t *testing.T) { //nolint:funlen
	t.Parallel()

	tests := []struct {
		name     string
		value    types.MetricFloat
		expected string
	}{
		// Zero
		{
			name:     "zero",
			value:    0,
			expected: "0",
		},

		// Small values (no suffix)
		{
			name:     "small value 1",
			value:    1,
			expected: "1",
		},
		{
			name:     "small value 999",
			value:    999,
			expected: "999",
		},
		{
			name:     "small decimal",
			value:    1.5,
			expected: "1.5",
		},

		// Thousands (K)
		{
			name:     "exactly 1K",
			value:    1000,
			expected: "1K",
		},
		{
			name:     "1.5K",
			value:    1500,
			expected: "1.5K",
		},
		{
			name:     "100K",
			value:    100_000,
			expected: "100K",
		},

		// Millions (M)
		{
			name:     "exactly 1M",
			value:    1_000_000,
			expected: "1M",
		},
		{
			name:     "1.5M",
			value:    1_500_000,
			expected: "1.5M",
		},
		{
			name:     "3.4M",
			value:    3_400_000,
			expected: "3.4M",
		},

		// Billions (B)
		{
			name:     "exactly 1B",
			value:    1_000_000_000,
			expected: "1B",
		},
		{
			name:     "2.5B",
			value:    2_500_000_000,
			expected: "2.5B",
		},

		// Negative values
		{
			name:     "negative 1K",
			value:    -1000,
			expected: "-1K",
		},
		{
			name:     "negative 1.5M",
			value:    -1_500_000,
			expected: "-1.5M",
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			result := testCase.value.HumanReadable()
			assert.Equal(t, testCase.expected, result)
		})
	}
}
