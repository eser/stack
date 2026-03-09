package types

import (
	"fmt"
	"strconv"
)

// Metric scale thresholds and suffixes.
const (
	metricFloatBillion  float64 = 1_000_000_000
	metricFloatMillion  float64 = 1_000_000
	metricFloatThousand float64 = 1_000
)

type MetricFloat float64

func (m *MetricFloat) UnmarshalText(text []byte) error {
	parsed, err := parseMetricFloatString(string(text))
	if err != nil {
		return err
	}

	*m = MetricFloat(parsed)

	return nil
}

func (m *MetricFloat) MarshalText() ([]byte, error) {
	return fmt.Appendf(nil, "%f", *m), nil
}

// HumanReadable returns a human-readable string representation of the metric.
// Examples: 1000 -> "1K", 1500000 -> "1.5M", 2000000000 -> "2B".
func (m *MetricFloat) HumanReadable() string {
	value := float64(*m)

	if value == 0 {
		return "0"
	}

	sign := ""

	absValue := value
	if value < 0 {
		absValue = -value
		sign = "-"
	}

	return formatFloatHumanReadable(sign, absValue)
}

// formatFloatHumanReadable formats an absolute float value with the given sign prefix.
func formatFloatHumanReadable(sign string, absValue float64) string {
	switch {
	case absValue >= metricFloatBillion:
		return formatFloatWithSuffix(sign, absValue/metricFloatBillion, "B")
	case absValue >= metricFloatMillion:
		return formatFloatWithSuffix(sign, absValue/metricFloatMillion, "M")
	case absValue >= metricFloatThousand:
		return formatFloatWithSuffix(sign, absValue/metricFloatThousand, "K")
	default:
		if absValue == float64(int64(absValue)) {
			return fmt.Sprintf("%s%d", sign, int64(absValue))
		}

		return fmt.Sprintf("%s%.1f", sign, absValue)
	}
}

// formatFloatWithSuffix formats a scaled value with the given suffix (B, M, K).
func formatFloatWithSuffix(sign string, scaled float64, suffix string) string {
	if scaled == float64(int64(scaled)) {
		return fmt.Sprintf("%s%d%s", sign, int64(scaled), suffix)
	}

	return fmt.Sprintf("%s%.1f%s", sign, scaled, suffix)
}

func parseMetricFloatString(input string) (float64, error) {
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
		mul = metricFloatThousand
	case 'm', 'M':
		mul = metricFloatMillion
	case 'b', 'B':
		mul = metricFloatBillion
	default:
		mul = 1
		base = input
	}

	parsedNumber, err := strconv.ParseFloat(base, 64)
	if err != nil {
		return 0, fmt.Errorf("%w (base=%q): %w", ErrFailedToParseFloat, base, err)
	}

	return parsedNumber * mul, nil
}
