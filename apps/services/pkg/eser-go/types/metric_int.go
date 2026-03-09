package types

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
)

// Metric scale thresholds for integer metrics.
const (
	metricIntBillion   int64   = 1_000_000_000
	metricIntMillion   int64   = 1_000_000
	metricIntThousand  int64   = 1_000
	metricIntBillionF  float64 = 1_000_000_000
	metricIntMillionF  float64 = 1_000_000
	metricIntThousandF float64 = 1_000
)

type MetricInt int64

func (m *MetricInt) UnmarshalText(text []byte) error {
	parsed, err := parseMetricIntString(string(text))
	if err != nil {
		return err
	}

	*m = MetricInt(parsed)

	return nil
}

func (m *MetricInt) UnmarshalJSON(data []byte) error {
	// First try to unmarshal as a number
	var num int64

	numErr := json.Unmarshal(data, &num)
	if numErr == nil {
		*m = MetricInt(num)

		return nil
	}

	// If not a number, try as a string (e.g., "3400K", "1M")
	var str string

	strErr := json.Unmarshal(data, &str)
	if strErr != nil {
		return fmt.Errorf("MetricInt must be a number or string: %w", strErr)
	}

	parsed, err := parseMetricIntString(str)
	if err != nil {
		return err
	}

	*m = MetricInt(parsed)

	return nil
}

func (m *MetricInt) MarshalText() ([]byte, error) {
	return fmt.Appendf(nil, "%d", *m), nil
}

// HumanReadable returns a human-readable string representation of the metric.
// Examples: 1000 -> "1K", 1500000 -> "1.5M", 2000000000 -> "2B".
func (m *MetricInt) HumanReadable() string {
	value := int64(*m)

	if value == 0 {
		return "0"
	}

	absValue := value
	sign := ""

	if value < 0 {
		absValue = -value
		sign = "-"
	}

	return formatIntHumanReadable(sign, absValue)
}

// formatIntHumanReadable formats an absolute int64 value with the given sign prefix.
func formatIntHumanReadable(sign string, absValue int64) string {
	switch {
	case absValue >= metricIntBillion:
		return formatIntWithSuffix(sign, float64(absValue)/metricIntBillionF, "B")
	case absValue >= metricIntMillion:
		return formatIntWithSuffix(sign, float64(absValue)/metricIntMillionF, "M")
	case absValue >= metricIntThousand:
		return formatIntWithSuffix(sign, float64(absValue)/metricIntThousandF, "K")
	default:
		return fmt.Sprintf("%s%d", sign, absValue)
	}
}

// formatIntWithSuffix formats a scaled value with the given suffix (B, M, K).
func formatIntWithSuffix(sign string, scaled float64, suffix string) string {
	if scaled == float64(int64(scaled)) {
		return fmt.Sprintf("%s%d%s", sign, int64(scaled), suffix)
	}

	return fmt.Sprintf("%s%.1f%s", sign, scaled, suffix)
}

func parseMetricIntString(input string) (int64, error) {
	length := len(input)
	if length == 0 {
		return 0, nil
	}

	// pull off the last rune
	last := input[length-1]
	base := input[:length-1]

	var mul float64

	switch last {
	case 'k', 'K':
		mul = metricIntThousandF
	case 'm', 'M':
		mul = metricIntMillionF
	case 'b', 'B':
		mul = metricIntBillionF
	default:
		mul = 1
		base = input
	}

	parsedNumber, err := strconv.ParseFloat(base, 64)
	if err != nil {
		return 0, fmt.Errorf("%w (base=%q): %w", ErrFailedToParseFloat, base, err)
	}

	// FIXME(@eser) this is a hack to round the number to the nearest integer
	return int64(math.Round(parsedNumber * mul)), nil
}
