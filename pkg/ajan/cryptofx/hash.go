// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package cryptofx

import (
	"crypto/sha1" //nolint:gosec // SHA-1 is supported for compatibility; callers should prefer SHA-256+
	"crypto/sha256"
	"crypto/sha512"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
)

// HashAlgorithm identifies a supported digest algorithm.
// Names match the Web Crypto API for cross-platform parity.
type HashAlgorithm string

const (
	SHA1   HashAlgorithm = "SHA-1"
	SHA256 HashAlgorithm = "SHA-256"
	SHA384 HashAlgorithm = "SHA-384"
	SHA512 HashAlgorithm = "SHA-512"
)

// ErrUnknownAlgorithm is returned when an unsupported algorithm is requested.
var ErrUnknownAlgorithm = errors.New("unknown hash algorithm")

// newHasher returns a fresh hash.Hash for the given algorithm.
func newHasher(algo HashAlgorithm) (hash.Hash, error) {
	switch algo {
	case SHA1:
		return sha1.New(), nil //nolint:gosec // intentional SHA-1 support
	case SHA256:
		return sha256.New(), nil
	case SHA384:
		return sha512.New384(), nil
	case SHA512:
		return sha512.New(), nil
	default:
		return nil, fmt.Errorf("%w: %q", ErrUnknownAlgorithm, algo)
	}
}

// Hash computes the digest of data and returns the raw bytes.
func Hash(data []byte, algo HashAlgorithm) ([]byte, error) {
	h, err := newHasher(algo)
	if err != nil {
		return nil, err
	}

	h.Write(data)

	return h.Sum(nil), nil
}

// HashHex computes the digest and returns it as a lowercase hex string.
// If length > 0 it is truncated to that many characters.
func HashHex(data []byte, algo HashAlgorithm, length int) (string, error) {
	digest, err := Hash(data, algo)
	if err != nil {
		return "", err
	}

	hexStr := hex.EncodeToString(digest)

	if length > 0 && length < len(hexStr) {
		return hexStr[:length], nil
	}

	return hexStr, nil
}

// HashString hashes a UTF-8 string, returning the first `length` chars of hex.
// If length <= 0 the full digest is returned.
func HashString(s string, algo HashAlgorithm, length int) (string, error) {
	return HashHex([]byte(s), algo, length)
}

// HashCombined concatenates multiple byte slices and hashes them together.
func HashCombined(parts [][]byte, algo HashAlgorithm, length int) (string, error) {
	h, err := newHasher(algo)
	if err != nil {
		return "", err
	}

	for _, part := range parts {
		h.Write(part)
	}

	hexStr := hex.EncodeToString(h.Sum(nil))

	if length > 0 && length < len(hexStr) {
		return hexStr[:length], nil
	}

	return hexStr, nil
}
