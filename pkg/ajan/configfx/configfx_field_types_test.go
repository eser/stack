// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package configfx_test

import (
	"maps"
	"testing"

	"github.com/eser/stack/pkg/ajan/configfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestConfigIntTypes exercises reflectSetField for all signed integer types.
type TestConfigIntTypes struct {
	FieldInt8  int8  `conf:"int8"`
	FieldInt16 int16 `conf:"int16"`
	FieldInt32 int32 `conf:"int32"`
	FieldInt64 int64 `conf:"int64"`
}

func TestLoad_SignedIntTypes(t *testing.T) {
	t.Parallel()

	config := TestConfigIntTypes{} //nolint:exhaustruct

	envData := map[string]any{
		"INT8":  "127",
		"INT16": "32767",
		"INT32": "2147483647",
		"INT64": "9223372036854775807",
	}

	mockResource := func(target *map[string]any) error {
		maps.Copy(*target, envData)
		return nil
	}

	cl := configfx.NewConfigManager()
	err := cl.Load(&config, mockResource)

	require.NoError(t, err)
	assert.Equal(t, int8(127), config.FieldInt8)
	assert.Equal(t, int16(32767), config.FieldInt16)
	assert.Equal(t, int32(2147483647), config.FieldInt32)
	assert.Equal(t, int64(9223372036854775807), config.FieldInt64)
}

// TestConfigUintTypes exercises reflectSetField for unsigned integer types.
// uint8, uint16, uint32, uint64 — uint is included here; uint16 already
// covered by manager_test.go but included for completeness.
type TestConfigUintTypes struct {
	FieldUint   uint   `conf:"uint"`
	FieldUint8  uint8  `conf:"uint8"`
	FieldUint32 uint32 `conf:"uint32"`
	FieldUint64 uint64 `conf:"uint64"`
}

func TestLoad_UnsignedIntTypes(t *testing.T) {
	t.Parallel()

	config := TestConfigUintTypes{} //nolint:exhaustruct

	envData := map[string]any{
		"UINT":   "42",
		"UINT8":  "255",
		"UINT32": "4294967295",
		"UINT64": "18446744073709551615",
	}

	mockResource := func(target *map[string]any) error {
		maps.Copy(*target, envData)
		return nil
	}

	cl := configfx.NewConfigManager()
	err := cl.Load(&config, mockResource)

	require.NoError(t, err)
	assert.Equal(t, uint(42), config.FieldUint)
	assert.Equal(t, uint8(255), config.FieldUint8)
	assert.Equal(t, uint32(4294967295), config.FieldUint32)
	assert.Equal(t, uint64(18446744073709551615), config.FieldUint64)
}

// TestConfigBoolType exercises the bool branch in reflectSetField.
type TestConfigBoolType struct {
	Enabled bool `conf:"enabled"`
	Debug   bool `conf:"debug"`
}

func TestLoad_BoolType(t *testing.T) {
	t.Parallel()

	config := TestConfigBoolType{} //nolint:exhaustruct

	envData := map[string]any{
		"ENABLED": "true",
		"DEBUG":   "false",
	}

	mockResource := func(target *map[string]any) error {
		maps.Copy(*target, envData)
		return nil
	}

	cl := configfx.NewConfigManager()
	err := cl.Load(&config, mockResource)

	require.NoError(t, err)
	assert.True(t, config.Enabled)
	assert.False(t, config.Debug)
}

// TestLoadMeta_PointerToStruct exercises the pointer-to-struct branch in reflectMeta.
type TestConfigPtrNestedItem struct {
	Value string `conf:"value"`
}

type TestConfigWithPtrNested struct {
	Name   string                   `conf:"name"`
	Nested *TestConfigPtrNestedItem `conf:"nested"`
}

func TestLoadMeta_PointerToStruct(t *testing.T) {
	t.Parallel()

	config := TestConfigWithPtrNested{} //nolint:exhaustruct

	cl := configfx.NewConfigManager()
	meta, err := cl.LoadMeta(&config)

	require.NoError(t, err)
	assert.Equal(t, "root", meta.Name)

	var nestedMeta *configfx.ConfigItemMeta
	for i := range meta.Children {
		if meta.Children[i].Name == "nested" {
			nestedMeta = &meta.Children[i]
			break
		}
	}

	require.NotNil(t, nestedMeta, "nested field should appear in meta")
	require.NotNil(t, nestedMeta.Children, "pointer-to-struct field should have children")
	assert.Len(t, nestedMeta.Children, 1)
	assert.Equal(t, "value", nestedMeta.Children[0].Name)
}

// TestLoadMeta_NonStruct exercises the non-struct error path in reflectMeta.
func TestLoadMeta_NonStruct(t *testing.T) {
	t.Parallel()

	value := 42

	cl := configfx.NewConfigManager()
	_, err := cl.LoadMeta(&value)

	require.Error(t, err)
}
