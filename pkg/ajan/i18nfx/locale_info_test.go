package i18nfx_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/i18nfx"
	"github.com/stretchr/testify/assert"
)

func TestIsRTLAndDir(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		locale  string
		wantRTL bool
	}{
		{name: "arabic", locale: "ar", wantRTL: true},
		{name: "arabic with a region", locale: "ar-EG", wantRTL: true},
		{name: "hebrew", locale: "he", wantRTL: true},
		{name: "persian", locale: "fa", wantRTL: true},
		{name: "urdu", locale: "ur", wantRTL: true},
		{name: "dhivehi in thaana", locale: "dv", wantRTL: true},
		{name: "azerbaijani with an explicit arabic script", locale: "az-Arab", wantRTL: true},
		{name: "azerbaijani defaults to latin", locale: "az", wantRTL: false},
		{name: "english", locale: "en", wantRTL: false},
		{name: "turkish with a region", locale: "tr-TR", wantRTL: false},
		{name: "undetermined language", locale: "und", wantRTL: false},
		{name: "empty string", locale: "", wantRTL: false},
		{name: "malformed tag", locale: "not a locale!", wantRTL: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			wantDir := "ltr"
			if tc.wantRTL {
				wantDir = "rtl"
			}

			assert.Equal(t, tc.wantRTL, i18nfx.IsRTL(tc.locale), "IsRTL(%q)", tc.locale)
			assert.Equal(t, wantDir, i18nfx.Dir(tc.locale), "Dir(%q)", tc.locale)
		})
	}
}
