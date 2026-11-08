// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"encoding/json"
	"testing"
)

func TestBridgeCryptoHashCombined(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		request   string
		wantHash  string
		wantError string
	}{
		{
			name:     "the algorithm defaults to SHA-256 and the length to the full digest",
			request:  `{"parts":["aGVs","bG8="]}`,
			wantHash: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		},
		{
			name:     "an empty request hashes zero bytes",
			request:  `{"length":16}`,
			wantHash: "e3b0c44298fc1c14",
		},
		{
			name:      "a part that is not base64 names its index",
			request:   `{"parts":["aGVs","not base64!"]}`,
			wantError: "invalid base64 in parts[1]: illegal base64 data at input byte 3",
		},
		{
			name:      "an unknown algorithm is refused",
			request:   `{"parts":[],"algorithm":"MD5"}`,
			wantError: `unknown hash algorithm: "MD5"`,
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

			var got cryptoHashResponse
			if err := json.Unmarshal([]byte(bridgeCryptoHashCombined(tc.request)), &got); err != nil {
				t.Fatalf("decode answer: %v", err)
			}

			if got.Hash != tc.wantHash || got.Error != tc.wantError {
				t.Errorf("got %+v, want hash %q and error %q", got, tc.wantHash, tc.wantError)
			}
		})
	}
}
