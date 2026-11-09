// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package resilience

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
)

// The JSON shapes of the retry policy, as @eserstack/httpclient sends them
// through the bridge: RetryConfig's field names, and numbers that may be NaN
// or infinite.

// ErrInvalidRetrySetting is returned for a retry setting that is neither
// false nor an object.
var ErrInvalidRetrySetting = errors.New("retry must be false or an object")

// ErrInvalidJSNumber is returned for a number that is neither a JSON number
// nor one of the strings "NaN", "Infinity" and "-Infinity".
var ErrInvalidJSNumber = errors.New(`expected a number, "NaN", "Infinity" or "-Infinity"`)

// JSNumber is a JavaScript number on the wire: a JSON number, or the string
// "NaN", "Infinity" or "-Infinity", which JSON has no number for.
type JSNumber float64

// UnmarshalJSON reads a JSON number or one of the three strings.
func (n *JSNumber) UnmarshalJSON(data []byte) error {
	if len(data) > 0 && data[0] == '"' {
		var text string
		if err := json.Unmarshal(data, &text); err != nil {
			return fmt.Errorf("read number: %w", err)
		}

		switch text {
		case "NaN":
			*n = JSNumber(math.NaN())
		case "Infinity":
			*n = JSNumber(math.Inf(1))
		case "-Infinity":
			*n = JSNumber(math.Inf(-1))
		default:
			return fmt.Errorf("read number %q: %w", text, ErrInvalidJSNumber)
		}

		return nil
	}

	var value float64
	if err := json.Unmarshal(data, &value); err != nil {
		return fmt.Errorf("read number: %w", err)
	}

	*n = JSNumber(value)

	return nil
}

// MarshalJSON writes a finite number as a JSON number and the others as their
// JavaScript names.
func (n JSNumber) MarshalJSON() ([]byte, error) {
	value := float64(n)

	switch {
	case math.IsNaN(value):
		return []byte(`"NaN"`), nil
	case math.IsInf(value, 1):
		return []byte(`"Infinity"`), nil
	case math.IsInf(value, -1):
		return []byte(`"-Infinity"`), nil
	}

	return []byte(strconv.FormatFloat(value, 'g', -1, 64)), nil
}

type retryConfigJSON struct {
	MaxAttempts       *JSNumber   `json:"maxAttempts"`
	InitialDelay      *JSNumber   `json:"initialDelay"`
	MaxDelay          *JSNumber   `json:"maxDelay"`
	Factor            *JSNumber   `json:"factor"`
	Jitter            *bool       `json:"jitter"`
	RetryableStatuses *[]JSNumber `json:"retryableStatuses"`
	RespectRetryAfter *bool       `json:"respectRetryAfter"`
}

type retryPolicyJSON struct {
	RetryableStatuses []JSNumber `json:"retryableStatuses"`
	MaxAttempts       JSNumber   `json:"maxAttempts"`
	InitialDelay      JSNumber   `json:"initialDelay"`
	MaxDelay          JSNumber   `json:"maxDelay"`
	Factor            JSNumber   `json:"factor"`
	Jitter            bool       `json:"jitter"`
	RespectRetryAfter bool       `json:"respectRetryAfter"`
}

type retryPlanJSON struct {
	Policy      *retryPolicyJSON `json:"policy"`
	MaxAttempts JSNumber         `json:"maxAttempts"`
}

func numberPointer(n *JSNumber) *float64 {
	if n == nil {
		return nil
	}

	value := float64(*n)

	return &value
}

func toFloats(numbers []JSNumber) []float64 {
	out := make([]float64, len(numbers))
	for i, n := range numbers {
		out[i] = float64(n)
	}

	return out
}

func toJSNumbers(values []float64) []JSNumber {
	out := make([]JSNumber, len(values))
	for i, v := range values {
		out[i] = JSNumber(v)
	}

	return out
}

// UnmarshalJSON reads false (off), null (absent) or a RetryConfig object; a
// field that is missing or null is not set.
func (s *RetrySetting) UnmarshalJSON(data []byte) error {
	trimmed := bytes.TrimSpace(data)

	switch {
	case bytes.Equal(trimmed, []byte("null")):
		*s = RetrySetting{} //nolint:exhaustruct // the absent setting

		return nil
	case bytes.Equal(trimmed, []byte("false")):
		*s = RetrySetting{Off: true} //nolint:exhaustruct // off has no config

		return nil
	case len(trimmed) == 0 || trimmed[0] != '{':
		return fmt.Errorf("read retry setting %s: %w", trimmed, ErrInvalidRetrySetting)
	}

	var raw retryConfigJSON
	if err := json.Unmarshal(trimmed, &raw); err != nil {
		return fmt.Errorf("read retry setting: %w", err)
	}

	config := RetryConfig{
		MaxAttempts:       numberPointer(raw.MaxAttempts),
		InitialDelay:      numberPointer(raw.InitialDelay),
		MaxDelay:          numberPointer(raw.MaxDelay),
		Factor:            numberPointer(raw.Factor),
		Jitter:            raw.Jitter,
		RetryableStatuses: nil,
		RespectRetryAfter: raw.RespectRetryAfter,
	}

	if raw.RetryableStatuses != nil {
		statuses := toFloats(*raw.RetryableStatuses)
		config.RetryableStatuses = &statuses
	}

	*s = RetrySetting{Config: config, Off: false}

	return nil
}

// MarshalJSON writes the plan with its policy, or a null policy when retries
// are off.
func (p RetryPlan) MarshalJSON() ([]byte, error) {
	out := retryPlanJSON{Policy: nil, MaxAttempts: JSNumber(p.MaxAttempts)}

	if p.Policy != nil {
		out.Policy = &retryPolicyJSON{
			RetryableStatuses: toJSNumbers(p.Policy.RetryableStatuses),
			MaxAttempts:       JSNumber(p.Policy.MaxAttempts),
			InitialDelay:      JSNumber(p.Policy.InitialDelay),
			MaxDelay:          JSNumber(p.Policy.MaxDelay),
			Factor:            JSNumber(p.Policy.Factor),
			Jitter:            p.Policy.Jitter,
			RespectRetryAfter: p.Policy.RespectRetryAfter,
		}
	}

	data, err := json.Marshal(out)
	if err != nil {
		return nil, fmt.Errorf("write retry plan: %w", err)
	}

	return data, nil
}

// UnmarshalJSON reads a plan that MarshalJSON wrote.
func (p *RetryPlan) UnmarshalJSON(data []byte) error {
	var raw retryPlanJSON
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("read retry plan: %w", err)
	}

	*p = RetryPlan{Policy: nil, MaxAttempts: float64(raw.MaxAttempts)}

	if raw.Policy != nil {
		p.Policy = &RetryPolicy{
			RetryableStatuses: toFloats(raw.Policy.RetryableStatuses),
			MaxAttempts:       float64(raw.Policy.MaxAttempts),
			InitialDelay:      float64(raw.Policy.InitialDelay),
			MaxDelay:          float64(raw.Policy.MaxDelay),
			Factor:            float64(raw.Policy.Factor),
			Jitter:            raw.Policy.Jitter,
			RespectRetryAfter: raw.Policy.RespectRetryAfter,
		}
	}

	return nil
}
