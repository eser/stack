package i18nfx_test

import (
	"html/template"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/i18nfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The "tr" fixtures hold English text with a "tr:" prefix, so the tests can
// tell which locale answered while every file stays in English.
const (
	enMessages = `
greeting = "Hello"
farewell = "Goodbye"
welcome = "Welcome, {{.Name}}"
items = "{{.Count}} items"
`
	trMessages = `
greeting = "tr: Hello"
welcome = "tr: Welcome, {{.Name}}"
`
)

// writeLocales writes each name/content pair into a new temporary directory
// and returns the directory.
func writeLocales(t *testing.T, files map[string]string) string {
	t.Helper()

	dir := t.TempDir()

	for name, content := range files {
		err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600)
		require.NoError(t, err)
	}

	return dir
}

func newTestLocalizer(t *testing.T) *i18nfx.Localizer {
	t.Helper()

	dir := writeLocales(t, map[string]string{
		"en.toml": enMessages,
		"tr.toml": trMessages,
	})

	localizer, err := i18nfx.NewLocalizer(&i18nfx.Config{DefaultLocale: "en", LocalesDir: dir})
	require.NoError(t, err)

	return localizer
}

func TestNewLocalizer_Errors(t *testing.T) {
	t.Parallel()

	cases := []struct {
		setup       func(t *testing.T) *i18nfx.Config
		wantIs      error
		name        string
		wantMessage string
	}{
		{
			name: "malformed default locale",
			setup: func(t *testing.T) *i18nfx.Config {
				t.Helper()

				dir := writeLocales(t, map[string]string{"en.toml": enMessages})

				return &i18nfx.Config{DefaultLocale: "not a locale!", LocalesDir: dir}
			},
			wantMessage: `parse default locale "not a locale!"`,
		},
		{
			name: "missing locales directory",
			setup: func(t *testing.T) *i18nfx.Config {
				t.Helper()

				missing := filepath.Join(t.TempDir(), "absent")

				return &i18nfx.Config{DefaultLocale: "en", LocalesDir: missing}
			},
			wantIs:      fs.ErrNotExist,
			wantMessage: "read locales directory",
		},
		{
			name: "malformed message file",
			setup: func(t *testing.T) *i18nfx.Config {
				t.Helper()

				dir := writeLocales(t, map[string]string{
					"en.toml": enMessages,
					"tr.toml": `greeting = "unterminated`,
				})

				return &i18nfx.Config{DefaultLocale: "en", LocalesDir: dir}
			},
			wantMessage: "tr.toml",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			localizer, err := i18nfx.NewLocalizer(tc.setup(t))

			require.Error(t, err)
			assert.Nil(t, localizer)
			assert.Contains(t, err.Error(), tc.wantMessage)

			if tc.wantIs != nil {
				assert.ErrorIs(t, err, tc.wantIs)
			}
		})
	}
}

// TestNewLocalizer_SkipsOtherEntries puts entries next to the message files
// that would fail to load if they were read: a file with another extension
// and a directory whose name ends in .toml.
func TestNewLocalizer_SkipsOtherEntries(t *testing.T) {
	t.Parallel()

	dir := writeLocales(t, map[string]string{
		"en.toml":    enMessages,
		"notes.yaml": "greeting: [unclosed",
	})
	require.NoError(t, os.Mkdir(filepath.Join(dir, "fr.toml"), 0o750))

	localizer, err := i18nfx.NewLocalizer(&i18nfx.Config{DefaultLocale: "en", LocalesDir: dir})

	require.NoError(t, err)
	assert.Equal(t, "Hello", localizer.T("en", "greeting"))
}

func TestLocalizer_T(t *testing.T) {
	t.Parallel()

	localizer := newTestLocalizer(t)

	cases := []struct {
		name      string
		locale    string
		messageID string
		want      string
	}{
		{name: "requested locale", locale: "tr", messageID: "greeting", want: "tr: Hello"},
		{name: "requested locale with a region", locale: "tr-TR", messageID: "greeting", want: "tr: Hello"},
		{name: "default locale", locale: "en", messageID: "greeting", want: "Hello"},
		{
			name:      "message missing in the requested locale falls back to the default locale",
			locale:    "tr",
			messageID: "farewell",
			want:      "Goodbye",
		},
		{name: "locale without messages uses the default locale", locale: "fr", messageID: "greeting", want: "Hello"},
		{name: "empty locale uses the default locale", locale: "", messageID: "greeting", want: "Hello"},
		{name: "malformed locale uses the default locale", locale: "not a locale!", messageID: "greeting", want: "Hello"},
		{name: "unknown message returns its ID", locale: "tr", messageID: "missing.id", want: "missing.id"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tc.want, localizer.T(tc.locale, tc.messageID))
		})
	}
}

func TestLocalizer_TWithData(t *testing.T) {
	t.Parallel()

	localizer := newTestLocalizer(t)

	cases := []struct {
		data      map[string]any
		name      string
		locale    string
		messageID string
		want      string
	}{
		{
			name:      "requested locale",
			locale:    "tr",
			messageID: "welcome",
			data:      map[string]any{"Name": "Ada"},
			want:      "tr: Welcome, Ada",
		},
		{
			name:      "message missing in the requested locale falls back to the default locale",
			locale:    "tr",
			messageID: "items",
			data:      map[string]any{"Count": 3},
			want:      "3 items",
		},
		{
			name:      "unknown message returns its ID",
			locale:    "en",
			messageID: "missing.id",
			data:      map[string]any{"Name": "Ada"},
			want:      "missing.id",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tc.want, localizer.TWithData(tc.locale, tc.messageID, tc.data))
		})
	}
}

func TestLocalizer_TemplateFuncMap(t *testing.T) {
	t.Parallel()

	localizer := newTestLocalizer(t)

	page, err := template.New("page").
		Funcs(localizer.TemplateFuncMap()).
		Parse(`<p dir="{{dir .Locale}}">{{t .Locale "greeting"}}</p>`)
	require.NoError(t, err)

	cases := []struct {
		name   string
		locale string
		want   string
	}{
		{name: "left-to-right locale", locale: "tr", want: `<p dir="ltr">tr: Hello</p>`},
		{name: "right-to-left locale without messages", locale: "ar", want: `<p dir="rtl">Hello</p>`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			var out strings.Builder

			err := page.Execute(&out, map[string]string{"Locale": tc.locale})

			require.NoError(t, err)
			assert.Equal(t, tc.want, out.String())
		})
	}
}
