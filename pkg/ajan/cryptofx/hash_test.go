// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package cryptofx_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/cryptofx"
)

func TestHashString(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		input     string
		algo      cryptofx.HashAlgorithm
		length    int
		wantLen   int // expected length of result (0 = check exact)
		wantExact string
	}{
		{
			name:    "SHA-256 full digest",
			input:   "hello",
			algo:    cryptofx.SHA256,
			length:  0,
			wantLen: 64, // SHA-256 → 32 bytes → 64 hex chars
		},
		{
			name:    "SHA-256 truncated to 16",
			input:   "hello",
			algo:    cryptofx.SHA256,
			length:  16,
			wantLen: 16,
		},
		{
			name:    "SHA-1 full digest",
			input:   "hello",
			algo:    cryptofx.SHA1,
			length:  0,
			wantLen: 40, // SHA-1 → 20 bytes → 40 hex chars
		},
		{
			name:    "SHA-384 full digest",
			input:   "hello",
			algo:    cryptofx.SHA384,
			length:  0,
			wantLen: 96,
		},
		{
			name:    "SHA-512 full digest",
			input:   "hello",
			algo:    cryptofx.SHA512,
			length:  0,
			wantLen: 128,
		},
		{
			// Known SHA-256("") = e3b0c44298fc1c14...
			name:      "empty string SHA-256",
			input:     "",
			algo:      cryptofx.SHA256,
			length:    0,
			wantExact: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := cryptofx.HashString(tc.input, tc.algo, tc.length)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if tc.wantExact != "" && got != tc.wantExact {
				t.Errorf("HashString() = %q, want %q", got, tc.wantExact)
			}

			if tc.wantLen > 0 && len(got) != tc.wantLen {
				t.Errorf("HashString() len = %d, want %d (got %q)", len(got), tc.wantLen, got)
			}

			// Result must be lowercase hex.
			if got != strings.ToLower(got) {
				t.Errorf("HashString() result is not lowercase hex: %q", got)
			}
		})
	}
}

func TestHashStringUnknownAlgorithm(t *testing.T) {
	t.Parallel()

	_, err := cryptofx.HashString("hello", "MD5", 0)
	if err == nil {
		t.Fatal("expected error for unknown algorithm, got nil")
	}

	if !errors.Is(err, cryptofx.ErrUnknownAlgorithm) {
		t.Errorf("expected ErrUnknownAlgorithm, got %v", err)
	}
}

func TestHashCombined(t *testing.T) {
	t.Parallel()

	parts := [][]byte{[]byte("hello"), []byte(" "), []byte("world")}

	got, err := cryptofx.HashCombined(parts, cryptofx.SHA256, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Compare with hashing the concatenation directly.
	want, err := cryptofx.HashString("hello world", cryptofx.SHA256, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if got != want {
		t.Errorf("HashCombined() = %q, want %q", got, want)
	}
}

func TestHashHexTruncation(t *testing.T) {
	t.Parallel()

	// length larger than digest should return full digest.
	full, _ := cryptofx.HashHex([]byte("hello"), cryptofx.SHA256, 0)
	truncated, err := cryptofx.HashHex([]byte("hello"), cryptofx.SHA256, 999)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if truncated != full {
		t.Errorf("length > digest len should return full: got %q, want %q", truncated, full)
	}
}
