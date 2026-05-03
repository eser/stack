// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package configfx_test

import (
	"math"
	"testing"

	"github.com/eser/stack/pkg/ajan/configfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type floatConfig struct {
	F32 float32 `conf:"f32"`
	F64 float64 `conf:"f64"`
}

// TestReflectSetField_Float32_Valid confirms the one-line fix (float32 cast) is in place:
// without float32(floatValue), field.Set panics with a type mismatch.
func TestReflectSetField_Float32_Valid(t *testing.T) {
	t.Parallel()

	cfg := floatConfig{} //nolint:exhaustruct
	cl := configfx.NewConfigManager()

	err := cl.Load(&cfg, cl.FromJSONString(`{"f32": 3.14, "f64": 2.718}`))

	require.NoError(t, err)
	assert.InDelta(t, float32(3.14), cfg.F32, 0.001)
	assert.InDelta(t, 2.718, cfg.F64, 0.001)
}

// TestReflectSetField_Float32_NegativeAndZero covers sign and zero cases.
func TestReflectSetField_Float32_NegativeAndZero(t *testing.T) {
	t.Parallel()

	cfg := floatConfig{} //nolint:exhaustruct
	cl := configfx.NewConfigManager()

	err := cl.Load(&cfg, cl.FromJSONString(`{"f32": -1.5, "f64": 0.0}`))

	require.NoError(t, err)
	assert.InDelta(t, float32(-1.5), cfg.F32, 0.001)
	assert.InDelta(t, 0.0, cfg.F64, 0.001)
}

// TestReflectSetField_Float32_MalformedValue documents that a non-numeric string
// silently produces a zero value (strconv.ParseFloat error is discarded).
func TestReflectSetField_Float32_MalformedValue(t *testing.T) {
	t.Parallel()

	type malformedConfig struct {
		F32 float32 `conf:"f32"`
	}

	// JSON string "abc" is flattened to the string "abc" by flattenJSON.
	cfg := malformedConfig{} //nolint:exhaustruct
	cl := configfx.NewConfigManager()

	err := cl.Load(&cfg, cl.FromJSONString(`{"f32": "abc"}`))

	require.NoError(t, err)
	assert.Equal(t, float32(0), cfg.F32, "malformed float32 should silently produce zero")
}

// TestReflectSetField_Float32_Overflow documents that a value exceeding float32
// range produces +Inf (strconv.ParseFloat returns +Inf on ErrRange; error discarded).
func TestReflectSetField_Float32_Overflow(t *testing.T) {
	t.Parallel()

	cfg := floatConfig{} //nolint:exhaustruct
	cl := configfx.NewConfigManager()

	// 1e40 exceeds float32 max (~3.4e38); JSON flattener serialises it as "1e+40".
	err := cl.Load(&cfg, cl.FromJSONString(`{"f32": 1e40}`))

	require.NoError(t, err)
	assert.True(t, math.IsInf(float64(cfg.F32), 1), "float32 overflow should produce +Inf")
}
