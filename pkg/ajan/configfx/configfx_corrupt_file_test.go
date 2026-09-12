package configfx_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/eser/stack/pkg/ajan/configfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestLoad_CorruptFileIsNotSilentlyIgnored pins that a malformed config file
// surfaces as an error.
//
// Both file parsers ended with `defer func() { err = file.Close() }()`, which
// overwrote the named return unconditionally. Close succeeds on a file that
// parsed badly, so its nil erased the parse error: a truncated or corrupt file
// was indistinguishable from a valid one, and the process continued with an
// empty config it believed it had loaded.
func TestLoad_CorruptFileIsNotSilentlyIgnored(t *testing.T) {
	t.Parallel()

	type appConfig struct {
		Name string `conf:"name"`
	}

	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")

	require.NoError(
		t,
		os.WriteFile(path, []byte(`{"name": "app"`), 0o600),
	)

	cfg := appConfig{} //nolint:exhaustruct
	cl := configfx.NewConfigManager()

	err := cl.Load(&cfg, cl.FromJSONFile(path))

	require.Error(t, err)
	assert.Empty(t, cfg.Name)
}

// TestLoad_ValidFileStillLoads guards the other direction: the close-error
// handling must not start reporting failures for files that parsed fine.
func TestLoad_ValidFileStillLoads(t *testing.T) {
	t.Parallel()

	type appConfig struct {
		Name string `conf:"name"`
	}

	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")

	require.NoError(
		t,
		os.WriteFile(path, []byte(`{"name": "app"}`), 0o600),
	)

	cfg := appConfig{} //nolint:exhaustruct
	cl := configfx.NewConfigManager()

	err := cl.Load(&cfg, cl.FromJSONFile(path))

	require.NoError(t, err)
	assert.Equal(t, "app", cfg.Name)
}
