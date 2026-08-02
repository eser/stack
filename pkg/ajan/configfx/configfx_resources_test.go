// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package configfx_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/eser/stack/pkg/ajan/configfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type ResourceTestConfig struct {
	Host string `conf:"host" default:"localhost"`
	Port int    `conf:"port" default:"8080"`
}

// ─── FromJSONString ───────────────────────────────────────────────────────────

func TestFromJSONString_ParsesJSON(t *testing.T) {
	t.Parallel()

	config := ResourceTestConfig{} //nolint:exhaustruct
	cl := configfx.NewConfigManager()

	err := cl.Load(&config, cl.FromJSONString(`{"host":"db.example.com","port":5432}`))

	require.NoError(t, err)
	assert.Equal(t, "db.example.com", config.Host)
	assert.Equal(t, 5432, config.Port)
}

func TestFromJSONString_InvalidJSON_Error(t *testing.T) {
	t.Parallel()

	config := ResourceTestConfig{} //nolint:exhaustruct
	cl := configfx.NewConfigManager()

	err := cl.Load(&config, cl.FromJSONString("not-json"))

	require.Error(t, err)
}

// ─── FromJSONFileDirect ────────────────────────────────────────────────────────

func TestFromJSONFileDirect_ParsesFile(t *testing.T) {
	t.Parallel()

	config := ResourceTestConfig{} //nolint:exhaustruct
	cl := configfx.NewConfigManager()

	err := cl.Load(&config, cl.FromJSONFileDirect("testdata/config.json"))

	require.NoError(t, err)
	assert.Equal(t, "localhost", config.Host)
	assert.Equal(t, 8080, config.Port)
}

func TestFromJSONFileDirect_MissingFile_Skipped(t *testing.T) {
	t.Parallel()

	config := ResourceTestConfig{} //nolint:exhaustruct
	cl := configfx.NewConfigManager()

	// Missing files are silently skipped; defaults are used.
	err := cl.Load(&config, cl.FromJSONFileDirect("testdata/nonexistent.json"))

	require.NoError(t, err)
	assert.Equal(t, "localhost", config.Host) // default
}

// ─── FromEnvFileDirect ─────────────────────────────────────────────────────────

func TestFromEnvFileDirect_ParsesFile(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	envPath := filepath.Join(dir, ".env")

	if err := os.WriteFile(envPath, []byte("HOST=envhost\nPORT=9000\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	config := ResourceTestConfig{} //nolint:exhaustruct
	cl := configfx.NewConfigManager()

	err := cl.Load(&config, cl.FromEnvFileDirect(envPath, true))

	require.NoError(t, err)
	assert.Equal(t, "envhost", config.Host)
	assert.Equal(t, 9000, config.Port)
}

func TestFromEnvFileDirect_MissingFile_Skipped(t *testing.T) {
	t.Parallel()

	config := ResourceTestConfig{} //nolint:exhaustruct
	cl := configfx.NewConfigManager()

	// Missing files are silently skipped; defaults are used.
	err := cl.Load(&config, cl.FromEnvFileDirect("/nonexistent/.env", false))

	require.NoError(t, err)
	assert.Equal(t, "localhost", config.Host) // default
}

// ─── LoadDefaults ─────────────────────────────────────────────────────────────

func TestLoadDefaults_MissingFiles_UsesSystemEnv(t *testing.T) {
	t.Parallel()

	// Run in CWD that has no config.json/.env — LoadDefaults falls through to system env.
	config := ResourceTestConfig{} //nolint:exhaustruct
	cl := configfx.NewConfigManager()

	err := cl.LoadDefaults(&config)

	// Should succeed (missing files are silently skipped, system env applied).
	require.NoError(t, err)
}
