// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package envparser_test

import (
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"testing"

	"github.com/eser/stack/pkg/ajan/configfx/envparser"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The fixtures dotenv_cases.json and dotenv_load.json were written from what
// @eserstack/config/dotenv answered when it parsed .env files in TypeScript;
// its bridge.test.ts runs the same cases through the bridge.

type dotenvCase struct {
	Env     map[string]string `json:"env"`
	Name    string            `json:"name"`
	Text    string            `json:"text"`
	Entries [][2]string       `json:"entries"`
	Ignored []string          `json:"ignored"`
}

type dotenvLoadError struct {
	File     string  `json:"file"`
	FileSize int64   `json:"fileSize"`
	MaxSize  float64 `json:"maxSize"`
}

type dotenvLoadCase struct {
	Env             *string          `json:"env"`
	MaxFileSize     *float64         `json:"maxFileSize"`
	Error           *dotenvLoadError `json:"error"`
	Name            string           `json:"name"`
	Dir             string           `json:"dir"`
	DefaultEnvValue string           `json:"defaultEnvValue"`
	EnvName         string           `json:"envName"`
	EnvVars         []string         `json:"envVars"`
	Environ         [][2]string      `json:"environ"`
	Entries         [][2]string      `json:"entries"`
	Ignored         []string         `json:"ignored"`
	LoadProcessEnv  bool             `json:"loadProcessEnv"`
}

type dotenvLoadFixture struct {
	Files map[string]string `json:"files"`
	Cases []dotenvLoadCase  `json:"cases"`
}

func readJSONFixture(t *testing.T, name string, out any) {
	t.Helper()

	raw, err := os.ReadFile(filepath.Clean(filepath.Join("testdata", name)))
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(raw, out))
}

func entryPairs(entries []envparser.DotenvEntry) [][2]string {
	pairs := make([][2]string, 0, len(entries))
	for _, entry := range entries {
		pairs = append(pairs, [2]string{entry.Key, entry.Value})
	}

	return pairs
}

func pairEntries(pairs [][2]string) []envparser.DotenvEntry {
	entries := make([]envparser.DotenvEntry, 0, len(pairs))
	for _, pair := range pairs {
		entries = append(entries, envparser.DotenvEntry{Key: pair[0], Value: pair[1]})
	}

	return entries
}

func TestParseDotenvFixtures(t *testing.T) {
	t.Parallel()

	var cases []dotenvCase

	readJSONFixture(t, "dotenv_cases.json", &cases)
	require.NotEmpty(t, cases)

	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			lookup := func(name string) (string, bool) {
				value, ok := tc.Env[name]

				return value, ok
			}

			got := envparser.ParseDotenv(tc.Text, lookup)

			want := tc.Entries
			if want == nil {
				want = [][2]string{}
			}

			assert.Equal(t, want, entryPairs(got.Entries))
			assert.Equal(t, tc.Ignored, got.Ignored)
		})
	}
}

func writeDotenvFiles(t *testing.T, files map[string]string) string {
	t.Helper()

	dir := t.TempDir()
	for name, content := range files {
		require.NoError(t, os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600))
	}

	return dir
}

func TestLoadDotenvFixtures(t *testing.T) {
	t.Parallel()

	var fixture dotenvLoadFixture

	readJSONFixture(t, "dotenv_load.json", &fixture)
	require.NotEmpty(t, fixture.Cases)

	dir := writeDotenvFiles(t, fixture.Files)

	for _, tc := range fixture.Cases {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			baseDir := dir
			if tc.Dir != "" {
				baseDir = filepath.Join(dir, tc.Dir)
			}

			defaultEnv := tc.DefaultEnvValue
			if defaultEnv == "" {
				defaultEnv = "development"
			}

			maxFileSize := float64(envparser.DefaultDotenvMaxFileSize)
			if tc.MaxFileSize != nil {
				maxFileSize = *tc.MaxFileSize
			}

			environ := pairEntries(tc.Environ)
			got, err := envparser.LoadDotenv(&envparser.DotenvLoadOptions{
				Env:            tc.Env,
				Lookup:         envparser.EnvironLookup(environ, false),
				BaseDir:        baseDir,
				DefaultEnv:     defaultEnv,
				EnvVars:        tc.EnvVars,
				Environ:        environ,
				MaxFileSize:    maxFileSize,
				LoadProcessEnv: tc.LoadProcessEnv,
			})

			assert.Equal(t, tc.Ignored, got.Ignored)

			if tc.Error != nil {
				var tooLarge *envparser.FileTooLargeError

				require.ErrorAs(t, err, &tooLarge)
				require.ErrorIs(t, err, envparser.ErrFileTooLarge)
				assert.Equal(t, baseDir+"/"+tc.Error.File, tooLarge.Path)
				assert.Equal(t, tc.Error.FileSize, tooLarge.Size)
				assert.InDelta(t, tc.Error.MaxSize, tooLarge.MaxSize, 0)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, tc.EnvName, got.EnvName)

			want := tc.Entries
			if want == nil {
				want = [][2]string{}
			}

			assert.Equal(t, want, entryPairs(got.Entries))
		})
	}
}

func TestReadDotenvFile(t *testing.T) {
	t.Parallel()

	dir := writeDotenvFiles(t, map[string]string{
		"bom.env":     "\xef\xbb\xbfA=1\n",
		"invalid.env": "A=x\xe2\x82y\xffz\n",
		"sized.env":   "A=12345\n",
	})

	cases := []struct {
		name    string
		file    string
		maxSize float64
		want    [][2]string
		tooBig  bool
	}{
		{name: "a missing file reads as empty", file: "missing.env", maxSize: math.Inf(1), want: [][2]string{}},
		{name: "a byte order mark is dropped", file: "bom.env", maxSize: math.Inf(1), want: [][2]string{{"A", "1"}}},
		{
			name:    "invalid UTF-8 reads as U+FFFD per maximal subpart",
			file:    "invalid.env",
			maxSize: math.Inf(1),
			want:    [][2]string{{"A", "x\ufffdy\ufffdz"}},
		},
		{name: "a file at the limit is read", file: "sized.env", maxSize: 8, want: [][2]string{{"A", "12345"}}},
		{name: "a fractional limit rounds down", file: "sized.env", maxSize: 8.5, want: [][2]string{{"A", "12345"}}},
		{name: "NaN sets no limit", file: "sized.env", maxSize: math.NaN(), want: [][2]string{{"A", "12345"}}},
		{name: "a file over the limit is refused", file: "sized.env", maxSize: 7, tooBig: true},
		{name: "a negative limit refuses every file", file: "sized.env", maxSize: -1, tooBig: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := envparser.ReadDotenvFile(filepath.Join(dir, tc.file), tc.maxSize, nil)
			if tc.tooBig {
				require.ErrorIs(t, err, envparser.ErrFileTooLarge)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, tc.want, entryPairs(got.Entries))
		})
	}
}

func TestReadDotenvFileReportsOtherErrors(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	require.NoError(t, os.Mkdir(filepath.Join(dir, ".env"), 0o700))

	_, err := envparser.ReadDotenvFile(filepath.Join(dir, ".env"), math.Inf(1), nil)
	require.Error(t, err)
	assert.False(t, errors.Is(err, envparser.ErrFileTooLarge))
}

func TestEnvironLookup(t *testing.T) {
	t.Parallel()

	environ := []envparser.DotenvEntry{{Key: "Path", Value: "/bin"}, {Key: "HOME", Value: "/home/a"}}

	exact := envparser.EnvironLookup(environ, false)
	_, ok := exact("PATH")
	assert.False(t, ok, "case-sensitive lookups need the exact name")

	value, ok := exact("HOME")
	assert.True(t, ok)
	assert.Equal(t, "/home/a", value)

	folded := envparser.EnvironLookup(environ, true)
	value, ok = folded("PATH")
	assert.True(t, ok, "case-insensitive lookups match any case")
	assert.Equal(t, "/bin", value)
}
