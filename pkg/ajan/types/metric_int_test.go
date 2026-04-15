package types_test

import (
	"encoding/json"
	"testing"

	"github.com/eser/stack/pkg/ajan/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMetricInt_UnmarshalText(t *testing.T) { //nolint:funlen
	t.Parallel()

	tests := []struct {
		name     string
		input    string
		expected int64
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
			name:     "3400K like config",
			input:    "3400K",
			expected: 3_400_000,
			wantErr:  false,
		},
		{
			name:     "decimal with K",
			input:    "1.5K",
			expected: 1500,
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
			name:     "50M like config",
			input:    "50M",
			expected: 50_000_000,
			wantErr:  false,
		},
		{
			name:     "200M like config",
			input:    "200M",
			expected: 200_000_000,
			wantErr:  false,
		},
		{
			name:     "decimal with M",
			input:    "1.5M",
			expected: 1_500_000,
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

		// Edge cases
		{
			name:     "small decimal with K",
			input:    "0.5K",
			expected: 500,
			wantErr:  false,
		},
		{
			name:     "large number without suffix",
			input:    "1000000",
			expected: 1_000_000,
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

			var metric types.MetricInt

			err := metric.UnmarshalText([]byte(testCase.input))

			if testCase.wantErr {
				assert.Error(t, err)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, testCase.expected, int64(metric))
		})
	}
}

func TestMetricInt_UnmarshalJSON(t *testing.T) { //nolint:funlen
	t.Parallel()

	tests := []struct {
		name     string
		json     string
		expected int64
		wantErr  bool
	}{
		// Numeric JSON values
		{
			name:     "json number",
			json:     `1000`,
			expected: 1000,
			wantErr:  false,
		},
		{
			name:     "json zero",
			json:     `0`,
			expected: 0,
			wantErr:  false,
		},
		{
			name:     "json large number",
			json:     `1000000`,
			expected: 1_000_000,
			wantErr:  false,
		},

		// String JSON values with suffixes
		{
			name:     "json string K",
			json:     `"100K"`,
			expected: 100_000,
			wantErr:  false,
		},
		{
			name:     "json string M",
			json:     `"1M"`,
			expected: 1_000_000,
			wantErr:  false,
		},
		{
			name:     "json string B",
			json:     `"1B"`,
			expected: 1_000_000_000,
			wantErr:  false,
		},
		{
			name:     "json string 3400K",
			json:     `"3400K"`,
			expected: 3_400_000,
			wantErr:  false,
		},
		{
			name:     "json string 50M",
			json:     `"50M"`,
			expected: 50_000_000,
			wantErr:  false,
		},
		{
			name:     "json string plain number",
			json:     `"1000"`,
			expected: 1000,
			wantErr:  false,
		},

		// Error cases
		{
			name:     "json invalid type array",
			json:     `[]`,
			expected: 0,
			wantErr:  true,
		},
		{
			name:     "json invalid type object",
			json:     `{}`,
			expected: 0,
			wantErr:  true,
		},
		{
			name:     "json invalid string",
			json:     `"invalid"`,
			expected: 0,
			wantErr:  true,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			var metric types.MetricInt

			err := json.Unmarshal([]byte(testCase.json), &metric)

			if testCase.wantErr {
				assert.Error(t, err)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, testCase.expected, int64(metric))
		})
	}
}

func TestMetricInt_MarshalText(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		value    types.MetricInt
		expected string
	}{
		{
			name:     "zero",
			value:    0,
			expected: "0",
		},
		{
			name:     "thousand",
			value:    1000,
			expected: "1000",
		},
		{
			name:     "million",
			value:    1_000_000,
			expected: "1000000",
		},
		{
			name:     "3400K value",
			value:    3_400_000,
			expected: "3400000",
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

func TestMetricInt_JSONRoundTrip(t *testing.T) {
	t.Parallel()

	type TestStruct struct {
		Limit types.MetricInt `json:"limit"`
	}

	original := TestStruct{Limit: 3_400_000}

	data, err := json.Marshal(original)
	require.NoError(t, err)

	var decoded TestStruct

	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)

	assert.Equal(t, original.Limit, decoded.Limit)
}

func TestMetricInt_JSONUnmarshalInStruct(t *testing.T) {
	t.Parallel()

	type Config struct {
		MaxTokens types.MetricInt `json:"max_tokens"`
		MaxSize   types.MetricInt `json:"max_size"`
	}

	jsonData := `{"max_tokens": "3400K", "max_size": 50000000}`

	var config Config

	err := json.Unmarshal([]byte(jsonData), &config)
	require.NoError(t, err)

	assert.Equal(t, types.MetricInt(3_400_000), config.MaxTokens)
	assert.Equal(t, types.MetricInt(50_000_000), config.MaxSize)
}

func TestMetricInt_Int64Conversion(t *testing.T) {
	t.Parallel()

	metric := types.MetricInt(1_000_000)

	// Test explicit conversion to int64
	result := int64(metric)
	assert.Equal(t, int64(1_000_000), result)

	// Test arithmetic operations
	doubled := int64(metric) * 2
	assert.Equal(t, int64(2_000_000), doubled)
}

func TestMetricInt_Rounding(t *testing.T) {
	t.Parallel()

	// Test that decimal values get rounded correctly
	tests := []struct {
		name     string
		input    string
		expected int64
	}{
		{
			name:     "rounds 1.4K down",
			input:    "1.4K",
			expected: 1400,
		},
		{
			name:     "rounds 1.5K up",
			input:    "1.5K",
			expected: 1500,
		},
		{
			name:     "rounds 1.9K",
			input:    "1.9K",
			expected: 1900,
		},
		{
			name:     "handles 3.4M",
			input:    "3.4M",
			expected: 3_400_000,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			var metric types.MetricInt

			err := metric.UnmarshalText([]byte(testCase.input))
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, int64(metric))
		})
	}
}

func TestMetricInt_HumanReadable(t *testing.T) { //nolint:funlen
	t.Parallel()

	tests := []struct {
		name     string
		value    types.MetricInt
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

		// Thousands (K)
		{
			name:     "exactly 1K",
			value:    1000,
			expected: "1K",
		},
		{
			name:     "exactly 5K",
			value:    5000,
			expected: "5K",
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
		{
			name:     "999K",
			value:    999_000,
			expected: "999K",
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
			name:     "3.4M (like config)",
			value:    3_400_000,
			expected: "3.4M",
		},
		{
			name:     "50M",
			value:    50_000_000,
			expected: "50M",
		},
		{
			name:     "200M",
			value:    200_000_000,
			expected: "200M",
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

func TestMetricInt_HumanReadableRoundTrip(t *testing.T) {
	t.Parallel()

	// Test that HumanReadable output can be parsed back
	testCases := []types.MetricInt{
		0,
		1000,
		1_500_000,
		3_400_000,
		1_000_000_000,
	}

	for _, original := range testCases {
		t.Run(original.HumanReadable(), func(t *testing.T) {
			t.Parallel()

			humanReadable := original.HumanReadable()

			var parsed types.MetricInt

			err := parsed.UnmarshalText([]byte(humanReadable))
			require.NoError(t, err)
			assert.Equal(t, original, parsed)
		})
	}
}
