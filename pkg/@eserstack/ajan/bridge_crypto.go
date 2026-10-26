// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1 || eserajan_wasi

package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"

	"github.com/eser/stack/pkg/ajan/cryptofx"
)

// ---------------------------------------------------------------------------
// Crypto bridge — wire types
// ---------------------------------------------------------------------------

type cryptoHashRequest struct {
	// Data is the base64-encoded binary input. Mutually exclusive with Text.
	Data string `json:"data,omitempty"`
	// Text is the UTF-8 string input. Used by hashString calls.
	Text      string `json:"text,omitempty"`
	Algorithm string `json:"algorithm,omitempty"` // default: "SHA-256"
	Length    int    `json:"length,omitempty"`    // 0 = full digest
}

type cryptoHashResponse struct {
	Hash  string `json:"hash,omitempty"`
	Error string `json:"error,omitempty"`
}

// ---------------------------------------------------------------------------
// Crypto bridge functions
// ---------------------------------------------------------------------------

// bridgeCryptoHash hashes binary (base64-encoded) or text input with the
// requested algorithm. Returns JSON: { hash: string } | { error: string }.
func bridgeCryptoHash(requestJSON string) string {
	var req cryptoHashRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(cryptoHashResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	algo := cryptofx.HashAlgorithm(req.Algorithm)
	if algo == "" {
		algo = cryptofx.SHA256
	}

	var result string
	var err error

	switch {
	case req.Text != "":
		result, err = cryptofx.HashString(req.Text, algo, req.Length)

	case req.Data != "":
		raw, decErr := base64.StdEncoding.DecodeString(req.Data)
		if decErr != nil {
			return marshalResponse(cryptoHashResponse{Error: "invalid base64 in data: " + decErr.Error()}) //nolint:exhaustruct
		}

		result, err = cryptofx.HashHex(raw, algo, req.Length)

	default:
		// Empty input — hash zero bytes.
		result, err = cryptofx.HashHex([]byte{}, algo, req.Length)
	}

	if err != nil {
		return marshalResponse(cryptoHashResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(cryptoHashResponse{Hash: result}) //nolint:exhaustruct
}

func init() {
	register("cryptoHash", bridgeCryptoHash)
}
