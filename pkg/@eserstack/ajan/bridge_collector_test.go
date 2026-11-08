// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestBridgeCollectorSpecifierToIdentifier(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		request   string
		want      string
		wantError string
	}{
		{
			name:    "a used identifier gets the next free counter",
			request: `{"specifier":"foo/bar.ts","used":["foo_bar","foo_bar_1"]}`,
			want:    "foo_bar_2",
		},
		{
			name:    "an empty specifier answers an empty identifier",
			request: `{"specifier":""}`,
			want:    "",
		},
		{
			name:      "a request that is not JSON is refused",
			request:   `{`,
			wantError: "invalid request JSON: unexpected end of JSON input",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			answer := bridgeCollectorSpecifierToIdentifier(tc.request)

			var got map[string]string
			if err := json.Unmarshal([]byte(answer), &got); err != nil {
				t.Fatalf("decode answer: %v", err)
			}

			if tc.wantError != "" {
				if got["error"] != tc.wantError {
					t.Errorf("got %s, want error %q", answer, tc.wantError)
				}

				return
			}

			if identifier, ok := got["identifier"]; !ok || identifier != tc.want || got["error"] != "" {
				t.Errorf("got %s, want identifier %q", answer, tc.want)
			}
		})
	}
}

func TestBridgeCollectorGenerateManifest(t *testing.T) {
	t.Parallel()

	var got collectorManifestResponse

	answer := bridgeCollectorGenerateManifest(`{"entries":[{"relPath":"b.ts","exports":["y"]},{"relPath":"a.ts","exports":["x"]}]}`)
	if err := json.Unmarshal([]byte(answer), &got); err != nil {
		t.Fatalf("decode answer: %v", err)
	}

	want := `import * as $$a from "./a.ts";
import * as $$b from "./b.ts";

export const manifest = {
  "exports": [
    $$a.x,
    $$b.y
  ]
};
`
	if got.Error != "" || !strings.HasSuffix(got.Source, want) {
		t.Errorf("got %+v, want a source ending in\n%s", got, want)
	}

	if err := json.Unmarshal([]byte(bridgeCollectorGenerateManifest(`{`)), &got); err != nil {
		t.Fatalf("decode answer: %v", err)
	}

	if got.Error != "invalid request JSON: unexpected end of JSON input" {
		t.Errorf("got error %q for a request that is not JSON", got.Error)
	}
}
