// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package cryptofx_test

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/cryptofx"
)

// The fixtures in testdata/ are shared with the TypeScript tests of
// @eserstack/crypto, which run the same cases through the bridge.

type combinedHashCase struct {
	Name      string   `json:"name"`
	Algorithm string   `json:"algorithm"`
	Hash      string   `json:"hash"`
	Error     string   `json:"error"`
	Parts     []string `json:"parts"`
	Length    int      `json:"length"`
}

func readCombinedHashes(t *testing.T) []combinedHashCase {
	t.Helper()

	raw, err := os.ReadFile(filepath.Join("testdata", "combined_hashes.json"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	var cases []combinedHashCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("decode fixture: %v", err)
	}

	return cases
}

func TestHashCombinedFixtures(t *testing.T) {
	t.Parallel()

	for _, tc := range readCombinedHashes(t) {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			parts := make([][]byte, 0, len(tc.Parts))
			for _, part := range tc.Parts {
				decoded, err := base64.StdEncoding.DecodeString(part)
				if err != nil {
					t.Fatalf("decode part %q: %v", part, err)
				}

				parts = append(parts, decoded)
			}

			got, err := cryptofx.HashCombined(parts, cryptofx.HashAlgorithm(tc.Algorithm), tc.Length)

			if tc.Error != "" {
				if err == nil || !strings.Contains(err.Error(), tc.Error) {
					t.Fatalf("expected an error containing %q, got %v", tc.Error, err)
				}

				if !errors.Is(err, cryptofx.ErrUnknownAlgorithm) {
					t.Errorf("expected ErrUnknownAlgorithm, got %v", err)
				}

				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if got != tc.Hash {
				t.Errorf("got %q, want %q", got, tc.Hash)
			}
		})
	}
}
