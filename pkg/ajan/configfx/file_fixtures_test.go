// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package configfx_test

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"testing"

	"github.com/eser/stack/pkg/ajan/configfx"
	"github.com/eser/stack/pkg/ajan/configfx/jsonparser"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testdata/file_cases.json was written from what @eserstack/config/file
// answered when it located and parsed files in TypeScript; its bridge.test.ts
// runs the same cases through the bridge and the public functions. The files
// are written to a temporary directory, because the broken ones would fail
// the repository's own JSON and TOML validators.

type formatCase struct {
	Path   string `json:"path"`
	Format int    `json:"format"`
}

type locateCase struct {
	Want          *string  `json:"want"`
	Name          string   `json:"name"`
	BaseDir       string   `json:"baseDir"`
	Filenames     []string `json:"filenames"`
	SearchParents bool     `json:"searchParents"`
}

type parseCase struct {
	Format     *int            `json:"format"`
	Name       string          `json:"name"`
	Path       string          `json:"path"`
	DecodedBy  string          `json:"decodedBy"`
	ErrorCode  string          `json:"errorCode"`
	Error      string          `json:"error"`
	Content    json.RawMessage `json:"content"`
	WantFormat int             `json:"wantFormat"`
}

type fileFixture struct {
	Files   map[string]string `json:"files"`
	Formats []formatCase      `json:"formats"`
	Locate  []locateCase      `json:"locate"`
	Parse   []parseCase       `json:"parse"`
}

func readFileFixture(t *testing.T) (fileFixture, string) {
	t.Helper()

	raw, err := os.ReadFile(filepath.Join("testdata", "file_cases.json"))
	require.NoError(t, err)

	var fixture fileFixture
	require.NoError(t, json.Unmarshal(raw, &fixture))

	root := t.TempDir()
	for name, content := range fixture.Files {
		path := filepath.Join(root, filepath.FromSlash(name))
		require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o700))
		require.NoError(t, os.WriteFile(path, []byte(content), 0o600))
	}

	return fixture, root
}

func TestFileFormatOfFixtures(t *testing.T) {
	t.Parallel()

	fixture, _ := readFileFixture(t)
	require.NotEmpty(t, fixture.Formats)

	for _, tc := range fixture.Formats {
		assert.Equal(t, configfx.FileFormat(tc.Format), configfx.FileFormatOf(tc.Path, configfx.PathStylePOSIX), "path %q", tc.Path)
	}
}

func TestFileFormatOfWindowsPaths(t *testing.T) {
	t.Parallel()

	cases := []struct {
		path  string
		posix configfx.FileFormat
		win   configfx.FileFormat
	}{
		{`dir\.env`, configfx.FileFormatEnvironment, configfx.FileFormatUnknown},
		{`C:\app\config.json`, configfx.FileFormatJSON, configfx.FileFormatJSON},
		{`C:.env`, configfx.FileFormatEnvironment, configfx.FileFormatUnknown},
		{`C:config.yml`, configfx.FileFormatYAML, configfx.FileFormatYAML},
	}

	for _, tc := range cases {
		assert.Equal(t, tc.posix, configfx.FileFormatOf(tc.path, configfx.PathStylePOSIX), "posix %q", tc.path)
		assert.Equal(t, tc.win, configfx.FileFormatOf(tc.path, configfx.PathStyleWindows), "windows %q", tc.path)
	}
}

func TestLocateFileFixtures(t *testing.T) {
	t.Parallel()

	fixture, root := readFileFixture(t)
	require.NotEmpty(t, fixture.Locate)

	for _, tc := range fixture.Locate {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			got, found := configfx.LocateFile(
				filepath.Join(root, filepath.FromSlash(tc.BaseDir)),
				tc.Filenames,
				configfx.LocateOptions{SearchParents: tc.SearchParents},
			)

			if tc.Want == nil {
				assert.False(t, found, "found %q", got)

				return
			}

			require.True(t, found)
			assert.Equal(t, filepath.Join(root, filepath.FromSlash(*tc.Want)), got)
		})
	}
}

func TestParseFileFixtures(t *testing.T) {
	t.Parallel()

	fixture, root := readFileFixture(t)
	require.NotEmpty(t, fixture.Parse)

	for _, tc := range fixture.Parse {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			path := filepath.Join(root, filepath.FromSlash(tc.Path))

			var opts configfx.ParseFileOptions
			if tc.Format != nil {
				format := configfx.FileFormat(*tc.Format)
				opts.Format = &format
			}

			got, err := configfx.ParseFile(path, opts)

			switch {
			case tc.ErrorCode == "not_found":
				require.ErrorIs(t, err, fs.ErrNotExist)
			case tc.DecodedBy == "typescript":
				// The caller decodes YAML and TOML, and reports their errors.
				require.NoError(t, err)
				assert.Equal(t, configfx.FileFormat(tc.WantFormat), got.Format)
				assert.Equal(t, fixture.Files[tc.Path], got.Text)
				assert.Nil(t, got.Content)
			case tc.ErrorCode == "parse":
				require.ErrorIs(t, err, configfx.ErrFileParse)
				require.ErrorIs(t, err, jsonparser.ErrSyntax)
				assert.Contains(t, err.Error(), tc.Error)

				var parseErr *configfx.FileParseError

				require.ErrorAs(t, err, &parseErr)
				assert.Equal(t, configfx.FileFormat(tc.WantFormat), parseErr.Format)
			default:
				require.NoError(t, err)
				assert.Equal(t, configfx.FileFormat(tc.WantFormat), got.Format)

				if string(tc.Content) == "null" {
					assert.Nil(t, got.Content)

					return
				}

				assert.JSONEq(t, string(tc.Content), string(got.Content))
			}
		})
	}
}

func TestParseFileKeepsKeyOrder(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "ordered.jsonc")
	require.NoError(t, os.WriteFile(path, []byte(`{"z": 1, /* c */ "a": {"y": 2, "b": 3,},}`), 0o600))

	got, err := configfx.ParseFile(path, configfx.ParseFileOptions{}) //nolint:exhaustruct
	require.NoError(t, err)

	compact, err := json.Marshal(got.Content)
	require.NoError(t, err)
	assert.JSONEq(t, `{"z":1,"a":{"y":2,"b":3}}`, string(compact))
	assert.Equal(t, `{"z":1,"a":{"y":2,"b":3}}`, string(compact))
}
