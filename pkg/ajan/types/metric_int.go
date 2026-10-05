package types

import (
	"encoding/json"
	"errors"
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

	// metricIntUpperBoundF is 2^63, the smallest float64 that no longer fits
	// in an int64.
	metricIntUpperBoundF float64 = 1 << 63
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
		// A plain integer parses exactly; float64 would round anything above
		// 2^53 (9007199254740993 became 9007199254740992).
		parsedInt, err := strconv.ParseInt(input, 10, 64)
		if err == nil {
			return parsedInt, nil
		}

		if errors.Is(err, strconv.ErrRange) {
			return 0, metricIntOutOfRangeError(input)
		}

		mul = 1
		base = input
	}

	parsedNumber, err := strconv.ParseFloat(base, 64)
	if err != nil {
		return 0, fmt.Errorf("%w (base=%q): %w", ErrFailedToParseFloat, base, err)
	}

	// Scaling a decimal leaves binary float error ("8.11K" is
	// 8109.999999999999), so round to the nearest integer instead of
	// truncating toward zero.
	scaled := math.Round(parsedNumber * mul)

	// Go leaves the int64 conversion of NaN or an out-of-range float
	// implementation-defined ("1e19" gives math.MinInt64 on amd64 and
	// math.MaxInt64 on arm64), so reject those values.
	if math.IsNaN(scaled) || scaled >= metricIntUpperBoundF || scaled < math.MinInt64 {
		return 0, metricIntOutOfRangeError(input)
	}

	return int64(scaled), nil
}

func metricIntOutOfRangeError(input string) error {
	return fmt.Errorf(
		"%w (input=%q): the value must fit in a signed 64-bit integer",
		ErrMetricIntOutOfRange,
		input,
	)
}
